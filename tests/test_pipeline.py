import numpy as np
import cv2
from app.pipeline import detect_ink, remove_ruled_lines, remove_red_margin, clean_drawing


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


def test_remove_horizontal_lines():
    """Thin horizontal ruled lines should be removed, thick ink strokes preserved."""
    mask = np.zeros((200, 200), dtype=np.uint8)
    # Thin horizontal line (ruled line)
    cv2.line(mask, (0, 100), (199, 100), 255, 1)
    # Thick ink stroke (should be preserved)
    cv2.line(mask, (50, 0), (50, 199), 255, 5)
    cleaned = remove_ruled_lines(mask)
    # Thin horizontal line removed (away from thick stroke)
    assert cleaned[100, 150] == 0
    # Thick stroke preserved
    assert cleaned[80, 50] == 255


def test_remove_red_margin_line():
    """Red margin line should be removed from ink mask."""
    img = np.full((200, 200, 3), 255, dtype=np.uint8)
    # Red vertical line in BGR
    cv2.line(img, (30, 0), (30, 199), (0, 0, 200), 2)
    # Dark ink stroke
    cv2.line(img, (100, 50), (100, 150), (20, 20, 20), 3)
    mask = remove_red_margin(img, detect_ink(img))
    # Red line area should not be ink
    assert mask[100, 30] == 0
    # Ink stroke preserved
    assert mask[100, 100] == 255


def test_clean_drawing_returns_binary_cropped():
    """Full pipeline should return a cropped binary image."""
    # Create a fake notebook page: white with blue lines, red margin, and ink drawing
    img = np.full((400, 300, 3), 245, dtype=np.uint8)  # off-white paper
    # Blue ruled lines
    for y in range(50, 400, 30):
        cv2.line(img, (0, y), (299, y), (230, 180, 180), 1)
    # Red margin
    cv2.line(img, (40, 0), (40, 399), (0, 0, 200), 2)
    # Ink drawing: a rectangle
    cv2.rectangle(img, (100, 100), (200, 250), (20, 20, 20), 3)

    result = clean_drawing(img)

    # Result should be binary
    unique = np.unique(result)
    assert set(unique).issubset({0, 255})
    # Result should be cropped (smaller than original)
    assert result.shape[0] < 400 or result.shape[1] < 300
    # Should contain some ink pixels
    assert np.sum(result == 255) > 0


def test_clean_drawing_from_bytes():
    """Pipeline should accept raw image bytes (as received from upload)."""
    img = np.full((100, 100, 3), 255, dtype=np.uint8)
    cv2.line(img, (20, 20), (80, 80), (20, 20, 20), 3)
    _, buf = cv2.imencode('.png', img)
    raw_bytes = buf.tobytes()

    result = clean_drawing(raw_bytes)
    assert result is not None
    assert np.sum(result == 255) > 0
