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
