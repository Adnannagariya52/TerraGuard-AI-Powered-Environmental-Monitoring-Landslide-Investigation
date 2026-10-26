from app import normalize, evaluate_risk

example = {
    "device_id": "NODE_01",
    "coordinates": {"latitude": 18.52, "longitude": 73.85},
    "sensors": {
        "soil_moisture_pct": 76.2,
        "rain_pct": 72.0,
        "tilt_detected": False,
        "ground_distance_cm": 48.7,
        "ground_shift_cm": 2.4,
    },
}
data = normalize(example)
risk, flags = evaluate_risk(data)
print({"risk": risk, "flags": flags, "normalized": data})
