# Hamvater — implementation plan

## Product scope
Hamvater is a virtual dress try-on experience. Users enter height and weight, capture or upload a dress image, measure it with the linked `xcapt0/object_size_detector` engine where its assumptions are met, then see a garment layer placed on an animated measurement-adjusted avatar. The result is an approximate visual preview, not a fit guarantee or 3D fabric simulation.

The linked engine finds a printed 5 × 5 cm ArUco marker (DICT_5X5_50), uses it to calibrate pixel scale, then estimates external contour width and height. The web service will adapt this algorithm to uploaded/captured images. It will report missing markers, unreadable scans, or weak object contours instead of inventing calibrated measurements. The app can still show an explicitly approximate preview when no scan measurement is available. Users control image placement/size and can compare the original garment image with the avatar preview.

## Implementation and serving
- **Client:** dependency-free semantic HTML, CSS, and JavaScript served by Flask. The client provides metric/imperial height input, a clearly approximate body-profile transform, a stylized animated SVG avatar, camera capture and image upload, garment overlay controls, a before/after comparison, and scan guidance/results.
- **Measurement API:** `POST /api/scan` accepts a captured/uploaded image as base64 JSON, decodes it with OpenCV, calls the adapted detector, and returns calibration status, reference/contour facts, dimensions in centimetres, and human-readable feedback. `GET /api/health` supports health checks. The source's marker size is configurable only in code and defaults to the published 5 cm square assumption.
- **Detector:** a small, attributed, MIT-licensed adaptation of the linked repository's detector. Preserve its ArUco calibration and contour-size approach; modernize API use and guard against including the calibration marker as the garment contour. Do not substitute a model that claims body scanning or textile physics.
- **Production:** Python/Flask container, `requirements.txt`, and `Dockerfile`; Flask listens on `0.0.0.0:$PORT` (default 3000). There is no login, durable user data, or database in this prototype. Uploaded images are processed in memory and not persisted.
- **Project structure:** `server.py` owns Flask routes and image decoding; `engine/object_size_detector.py` owns the detector adapter; `static/index.html`, `static/styles.css`, and `static/app.js` implement the experience; `static/manus-routes.json` declares the page route; `README.md` explains setup and limitations; `requirements.txt` and `Dockerfile` define runtime dependencies and production serving; `app.config.ts` declares the project logo URL.

## Design — Tailor's Blueprint (selected direction)
- **Design movement:** contemporary atelier / tailor's drafting table, translating calibration marks and patternmaking annotations into a calm digital fitting studio.
- **Core principles:** precision without intimidation; make the person and garment the visual center; show measurement provenance and confidence; keep the fitting loop reversible.
- **Color philosophy:** deep ink teal `#183A47` conveys craft and technical trust; terracotta `#D98F70` supplies a tactile fitting-room accent; a warm paper ground softens the measuring-tool language; charcoal and pale sage support legibility and status.
- **Layout paradigm:** asymmetric atelier workbench: narrow measurement/scanning rail at left, generous avatar stage at right, with the stage taking visual priority. On small screens the workflow collapses into an ordered single-column sequence.
- **Signature elements:** fine drafting grid/corner marks around the try-on stage; compact annotation chips for garment dimensions and profile assumptions; a bespoke H-overlap wordmark with a measurement tick.
- **Interaction philosophy:** direct manipulation, explicit progress, easy undo/restart. Upload/camera and scan status are visibly separate from the simulated result so an uncalibrated preview cannot masquerade as measured fit.
- **Animation:** gentle avatar idle/breathing and small turntable yaw; smooth perspective changes on rotate controls; subtle scanner sweep only while scanning; reduced-motion preference disables decorative movement.
- **Typography system:** DM Sans for the interface, weights 400/500/600/700; a restrained editorial serif (Georgia/system serif) for a few large atelier headlines. Numeric dimensions use tabular numerals and consistent units.
- **Brand essence:** “A measurement-aware fitting room that lets shoppers preview a dress on a simple body avatar before trusting a size chart.” Personality: precise, thoughtful, exploratory.
- **Brand voice:** concise, reassuring, candid about uncertainty. Examples: “A cleaner scan makes a more useful estimate.” “This is a visual preview, not a promise of fit.”
- **Wordmark & logo:** compact bespoke “H” monogram made from two pattern pieces separated by a vertical fitting seam, with a short ruler tick; pair it with the Hamvater name in DM Sans semibold.
- **Signature brand color:** ink teal `#183A47`.

## Key product boundary
The reference engine is an object-dimension detector, not a garment-segmentation, body-scanning, size-recommendation, avatar-reconstruction, or cloth-physics engine. Hamvater layers the submitted garment image over a simplified animated avatar and lets the user adjust placement/scale. Body shape and compatibility are rough visual heuristics from height/weight. UI copy must repeatedly state that the result omits depth, body shape detail, fabric drape/stretch, tailoring, comfort, and guaranteed real-world fit.
