# Hamvater outcomes

- [x] **Height and weight profile** — Users enter their height and weight, can choose the available height/weight units, receive input validation, and see concise guidance that these measurements produce only an approximate body model.
- [x] **Animated avatar** — The project presents an animated avatar generated from the entered measurements, with a simple neutral pose and controls to rotate or inspect the simulated look.
- [x] **Dress capture and upload** — Users can capture or upload a dress image for scanning. The flow includes guidance for framing, lighting, background, and full-garment visibility.
- [x] **Linked measurement engine** — Integrate `https://github.com/xcapt0/object_size_detector` for object and garment size estimation where compatible, preserving the requested engine rather than substituting another implementation. Make the detector's requirements and assumptions visible.
- [x] **Scan readiness and feedback** — Check whether a scan contains the required reference object, usable camera/image quality, and calibration assumptions imposed by the linked engine. Explain incompatible or unmeasurable scans and invite a retake; do not fabricate calibrated measurements.
- [x] **Garment-on-avatar preview** — Extract/place the submitted garment as a controllable overlay on the avatar, scaling it to create an animated visual try-on preview based on measured garment dimensions when available and the user's basic measurements. Keep uncalibrated previews visibly marked as approximate.
- [x] **Limitations and confidence** — Clearly explain that the result is a visual approximation and does not model fabric drape, stretch, depth, complete body shape, tailoring, comfort, or guaranteed real-world fit. Communicate the available measurement/confidence status honestly.
- [x] **Compare and restart** — Provide a before/after comparison and an option to restart with different measurements or another dress image.
