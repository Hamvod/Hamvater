# Hamvater

A minimal dress-preview workspace centred on original adult male and female 3D fitting models. Users select a model, enter height and weight, upload or capture a dress image, and position a flat garment layer for visual exploration.

## Run locally

Requires Python 3.11 or newer.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/gunicorn --bind 0.0.0.0:3000 server:app
```

Open `http://localhost:3000`. The model viewer and GLB assets are served from the project itself; no browser-side package installation or runtime CDN is needed. For local development, `python server.py` also starts Flask on port 3000.

## Model and dress preview

Switch between the male and female adult fitting model from the left rail. Drag on the model or use **Turn** and **Front** to inspect it. Valid height scales the model proportionally, and weight-derived BMI adjusts its approximate width/depth on either model; the camera reframes very tall forms so they remain visible. These controls do not rebuild the body or scan the user. The models are original generated GLB assets created for clothing preview, in modest neutral fitting suits. The supplied male image and Mozaweb female scene informed the requested full-body/interactable presentation; neither reference's model assets are copied into Hamvater.

Upload JPG, PNG, or WebP (maximum 12 MB), capture a photo with the camera, or try the sample dress. A conservative plain-background removal runs in the browser by default for uploaded/captured dress images; turn off **Remove a plain background automatically** if it softens the fabric. Busy or uneven backdrops are left unchanged, and the original photo is preserved for scanning and **Compare**. In front view, the garment is a flat 2D image overlay placed over the selected 3D model; it is hidden while the model is turned so the preview is not mistaken for a physically fitted 3D garment. A calibrated scan uses the contour width/length relative to the entered height for overlay scale and crops the fitting layer to the separate garment outline, excluding the marker; **Compare** still shows the original uploaded scan. This is not a body scan or fit test.

## Measurement engine

The service adapts the MIT-licensed OpenCV detector requested at <https://github.com/xcapt0/object_size_detector>. Print marker #0 from the on-page print dialog and verify the black square is exactly **5 × 5 cm**. Place it beside the full dress, flat in the same plane. The service uses DICT_5X5_50 marker geometry and estimates the outer contour. Missing or unclear markers are reported as uncalibrated; scans never get a fabricated size.

The scanned image is processed in memory and is not persisted. `GET /api/health` is the service health endpoint; `GET /manus-routes.json` declares the single page route.

## Important limitations

This is a visual prototype. The detector estimates object outlines, not garment construction or body dimensions. The model/profile uses height and weight only and cannot represent someone's actual individual body shape. The garment image is a flat layer, not fitted cloth; the preview does not model fabric depth, drape, stretch, tailoring, or comfort and does not guarantee real-world fit. Check a garment's size chart and measurements for sizing decisions.

## Licenses

The adapted detector's MIT notice is preserved at `engine/LICENSE.object_size_detector`. Three.js v0.174.0 is vendored for local viewer delivery, with its upstream license at `static/vendor/three/LICENSE`; the compressed-GLB Meshopt decoder's MIT notice is at `static/vendor/three/LICENSE.meshoptimizer`.
