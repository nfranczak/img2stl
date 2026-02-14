import numpy as np
import cv2
from app.pipeline import detect_ink


def test_detect_ink_dark_strokes():
    """Dark ink on white paper should be detected."""
    img = np.full((100, 100, 3), 255, dtype=np.uint8)  # white paper
    cv2.line(img, (10, 50), (90, 50), (20, 20, 20), 3)  # dark ink line
    mask = detect_ink(img)
    # ink pixels should be white (255) in the mask
    assert mask[50, 50] == 255
    # paper pixels should be black (0)
    assert mask[10, 10] == 0


def test_detect_ink_blue_ink():
    """Saturated blue ink should also be detected."""
    img = np.full((100, 100, 3), 255, dtype=np.uint8)
    # Blue ink in BGR: dark saturated blue
    cv2.line(img, (10, 50), (90, 50), (150, 50, 20), 3)
    mask = detect_ink(img)
    assert mask[50, 50] == 255


def test_detect_ink_ignores_light_blue_lines():
    """Light blue ruled lines should NOT be detected as ink."""
    img = np.full((100, 100, 3), 255, dtype=np.uint8)
    # Light blue line in BGR
    cv2.line(img, (0, 50), (99, 50), (230, 180, 180), 1)
    mask = detect_ink(img)
    assert mask[50, 50] == 0
