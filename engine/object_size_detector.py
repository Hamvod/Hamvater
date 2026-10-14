"""Web adapter for xcapt0/object_size_detector's MIT-licensed measurement approach.

The original project calibrates contour dimensions from a printed 5 cm DICT_5X5_50
ArUco marker. This adapter keeps that method, uses current OpenCV APIs, and skips the
reference marker contour so it cannot be returned as the garment.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

cv2: Any = import_module("cv2")
import numpy as np


class SizeDetector:
    MARKER_SIZE_CM = 5.0
    MIN_MARKER_SIDE_PX = 25.0
    MIN_OBJECT_AREA_PX = 1_500.0

    def __init__(self) -> None:
        self.aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_50)
        params_factory = getattr(cv2.aruco, "DetectorParameters", None)
        self.aruco_params = params_factory() if params_factory else cv2.aruco.DetectorParameters_create()
        detector_factory = getattr(cv2.aruco, "ArucoDetector", None)
        self._detector = detector_factory(self.aruco_dict, self.aruco_params) if detector_factory else None

    def _detect_markers(self, image: np.ndarray):
        if self._detector:
            return self._detector.detectMarkers(image)
        return cv2.aruco.detectMarkers(image, self.aruco_dict, parameters=self.aruco_params)

    @staticmethod
    def _overlap_ratio(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
        ax, ay, aw, ah = first
        bx, by, bw, bh = second
        intersection_w = max(0, min(ax + aw, bx + bw) - max(ax, bx))
        intersection_h = max(0, min(ay + ah, by + bh) - max(ay, by))
        intersection = intersection_w * intersection_h
        smaller_area = min(aw * ah, bw * bh)
        return intersection / smaller_area if smaller_area else 0.0

    def measure(self, image: np.ndarray) -> dict[str, object]:
        """Estimate upright image-axis extents for the largest separate contour."""
        image_h, image_w = image.shape[:2]
        corners, ids, _ = self._detect_markers(image)
        if ids is None or not corners:
            return {
                "status": "marker_missing",
                "calibrated": False,
                "message": "No DICT_5X5_50 reference marker was found. A calibrated size cannot be calculated.",
                "guidance": "Print marker #0 at exactly 5 × 5 cm. Place it flat beside the whole dress, in the same plane, and retake the scan.",
                "reference": {"required": "5 × 5 cm ArUco, DICT_5X5_50", "markerId": 0},
                "dimensions": None,
            }

        marker_boxes: list[tuple[int, int, int, int]] = []
        side_estimates: list[float] = []
        marker_ids: list[int] = []
        for marker_corners, marker_id in zip(corners, ids.flatten().tolist()):
            points = marker_corners.reshape(-1, 2).astype(np.float32)
            perimeter_px = float(cv2.arcLength(points, True))
            side_estimates.append(perimeter_px / 4.0)
            bx, by, bw, bh = cv2.boundingRect(points)
            marker_boxes.append((int(bx), int(by), int(bw), int(bh)))
            marker_ids.append(int(marker_id))

        marker_side_px = float(np.median(side_estimates))
        # Convert the measured marker side to pixels per physical centimetre.
        pixels_per_cm = marker_side_px / self.MARKER_SIZE_CM
        if marker_side_px < self.MIN_MARKER_SIDE_PX:
            return {
                "status": "marker_too_small",
                "calibrated": False,
                "message": "The reference marker is too small in this image for a useful estimate.",
                "guidance": "Move the camera closer or use a higher-resolution image; keep the complete dress and the 5 cm marker in frame.",
                "reference": {"required": "5 × 5 cm ArUco, DICT_5X5_50", "markerIdsDetected": marker_ids, "markerSidePixels": round(marker_side_px, 1)},
                "dimensions": None,
            }

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        mask = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 19, 5)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        image_area = image_w * image_h
        min_area = max(self.MIN_OBJECT_AREA_PX, image_area * 0.0006)
        candidates = []
        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < min_area or area > image_area * 0.82:
                continue
            x, y, width, height = cv2.boundingRect(contour)
            box = (x, y, width, height)
            if any(self._overlap_ratio(box, marker_box) > 0.45 for marker_box in marker_boxes):
                continue
            candidates.append((area, contour))

        if not candidates:
            return {
                "status": "object_not_found",
                "calibrated": True,
                "message": "The 5 cm reference was detected, but no separate garment outline was clear enough to measure.",
                "guidance": "Lay the entire dress flat against a contrasting, uncluttered background. Avoid shadows, folds, and objects touching the garment, then retake the scan.",
                "reference": {"required": "5 × 5 cm ArUco, DICT_5X5_50", "markerIdsDetected": marker_ids, "markerSidePixels": round(marker_side_px, 1), "pixelsPerCm": round(pixels_per_cm, 2)},
                "dimensions": None,
            }

        area, contour = max(candidates, key=lambda candidate: candidate[0])
        bounds_x, bounds_y, contour_width_px, contour_height_px = cv2.boundingRect(contour)
        width_cm = float(contour_width_px) / pixels_per_cm
        height_cm = float(contour_height_px) / pixels_per_cm
        return {
            "status": "calibrated_estimate",
            "calibrated": True,
            "message": "A marker-calibrated contour estimate is ready. Same-plane placement and a clean outline still matter.",
            "guidance": "Use the measurement as an approximate garment dimension, not a size or fit guarantee.",
            "reference": {"required": "5 × 5 cm ArUco, DICT_5X5_50", "markerIdsDetected": marker_ids, "markerSidePixels": round(marker_side_px, 1), "pixelsPerCm": round(pixels_per_cm, 2)},
            "dimensions": {"widthCm": round(width_cm, 1), "heightCm": round(height_cm, 1), "contourAreaPixels": round(area)},
            "garmentBounds": {"x": int(bounds_x), "y": int(bounds_y), "width": int(contour_width_px), "height": int(contour_height_px), "imageWidth": int(image_w), "imageHeight": int(image_h)},
            "confidenceNote": "Marker recognized; perspective, garment folds, background, and same-plane alignment are not independently verified.",
        }
