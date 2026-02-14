import numpy as np
import cv2
from app.stl_generator import generate_stl


def test_generate_stl_returns_bytes():
    """STL generation should return valid binary STL data."""
    # Simple binary image: small square of ink in center
    mask = np.zeros((50, 50), dtype=np.uint8)
    mask[15:35, 15:35] = 255  # ink square (cutout)
    stl_bytes = generate_stl(mask, width_mm=50, thickness_mm=0.8, border_mm=3)
    assert isinstance(stl_bytes, bytes)
    assert len(stl_bytes) > 0
    # Binary STL starts with 80-byte header + 4-byte triangle count
    assert len(stl_bytes) > 84


def test_generate_stl_solid_image():
    """An all-black mask (no ink) should produce a solid plate."""
    mask = np.zeros((20, 20), dtype=np.uint8)
    stl_bytes = generate_stl(mask, width_mm=50, thickness_mm=0.8, border_mm=3)
    assert isinstance(stl_bytes, bytes)
    assert len(stl_bytes) > 84


def test_generate_stl_respects_dimensions():
    """STL mesh vertices should be within the specified width."""
    mask = np.zeros((50, 100), dtype=np.uint8)
    mask[20:30, 40:60] = 255
    stl_bytes = generate_stl(mask, width_mm=100, thickness_mm=1.0, border_mm=2)
    # Parse the STL to check vertex bounds
    from stl import mesh as stl_mesh
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as f:
        f.write(stl_bytes)
        f.flush()
        m = stl_mesh.Mesh.from_file(f.name)
    os.unlink(f.name)
    # X coordinates should not exceed width_mm
    assert m.vectors[:, :, 0].max() <= 100.0 + 0.01
    assert m.vectors[:, :, 0].min() >= -0.01
