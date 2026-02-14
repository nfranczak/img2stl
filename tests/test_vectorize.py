import numpy as np
import cv2
from app.vectorize import vectorize_to_svg


def test_vectorize_returns_svg():
    """Should return valid SVG string from a binary mask."""
    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.circle(mask, (50, 50), 30, 255, -1)
    svg = vectorize_to_svg(mask)
    assert isinstance(svg, str)
    assert '<svg' in svg
    assert '</svg>' in svg


def test_vectorize_empty_image():
    """Empty image should still return valid SVG."""
    mask = np.zeros((50, 50), dtype=np.uint8)
    svg = vectorize_to_svg(mask)
    assert '<svg' in svg
