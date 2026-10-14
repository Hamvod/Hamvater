from __future__ import annotations

import base64
import binascii
import os

from importlib import import_module
from typing import Any

cv2: Any = import_module("cv2")
import numpy as np
from flask import Flask, jsonify, request, send_file, send_from_directory
from io import BytesIO

SizeDetector: Any = getattr(import_module("engine.object_size_detector"), "SizeDetector")

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_ROOT = os.path.join(ROOT, "static")
app = Flask(__name__, static_folder=STATIC_ROOT, static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 18 * 1024 * 1024


@app.get("/")
def home():
    return send_from_directory(STATIC_ROOT, "index.html")


@app.get("/manus-routes.json")
def route_manifest():
    return send_from_directory(STATIC_ROOT, "manus-routes.json", mimetype="application/json")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "scannerAvailable": True, "engine": "ArUco 5x5-50 object size detector"})


@app.get("/api/marker.png")
def marker_png():
    """Return marker ID 0 from DICT_5X5_50 for printing at exactly 5 cm per side."""
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_50)
    marker = cv2.aruco.generateImageMarker(dictionary, 0, 600, borderBits=1)
    ok, encoded = cv2.imencode(".png", marker)
    if not ok:
        return jsonify({"error": "Could not generate the calibration marker."}), 500
    return send_file(BytesIO(encoded.tobytes()), mimetype="image/png", download_name="hamvater-marker-5cm.png")


@app.post("/api/scan")
def scan_image():
    payload = request.get_json(silent=True) or {}
    data_url = payload.get("imageBase64", "")
    if not isinstance(data_url, str) or not data_url:
        return jsonify({"error": "Add a photo before starting a scan."}), 400
    encoded = data_url.split(",", 1)[-1]
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        return jsonify({"error": "The image could not be read. Try another photo."}), 400
    if not raw or len(raw) > 12 * 1024 * 1024:
        return jsonify({"error": "Use an image smaller than 12 MB."}), 413

    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return jsonify({"error": "This image format could not be decoded. Try a JPG or PNG."}), 400
    if image.shape[1] < 320 or image.shape[0] < 240:
        return jsonify({"error": "This scan is too small to measure reliably. Use an image at least 320 × 240 pixels."}), 400

    result = SizeDetector().measure(image)
    return jsonify(result)


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "That image is too large. Use a file under 12 MB."}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "3000")), debug=False)
