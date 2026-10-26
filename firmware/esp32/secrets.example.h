#pragma once

// Copy to secrets.h and edit locally. secrets.h is ignored by Git.
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// Laptop/server LAN IPv4 from ipconfig; never use localhost for an ESP32.
const char* SERVER_IP = "YOUR_SERVER_LAN_IP";
const int SERVER_PORT = 8000;
const double DEVICE_LAT = 0.0; // Set confirmed fixed site coordinates, or use 0 if unknown.
const double DEVICE_LON = 0.0;
