# TerraGuard ESP32 Firmware

Arduino firmware for an ESP32 Dev Module with analog soil/rain inputs, a tilt switch/module, and an HC-SR04 ultrasonic distance sensor.

## Configure safely

1. Copy `secrets.example.h` to `secrets.h`.
2. Set your Wi-Fi SSID/password, the backend laptop's current LAN IPv4, and confirmed fixed site coordinates. `secrets.h` is ignored by Git; never commit it.
3. Ensure the ESP32 and backend can communicate over the same private/routable network. The endpoint is `http://<SERVER_IP>:8000/api/telemetry`; the server must listen on the LAN interface. Do not expose this plain-HTTP prototype endpoint to the public internet.
4. In Arduino IDE select **ESP32 Dev Module**, install ArduinoJson 7.x, compile, select the correct COM port, and upload only to the intended board. Serial Monitor is 115200 baud.

## Existing pin map and diagnostics

- Soil analog: GPIO34; rain analog: GPIO35
- Tilt input: GPIO27 (configured active LOW with pull-up by default)
- HC-SR04: TRIG GPIO5, ECHO GPIO18 through a voltage divider; ESP32 pins are not 5 V tolerant
- Serial `r`: raw/calibrated values; `t`: tilt polarity diagnostics; `c`: recalibrate the ultrasonic baseline with monitored ground undisturbed

Calibrate dry/wet ADC values on the actual sensors before relying on percentages. Coordinates are fixed config, not GPS. The HC-SR04 measures distance to its target; a changed distance alone is not proof of landslide movement. Confirm wiring and thresholds before field use.
