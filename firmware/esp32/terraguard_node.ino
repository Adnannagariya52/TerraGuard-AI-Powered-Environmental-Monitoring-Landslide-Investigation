/*
  TerraGuard - ESP32 Edge Node Firmware
  --------------------------------------
  Reads: Soil Moisture, Rain, Tilt switch, Ultrasonic (HC-SR04)
  Sends: JSON via HTTP POST to http://<SERVER_IP>:8000/api/telemetry every 2 s

  Libraries (Library Manager):
    - ArduinoJson  by Benoit Blanchon (version 7.x)
  Board: "ESP32 Dev Module"  |  Serial Monitor: 115200 baud

  Serial commands:
    c  -> re-calibrate ultrasonic baseline (keep ground undisturbed!)
    r  -> print raw and calibrated sensor values
    t  -> print tilt pin levels to confirm active polarity
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ====================== USER CONFIG ======================
#include "secrets.h"  // Create from secrets.example.h; this local file is git-ignored.

const char* DEVICE_ID = "NODE_01";
// Fixed site coordinates are configured in secrets.h; this sketch has no GPS.

// ---- Pins ----
const int PIN_SOIL = 34;   // ADC1
const int PIN_RAIN = 35;   // ADC1
const int PIN_TILT = 27;
const int PIN_TRIG = 5;
const int PIN_ECHO = 18;   // through voltage divider!

// ---- Sensor calibration (run 'r' in Serial Monitor to find your values) ----
// Capacitive soil sensor: HIGH raw value in air/dry, LOW raw value in water.
const int SOIL_RAW_DRY = 3200;
const int SOIL_RAW_WET = 1300;
// Rain module (AO): HIGH raw when dry, LOW raw when soaked.
const int RAIN_RAW_DRY = 4095;
const int RAIN_RAW_WET = 1200;

// Tilt: which logic level means "tilted"?
// Bare SW-520D switch with INPUT_PULLUP -> tilted reads LOW (leave as is).
// For a module with DO pin, flip this if your logic is reversed.
const int  TILT_ACTIVE_LEVEL = LOW;
const bool TILT_USE_PULLUP   = true;   // set false for modules that drive the pin

// Ultrasonic baseline: set a fixed value (cm) or -1 to auto-calibrate at boot
const float FIXED_BASELINE_CM = -1;

// Timing
const unsigned long SEND_INTERVAL_MS   = 2000;
const unsigned long WIFI_RETRY_MS      = 10000;
const uint16_t      HTTP_TIMEOUT_MS    = 3000;
// ==========================================================

float baselineDistanceCm = 0;
float lastValidDistanceCm = -1;
int lastTiltPinLevel = HIGH;
unsigned long lastSend = 0;
unsigned long lastWifiAttempt = 0;

// ---------- Helpers ----------
float round1(float v) { return roundf(v * 10.0f) / 10.0f; }

int readAnalogAvg(int pin, int samples = 16) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return sum / samples;
}

float rawToPercent(int raw, int rawDry, int rawWet) {
  // Maps rawDry -> 0 %, rawWet -> 100 %. Equal calibration points are invalid.
  if (rawDry == rawWet) return 0.0f;
  float pct = (float)(rawDry - raw) * 100.0f / (float)(rawDry - rawWet);
  return constrain(pct, 0.0f, 100.0f);
}

float readSoilPct() { return rawToPercent(readAnalogAvg(PIN_SOIL), SOIL_RAW_DRY, SOIL_RAW_WET); }
float readRainPct() { return rawToPercent(readAnalogAvg(PIN_RAIN), RAIN_RAW_DRY, RAIN_RAW_WET); }

// Majority vote over 5 reads to ignore vibration/bounce
bool readTilt() {
  int hits = 0;
  for (int i = 0; i < 5; i++) {
    lastTiltPinLevel = digitalRead(PIN_TILT);
    if (lastTiltPinLevel == TILT_ACTIVE_LEVEL) hits++;
    delay(10);
  }
  return hits >= 3;
}

// Single ultrasonic ping, returns cm or -1 on timeout
float pingOnceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long dur = pulseIn(PIN_ECHO, HIGH, 30000UL);  // 30 ms ~ 5 m
  if (dur == 0) return -1;
  return dur * 0.0343f / 2.0f;
}

// Median of 7 pings -> robust against noise spikes
float readDistanceCm() {
  float vals[7];
  int n = 0;
  for (int i = 0; i < 7; i++) {
    float d = pingOnceCm();
    if (d > 2.0f && d < 400.0f) vals[n++] = d;
    delay(30);
  }
  if (n < 3) return -1;  // too many failed readings
  for (int i = 0; i < n - 1; i++)           // simple sort
    for (int j = i + 1; j < n; j++)
      if (vals[j] < vals[i]) { float t = vals[i]; vals[i] = vals[j]; vals[j] = t; }
  return vals[n / 2];
}

void calibrateBaseline() {
  Serial.println("[CAL] Calibrating ultrasonic baseline...");
  float sum = 0; int good = 0;
  for (int i = 0; i < 10; i++) {
    float d = readDistanceCm();
    if (d > 0) { sum += d; good++; }
  }
  if (good > 0) {
    baselineDistanceCm = sum / good;
    lastValidDistanceCm = baselineDistanceCm;
    Serial.printf("[CAL] Baseline = %.1f cm\n", baselineDistanceCm);
  } else {
    Serial.println("[CAL] FAILED - check ultrasonic wiring. Baseline unchanged.");
  }
}

void printRaw() {
  int soilRaw = readAnalogAvg(PIN_SOIL);
  int rainRaw = readAnalogAvg(PIN_RAIN);
  bool tilted = readTilt();
  float dist = readDistanceCm();
  float shift = (dist > 0 && baselineDistanceCm > 0) ? baselineDistanceCm - dist : 0;
  Serial.printf("[RAW] soil_raw=%d soil_pct=%.1f rain_raw=%d rain_pct=%.1f tilt_pin=%d active_level=%d tilt_triggered=%s\n",
                soilRaw, rawToPercent(soilRaw, SOIL_RAW_DRY, SOIL_RAW_WET),
                rainRaw, rawToPercent(rainRaw, RAIN_RAW_DRY, RAIN_RAW_WET),
                lastTiltPinLevel, TILT_ACTIVE_LEVEL, tilted ? "true" : "false");
  if (dist > 0) Serial.printf("[RAW] distance=%.1f cm baseline=%.1f cm ground_shift=%.1f cm\n",
                             dist, baselineDistanceCm, shift);
  else Serial.printf("[RAW] distance unavailable; baseline=%.1f cm\n", baselineDistanceCm);
}

void printTiltDiagnostic() {
  Serial.printf("[TILT] Active level is %s; INPUT_PULLUP=%s. Sample levels: ",
                TILT_ACTIVE_LEVEL == HIGH ? "HIGH" : "LOW",
                TILT_USE_PULLUP ? "true" : "false");
  int low = 0;
  int high = 0;
  for (int i = 0; i < 10; i++) {
    int level = digitalRead(PIN_TILT);
    Serial.printf("%d ", level);
    if (level == LOW) low++; else high++;
    delay(25);
  }
  Serial.printf("\n[TILT] low=%d high=%d. Change TILT_ACTIVE_LEVEL / TILT_USE_PULLUP if polarity or module wiring differs.\n",
                low, high);
}

// ---------- WiFi ----------
void connectWiFi(bool blocking) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
  if (!blocking) return;
  Serial.print("[WiFi] Connecting");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("\n[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("\n[WiFi] Not connected yet, will keep retrying.");
}

// ---------- Telemetry ----------
bool sendTelemetry() {
  float soil = readSoilPct();
  float rain = readRainPct();
  bool  tilt = readTilt();
  float dist = readDistanceCm();
  if (dist > 0) lastValidDistanceCm = dist;

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["coordinates"]["lat"] = DEVICE_LAT;
  doc["coordinates"]["lon"] = DEVICE_LON;
  JsonObject s = doc["sensors"].to<JsonObject>();
  s["soil_moisture_pct"] = round1(soil);
  s["rain_pct"] = round1(rain);
  s["tilt_detected"] = tilt;
  s["tilt_pin_level"] = lastTiltPinLevel;
  if (dist > 0) s["ground_distance_cm"] = round1(dist);
  else          s["ground_distance_cm"] = nullptr;   // sensor failed this cycle
  if (baselineDistanceCm > 0) s["baseline_distance_cm"] = round1(baselineDistanceCm);
  else                        s["baseline_distance_cm"] = nullptr;
  if (dist > 0 && baselineDistanceCm > 0) s["ground_shift_cm"] = round1(baselineDistanceCm - dist);
  else                                    s["ground_shift_cm"] = nullptr;

  String body;
  serializeJson(doc, body);
  Serial.println("[TX] " + body);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[TX] Skipped - WiFi down");
    return false;
  }

  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/telemetry";
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  if (code > 0) Serial.printf("[TX] Server responded: %d\n", code);
  else          Serial.printf("[TX] POST failed: %s\n", http.errorToString(code).c_str());
  http.end();
  return code >= 200 && code < 300;
}

// ---------- Arduino ----------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== TerraGuard Node Booting ===");

  analogReadResolution(12);                       // 0..4095
  analogSetPinAttenuation(PIN_SOIL, ADC_11db);    // full 0-3.3 V range
  analogSetPinAttenuation(PIN_RAIN, ADC_11db);

  pinMode(PIN_TILT, TILT_USE_PULLUP ? INPUT_PULLUP : INPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  if (FIXED_BASELINE_CM > 0) {
    baselineDistanceCm = FIXED_BASELINE_CM;
    lastValidDistanceCm = FIXED_BASELINE_CM;
    Serial.printf("[CAL] Using fixed baseline %.1f cm\n", baselineDistanceCm);
  } else {
    calibrateBaseline();
  }

  connectWiFi(true);
}

void loop() {
  // Serial commands
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'c') calibrateBaseline();
    if (c == 'r') printRaw();
    if (c == 't') printTiltDiagnostic();
  }

  // Non-blocking WiFi reconnect
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiAttempt > WIFI_RETRY_MS) {
    Serial.println("[WiFi] Reconnecting...");
    WiFi.disconnect();
    connectWiFi(false);
  }

  // Fast telemetry loop (2 s)
  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();
    sendTelemetry();
  }
}
