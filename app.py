"""
PULSE — Diabetes Risk Monitor
Flask backend: serves the static frontend and exposes /api/predict
"""

import json
import os
import pickle

import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}})

FEATURES = [
    "Pregnancies", "Glucose", "BloodPressure", "SkinThickness",
    "Insulin", "BMI", "DiabetesPedigreeFunction", "Age",
]

with open(os.path.join(MODEL_DIR, "model.pkl"), "rb") as f:
    model = pickle.load(f)

with open(os.path.join(MODEL_DIR, "scaler.pkl"), "rb") as f:
    scaler = pickle.load(f)

with open(os.path.join(MODEL_DIR, "meta.json"), "r") as f:
    META = json.load(f)


def risk_band(probability):
    if probability < 0.25:
        return "low"
    if probability < 0.5:
        return "guarded"
    if probability < 0.75:
        return "elevated"
    return "high"


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/api/meta", methods=["GET"])
def meta():
    return jsonify(META)


@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body."}), 400

    missing = [f for f in FEATURES if f not in payload]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        values = [float(payload[f]) for f in FEATURES]
    except (TypeError, ValueError):
        return jsonify({"error": "All fields must be numeric."}), 400

    input_array = np.asarray(values).reshape(1, -1)
    std_input = scaler.transform(input_array)

    prediction = int(model.predict(std_input)[0])
    probability = float(model.predict_proba(std_input)[0][1])

    return jsonify({
        "prediction": prediction,
        "result": "Diabetic" if prediction == 1 else "Not Diabetic",
        "probability": round(probability, 4),
        "risk_band": risk_band(probability),
        "input": dict(zip(FEATURES, values)),
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
