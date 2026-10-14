# Hamvater

Hamvater is a measurement-aware virtual dress fitting **prototype**. It combines a lightweight animated avatar with an uploaded or captured garment image, and can estimate a garment contour when the linked detector's calibration conditions are met.

## Run locally

Requires Python 3.11 or later. From the project directory:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python server.py
```

Open `http://localhost:3000`. Camera capture requires browser camera permission and a secure browser context (localhost is treated as secure).

## Scan calibration

The measurement adapter preserves the approach used by [`xcapt0/object_size_detector`](https://github.com/xcapt0/object_size_detector): it detects a `DICT_5X5_50` ArUco marker and assumes that the printed square is **exactly 5 × 5 cm**. Use “Print the 5 cm calibration marker” in the app, print marker #0 with scaling disabled, verify its black square is 5 cm on each side, then lay the whole dress and marker flat in the same plane. The estimate is based on a thresholded external contour; perspective, folds, lighting, touching objects, and backdrop can all affect it. A missing or unreadable marker never produces a calibrated result.

`POST /api/scan` accepts JSON `{ "imageBase64": "data:image/jpeg;base64,..." }` and processes the image in memory. `GET /api/health` is a health check. `GET /api/marker.png` supplies marker #0 for the print dialog. User images are not written to disk or retained by the server.

## What the preview means

Height and weight change only a simplified avatar proportion. The garment image is a draggable/scalable/opacity-adjustable 2D overlay. Optional light-background cutout runs in the browser. This is not body scanning, garment segmentation, a size recommender, 3D cloth simulation, or a fitting guarantee. It does not model full body shape, depth, fabric drape/stretch, tailoring, or comfort. Use the displayed dimensions as a rough visual aid and confirm sizing with the garment's own chart and a real fitting.

## Runtime

The Flask app listens on `0.0.0.0:$PORT` (default port 3000). To build the production container: `docker build -t hamvater .`.

## Attribution

`engine/object_size_detector.py` adapts the measurement method from `xcapt0/object_size_detector`, Copyright (c) 2022 xcapt0, distributed under the MIT License. The upstream license is preserved in `engine/LICENSE.object_size_detector`.
