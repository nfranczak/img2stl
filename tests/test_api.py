import numpy as np
import cv2
import io
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _make_test_image():
    """Create a simple test image with ink on white background."""
    img = np.full((200, 200, 3), 240, dtype=np.uint8)
    cv2.line(img, (30, 30), (170, 170), (20, 20, 20), 3)
    _, buf = cv2.imencode('.png', img)
    return buf.tobytes()


def test_upload_returns_cleaned_png():
    img_bytes = _make_test_image()
    response = client.post(
        "/api/upload",
        files={"file": ("drawing.png", io.BytesIO(img_bytes), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "cleaned_image" in data  # base64 PNG
    assert "svg" in data  # SVG string


def test_upload_rejects_no_file():
    response = client.post("/api/upload")
    assert response.status_code == 422


def test_generate_stl_returns_file():
    # Create a binary mask image
    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(mask, (20, 20), (80, 80), 255, 2)
    _, buf = cv2.imencode('.png', mask)

    response = client.post(
        "/api/generate-stl",
        files={"file": ("mask.png", io.BytesIO(buf.tobytes()), "image/png")},
        data={"width_mm": "100", "thickness_mm": "0.8", "border_mm": "3"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert len(response.content) > 84  # valid STL


def test_generate_svg_returns_svg():
    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.circle(mask, (50, 50), 30, 255, -1)
    _, buf = cv2.imencode('.png', mask)

    response = client.post(
        "/api/generate-svg",
        files={"file": ("mask.png", io.BytesIO(buf.tobytes()), "image/png")},
    )
    assert response.status_code == 200
    assert "<svg" in response.text


def test_full_pipeline_upload_then_stl():
    """Upload image, get cleaned result, send back for STL generation."""
    img_bytes = _make_test_image()

    # Step 1: Upload and clean
    resp1 = client.post(
        "/api/upload",
        files={"file": ("test.png", io.BytesIO(img_bytes), "image/png")},
    )
    assert resp1.status_code == 200
    cleaned_b64 = resp1.json()["cleaned_image"]

    # Step 2: Decode cleaned image and send for STL
    import base64
    cleaned_bytes = base64.b64decode(cleaned_b64)
    resp2 = client.post(
        "/api/generate-stl",
        files={"file": ("cleaned.png", io.BytesIO(cleaned_bytes), "image/png")},
        data={"width_mm": "100", "thickness_mm": "0.8", "border_mm": "3"},
    )
    assert resp2.status_code == 200
    assert len(resp2.content) > 84
