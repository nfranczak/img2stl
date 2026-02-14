from typing import Union

import cv2
import numpy as np


def detect_ink(img: np.ndarray) -> np.ndarray:
    """Detect ink pixels in a color image. Returns binary mask (255=ink, 0=not ink)."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Dark ink: grayscale < 140
    dark_mask = gray < 140

    # Saturated blue ink: S > 80, V < 180, H in 90-135 (OpenCV H is 0-180)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    blue_mask = (s > 80) & (v < 180) & (h >= 90) & (h <= 135)

    mask = (dark_mask | blue_mask).astype(np.uint8) * 255
    return mask


def remove_ruled_lines(mask: np.ndarray) -> np.ndarray:
    """Remove thin horizontal ruled lines from binary mask, preserving thick ink strokes."""
    # Detect horizontal lines with wide kernel
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (80, 1))
    horiz_lines = cv2.morphologyEx(mask, cv2.MORPH_OPEN, horiz_kernel)

    # Detect thick ink regions (opening removes thin structures, keeps thick)
    thick_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    thick_ink = cv2.morphologyEx(mask, cv2.MORPH_OPEN, thick_kernel)
    thick_ink_dilated = cv2.dilate(thick_ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))

    # Only remove horizontal lines that aren't near thick ink
    lines_to_remove = cv2.bitwise_and(horiz_lines, cv2.bitwise_not(thick_ink_dilated))
    cleaned = cv2.bitwise_and(mask, cv2.bitwise_not(lines_to_remove))
    return cleaned


def remove_red_margin(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Remove red margin line from ink mask using HSV color detection."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Red hue in OpenCV: 0-10 and 170-180
    lower_red1 = np.array([0, 80, 80])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([170, 80, 80])
    upper_red2 = np.array([180, 255, 255])

    red_mask = cv2.inRange(hsv, lower_red1, upper_red1) | cv2.inRange(hsv, lower_red2, upper_red2)

    # Confirm it's a vertical line with morphological opening
    vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    red_line = cv2.morphologyEx(red_mask, cv2.MORPH_OPEN, vert_kernel)

    # Dilate slightly to catch edges
    red_line = cv2.dilate(red_line, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 1)))

    cleaned = cv2.bitwise_and(mask, cv2.bitwise_not(red_line))
    return cleaned


def clean_drawing(input_data: Union[bytes, np.ndarray]) -> np.ndarray:
    """Full cleaning pipeline. Accepts BGR image array or raw image bytes.
    Returns binary mask (255=ink, 0=background), cropped to content.
    """
    if isinstance(input_data, bytes):
        arr = np.frombuffer(input_data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image from provided bytes")
    else:
        img = input_data

    # Step 1: Detect ink
    mask = detect_ink(img)

    # Step 2: Remove ruled lines
    mask = remove_ruled_lines(mask)

    # Step 3: Remove red margin
    mask = remove_red_margin(img, mask)

    # Step 4: Morphological cleanup
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)   # remove noise
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)  # connect gaps

    # Step 5: Crop to bounding box with margin
    coords = cv2.findNonZero(mask)
    if coords is None:
        return mask  # no ink found, return as-is

    x, y, w, h = cv2.boundingRect(coords)
    margin = 10
    y1 = max(0, y - margin)
    y2 = min(mask.shape[0], y + h + margin)
    x1 = max(0, x - margin)
    x2 = min(mask.shape[1], x + w + margin)
    mask = mask[y1:y2, x1:x2]

    return mask
