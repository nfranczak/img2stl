# Drawing-to-Stencil Web App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a locally hosted web app that cleans scanned drawings, provides a Paper.js vector editor for touch-ups, and exports 3D-printable STL stencil files.

**Architecture:** FastAPI backend serves a vanilla JS + Paper.js frontend. Backend handles image cleaning (OpenCV), vectorization (potrace), and STL generation (numpy-stl). Frontend provides drag-and-drop upload, vector editing, and export controls.

**Tech Stack:** Python (FastAPI, OpenCV, NumPy, numpy-stl), Paper.js (CDN), potrace (system binary)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `app/__init__.py`
- Create: `app/main.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `static/index.html` (placeholder)

**Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
opencv-python-headless==4.10.0.84
numpy>=1.26.0,<2.0
numpy-stl==3.1.2
python-multipart==0.0.9
httpx==0.27.0
pytest==8.3.0
```

**Step 2: Create minimal FastAPI app**

`app/__init__.py` — empty file

`app/main.py`:
```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI(title="img2stl")

static_dir = Path(__file__).parent.parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
```

**Step 3: Create test scaffolding**

`tests/__init__.py` — empty file

`tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)
```

**Step 4: Create placeholder index.html**

`static/index.html`:
```html
<!DOCTYPE html>
<html><head><title>img2stl</title></head>
<body><h1>img2stl</h1></body>
</html>
```

**Step 5: Install dependencies and verify**

```bash
pip install -r requirements.txt
pytest tests/ -v
```

Expected: 0 tests collected, no errors.

**Step 6: Verify potrace is installed**

```bash
potrace --version
```

If missing: `brew install potrace`

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with FastAPI, test setup, and dependencies"
```

---

### Task 2: Image Cleaning Pipeline — Ink Detection

**Files:**
- Create: `app/pipeline.py`
- Create: `tests/test_pipeline.py`
- Create: `tests/fixtures/` (test images generated in code)

**Step 1: Write failing test for ink detection**

`tests/test_pipeline.py`:
```python
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
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_pipeline.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.pipeline'`

**Step 3: Implement detect_ink**

`app/pipeline.py`:
```python
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
```

**Step 4: Run test to verify it passes**

```bash
pytest tests/test_pipeline.py -v
```

Expected: 3 PASSED

**Step 5: Commit**

```bash
git add app/pipeline.py tests/test_pipeline.py
git commit -m "feat: ink detection with dark stroke and blue ink support"
```

---

### Task 3: Image Cleaning Pipeline — Line Removal

**Files:**
- Modify: `app/pipeline.py`
- Modify: `tests/test_pipeline.py`

**Step 1: Write failing test for horizontal line removal**

Add to `tests/test_pipeline.py`:
```python
from app.pipeline import remove_ruled_lines


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
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_pipeline.py::test_remove_horizontal_lines -v
```

Expected: FAIL — `ImportError: cannot import name 'remove_ruled_lines'`

**Step 3: Implement line removal functions**

Add to `app/pipeline.py`:
```python
def remove_ruled_lines(mask: np.ndarray) -> np.ndarray:
    """Remove thin horizontal ruled lines from binary mask, preserving thick ink strokes."""
    # Detect horizontal lines with wide kernel
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (80, 1))
    horiz_lines = cv2.morphologyEx(mask, cv2.MORPH_OPEN, horiz_kernel)

    # Detect thick ink regions (dilate to create buffer around them)
    thick_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    thick_ink = cv2.dilate(mask, thick_kernel)
    thick_ink = cv2.erode(thick_ink, thick_kernel)
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
```

**Step 4: Run tests**

```bash
pytest tests/test_pipeline.py -v
```

Expected: 5 PASSED

**Step 5: Commit**

```bash
git add app/pipeline.py tests/test_pipeline.py
git commit -m "feat: ruled line and red margin removal"
```

---

### Task 4: Image Cleaning Pipeline — Full Pipeline Function

**Files:**
- Modify: `app/pipeline.py`
- Modify: `tests/test_pipeline.py`

**Step 1: Write failing test for full pipeline**

Add to `tests/test_pipeline.py`:
```python
from app.pipeline import clean_drawing


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
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_pipeline.py::test_clean_drawing_returns_binary_cropped -v
```

Expected: FAIL — `ImportError`

**Step 3: Implement clean_drawing**

Add to `app/pipeline.py`:
```python
def clean_drawing(input_data) -> np.ndarray:
    """Full cleaning pipeline. Accepts BGR image array or raw image bytes.
    Returns binary mask (255=ink, 0=background), cropped to content.
    """
    if isinstance(input_data, bytes):
        arr = np.frombuffer(input_data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
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
```

**Step 4: Run tests**

```bash
pytest tests/test_pipeline.py -v
```

Expected: 7 PASSED

**Step 5: Commit**

```bash
git add app/pipeline.py tests/test_pipeline.py
git commit -m "feat: full image cleaning pipeline with crop and byte input"
```

---

### Task 5: STL Generator

**Files:**
- Create: `app/stl_generator.py`
- Create: `tests/test_stl_generator.py`

**Step 1: Write failing tests**

`tests/test_stl_generator.py`:
```python
import numpy as np
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
    import io
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as f:
        f.write(stl_bytes)
        f.flush()
        m = stl_mesh.Mesh.from_file(f.name)
    os.unlink(f.name)
    # X coordinates should not exceed width_mm
    assert m.vectors[:, :, 0].max() <= 100.0 + 0.01
    assert m.vectors[:, :, 0].min() >= -0.01
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_stl_generator.py -v
```

Expected: FAIL — `ModuleNotFoundError`

**Step 3: Implement STL generator**

`app/stl_generator.py`:
```python
import numpy as np
from stl import mesh as stl_mesh
import io
import cv2


def generate_stl(
    mask: np.ndarray,
    width_mm: float = 150.0,
    thickness_mm: float = 0.8,
    border_mm: float = 3.0,
    max_resolution: int = 400,
) -> bytes:
    """Convert a binary mask (255=ink/cutout, 0=solid) into a stencil STL.

    Returns binary STL file contents as bytes.
    """
    # Downscale to reasonable mesh resolution
    h, w = mask.shape[:2]
    if w > max_resolution:
        scale = max_resolution / w
        mask = cv2.resize(mask, (max_resolution, int(h * scale)), interpolation=cv2.INTER_NEAREST)
        h, w = mask.shape

    # Calculate pixel size in mm
    pixel_mm = width_mm / w
    border_px = max(1, int(border_mm / pixel_mm))

    # Add border frame: expand image and mark border as solid
    padded = np.zeros((h + 2 * border_px, w + 2 * border_px), dtype=np.uint8)
    padded[border_px:border_px + h, border_px:border_px + w] = mask
    # Border stays 0 (solid), only interior ink pixels are cutouts
    h, w = padded.shape

    # Build solid grid: 1 = solid (not ink), 0 = cutout (ink)
    solid = (padded < 128).astype(np.uint8)

    # Collect triangles
    triangles = []
    z_top = thickness_mm
    z_bot = 0.0

    for row in range(h):
        for col in range(w):
            if not solid[row, col]:
                continue

            x0 = col * pixel_mm
            x1 = (col + 1) * pixel_mm
            y0 = row * pixel_mm
            y1 = (row + 1) * pixel_mm

            # Top face (2 triangles)
            triangles.append(([x0, y0, z_top], [x1, y0, z_top], [x1, y1, z_top]))
            triangles.append(([x0, y0, z_top], [x1, y1, z_top], [x0, y1, z_top]))

            # Bottom face (2 triangles, reversed winding)
            triangles.append(([x0, y0, z_bot], [x1, y1, z_bot], [x1, y0, z_bot]))
            triangles.append(([x0, y0, z_bot], [x0, y1, z_bot], [x1, y1, z_bot]))

            # Side faces — only at boundaries
            # Left
            if col == 0 or not solid[row, col - 1]:
                triangles.append(([x0, y0, z_bot], [x0, y0, z_top], [x0, y1, z_top]))
                triangles.append(([x0, y0, z_bot], [x0, y1, z_top], [x0, y1, z_bot]))
            # Right
            if col == w - 1 or not solid[row, col + 1]:
                triangles.append(([x1, y0, z_bot], [x1, y1, z_top], [x1, y0, z_top]))
                triangles.append(([x1, y0, z_bot], [x1, y1, z_bot], [x1, y1, z_top]))
            # Top edge (y0 side)
            if row == 0 or not solid[row - 1, col]:
                triangles.append(([x0, y0, z_bot], [x1, y0, z_top], [x0, y0, z_top]))
                triangles.append(([x0, y0, z_bot], [x1, y0, z_bot], [x1, y0, z_top]))
            # Bottom edge (y1 side)
            if row == h - 1 or not solid[row + 1, col]:
                triangles.append(([x0, y1, z_bot], [x0, y1, z_top], [x1, y1, z_top]))
                triangles.append(([x0, y1, z_bot], [x1, y1, z_top], [x1, y1, z_bot]))

    if not triangles:
        # Edge case: entirely cutout, return minimal STL
        triangles.append(([0, 0, 0], [1, 0, 0], [0, 1, 0]))

    # Build mesh
    tri_array = np.array(triangles)
    stl_object = stl_mesh.Mesh(np.zeros(len(tri_array), dtype=stl_mesh.Mesh.dtype))
    stl_object.vectors = tri_array

    # Write to bytes
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as f:
        stl_object.save(f.name)
        f.flush()
        with open(f.name, 'rb') as rf:
            data = rf.read()
    os.unlink(f.name)
    return data
```

**Step 4: Run tests**

```bash
pytest tests/test_stl_generator.py -v
```

Expected: 3 PASSED

**Step 5: Commit**

```bash
git add app/stl_generator.py tests/test_stl_generator.py
git commit -m "feat: STL stencil generator with voxel extrusion"
```

---

### Task 6: Potrace SVG Integration

**Files:**
- Create: `app/vectorize.py`
- Create: `tests/test_vectorize.py`

**Step 1: Write failing test**

`tests/test_vectorize.py`:
```python
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
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_vectorize.py -v
```

Expected: FAIL

**Step 3: Implement vectorize_to_svg**

`app/vectorize.py`:
```python
import subprocess
import tempfile
import os
import numpy as np
import cv2


def vectorize_to_svg(
    mask: np.ndarray,
    turdsize: int = 10,
    alphamax: float = 1.0,
) -> str:
    """Convert binary mask to SVG using potrace.

    Args:
        mask: Binary image (255=ink, 0=background)
        turdsize: Suppress speckles up to this size
        alphamax: Corner smoothing (0=sharp, 1.334=smooth)

    Returns:
        SVG string
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        bmp_path = os.path.join(tmpdir, "input.bmp")
        svg_path = os.path.join(tmpdir, "output.svg")

        # potrace expects black foreground on white background in BMP
        # Our mask: 255=ink, 0=bg. For potrace: 0=foreground, 255=background
        inverted = cv2.bitwise_not(mask)
        cv2.imwrite(bmp_path, inverted)

        subprocess.run(
            [
                "potrace", bmp_path,
                "-s",  # SVG output
                "-o", svg_path,
                "--turdsize", str(turdsize),
                "--alphamax", str(alphamax),
            ],
            check=True,
            capture_output=True,
        )

        with open(svg_path, "r") as f:
            return f.read()
```

**Step 4: Run tests**

```bash
pytest tests/test_vectorize.py -v
```

Expected: 2 PASSED (requires `potrace` installed)

**Step 5: Commit**

```bash
git add app/vectorize.py tests/test_vectorize.py
git commit -m "feat: potrace SVG vectorization"
```

---

### Task 7: FastAPI Endpoints

**Files:**
- Modify: `app/main.py`
- Create: `tests/test_api.py`

**Step 1: Write failing tests for /upload endpoint**

`tests/test_api.py`:
```python
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
    img_bytes = _make_test_image()
    # Upload first to get cleaned image, but for STL we send a binary image directly
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
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_api.py -v
```

Expected: FAIL — 404 (routes don't exist yet)

**Step 3: Implement API endpoints**

Replace `app/main.py` with:
```python
import base64
import io

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import Response, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.pipeline import clean_drawing
from app.stl_generator import generate_stl
from app.vectorize import vectorize_to_svg

app = FastAPI(title="img2stl")


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    """Clean a scanned drawing and return cleaned PNG + SVG."""
    raw = await file.read()
    mask = clean_drawing(raw)

    # Encode cleaned mask as PNG base64
    _, buf = cv2.imencode('.png', mask)
    b64 = base64.b64encode(buf.tobytes()).decode('utf-8')

    # Vectorize to SVG
    svg = vectorize_to_svg(mask)

    return {"cleaned_image": b64, "svg": svg}


@app.post("/api/generate-stl")
async def gen_stl(
    file: UploadFile = File(...),
    width_mm: float = Form(150.0),
    thickness_mm: float = Form(0.8),
    border_mm: float = Form(3.0),
):
    """Generate STL from a binary mask image."""
    raw = await file.read()
    arr = np.frombuffer(raw, np.uint8)
    mask = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)

    stl_bytes = generate_stl(mask, width_mm=width_mm, thickness_mm=thickness_mm, border_mm=border_mm)
    return Response(content=stl_bytes, media_type="application/octet-stream",
                    headers={"Content-Disposition": "attachment; filename=stencil.stl"})


@app.post("/api/generate-svg")
async def gen_svg(file: UploadFile = File(...)):
    """Generate SVG from a binary mask image."""
    raw = await file.read()
    arr = np.frombuffer(raw, np.uint8)
    mask = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)

    svg = vectorize_to_svg(mask)
    return Response(content=svg, media_type="image/svg+xml")


# Static files mounted last so API routes take priority
static_dir = Path(__file__).parent.parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
```

**Step 4: Run tests**

```bash
pytest tests/test_api.py -v
```

Expected: 4 PASSED

**Step 5: Commit**

```bash
git add app/main.py tests/test_api.py
git commit -m "feat: API endpoints for upload, STL generation, and SVG generation"
```

---

### Task 8: Frontend — Upload Screen

**Files:**
- Create: `static/index.html`
- Create: `static/style.css`
- Create: `static/app.js`

**Step 1: Build the HTML shell and upload screen**

`static/index.html` — Single-page app with three screens (upload, edit, export). Only the upload screen is visible initially. Include Paper.js from CDN.

Key elements:
- Drag-and-drop zone with `dragover`/`drop` event handlers
- File input fallback
- Image preview thumbnail
- "Clean & Edit" button that POSTs to `/api/upload`
- Loading spinner during upload/processing

`static/style.css` — Clean, minimal styling. Dark theme works well for image editing. Drop zone with dashed border, hover state.

`static/app.js` — Module structure:
```javascript
// State management
const state = { screen: 'upload', cleanedImage: null, svg: null };

// Screen transitions
function showScreen(name) { ... }

// Upload handling
function handleDrop(e) { ... }
async function uploadImage(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    state.cleanedImage = data.cleaned_image;
    state.svg = data.svg;
    showScreen('edit');
}
```

**Step 2: Test manually**

```bash
cd /Users/nicholasfranczak/img2stl && uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000`, drop an image, verify it transitions to the editor screen.

**Step 3: Commit**

```bash
git add static/
git commit -m "feat: upload screen with drag-and-drop and image cleaning"
```

---

### Task 9: Frontend — Paper.js Vector Editor

**Files:**
- Modify: `static/index.html` (add editor section + canvas)
- Modify: `static/app.js` (Paper.js editor logic)
- Modify: `static/style.css` (toolbar + canvas styles)

This is the largest frontend task. Key features:

**Step 1: Set up Paper.js canvas and load SVG paths**

```javascript
// Initialize Paper.js on the editor canvas
paper.setup(document.getElementById('editor-canvas'));

// Load cleaned image as background raster
const raster = new paper.Raster('data:image/png;base64,' + state.cleanedImage);
raster.locked = true;  // non-editable background

// Import SVG paths from potrace output
paper.project.importSVG(state.svg, {
    onLoad: function(item) {
        // SVG paths become editable Paper.js paths
        item.strokeColor = 'black';
        item.fillColor = null;
    }
});
```

**Step 2: Implement tools**

Tools to implement (each as a Paper.js `Tool`):
- **Pen tool** — Click to place anchor points, drag for bezier handles. Double-click to finish path.
- **Freehand tool** — `tool.onMouseDrag` draws free paths, simplified on mouse up.
- **Line tool** — Click start, click end.
- **Eraser tool** — Draws a path, then subtracts it from all overlapping paths using `path.subtract()`.
- **Rectangle tool** — Click and drag to define bounds.
- **Ellipse tool** — Click and drag to define bounds.
- **Select tool** — Click paths to select, show control points for editing. Drag to move.

**Step 3: Implement controls**

- Stroke width slider (1-20px)
- Undo/redo via `paper.project` history (store snapshots of project JSON)
- Zoom: scroll wheel → `paper.view.zoom`
- Pan: middle-click drag or space+drag → `paper.view.center`

**Step 4: Toolbar UI**

Vertical toolbar on the left with icon buttons for each tool. Active tool highlighted.

**Step 5: Test manually**

Run dev server, upload an image, verify:
- SVG paths load and are editable
- Each tool works
- Undo/redo works
- Zoom/pan works

**Step 6: Commit**

```bash
git add static/
git commit -m "feat: Paper.js vector editor with pen, freehand, eraser, and shape tools"
```

---

### Task 10: Frontend — Export Screen

**Files:**
- Modify: `static/index.html` (export section)
- Modify: `static/app.js` (export logic)
- Modify: `static/style.css` (export panel styles)

**Step 1: Build export UI**

- Parameter inputs: width (mm), thickness (mm), border (mm) with default values from spec
- "Generate STL" button
- "Download SVG" button
- "Download PNG" button
- Loading indicator during generation

**Step 2: Implement canvas rasterization**

```javascript
async function exportSTL() {
    // Rasterize the Paper.js canvas to a binary PNG
    const raster = paper.project.activeLayer.rasterize({ resolution: 300 });
    const dataUrl = raster.toDataURL();
    const blob = await (await fetch(dataUrl)).blob();

    const form = new FormData();
    form.append('file', blob, 'mask.png');
    form.append('width_mm', document.getElementById('width').value);
    form.append('thickness_mm', document.getElementById('thickness').value);
    form.append('border_mm', document.getElementById('border').value);

    const res = await fetch('/api/generate-stl', { method: 'POST', body: form });
    const stlBlob = await res.blob();

    // Trigger download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(stlBlob);
    a.download = 'stencil.stl';
    a.click();
}
```

**Step 3: Implement SVG and PNG downloads**

SVG: export `paper.project.exportSVG()` as a downloadable file.
PNG: rasterize canvas and download.

**Step 4: Test manually**

Upload an image, edit it, export STL. Open the STL in a slicer (Cura/PrusaSlicer) to verify it looks correct.

**Step 5: Commit**

```bash
git add static/
git commit -m "feat: export screen with STL, SVG, and PNG download"
```

---

### Task 11: Integration Testing & Polish

**Files:**
- Modify: `tests/test_api.py` (add integration test)
- Modify: various files for fixes

**Step 1: Write end-to-end integration test**

Add to `tests/test_api.py`:
```python
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
```

**Step 2: Run full test suite**

```bash
pytest tests/ -v
```

Expected: All tests PASS

**Step 3: Fix any issues found during manual testing**

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: integration tests and polish"
```

---

### Task 12: Final Verification

**Step 1: Run full test suite one last time**

```bash
pytest tests/ -v
```

**Step 2: Start the server and do a full manual walkthrough**

```bash
uvicorn app.main:app --port 8000
```

1. Open http://localhost:8000
2. Drag and drop a real scanned drawing
3. Verify cleaned image looks correct
4. Edit with each tool
5. Export STL and open in a slicer
6. Download SVG and PNG

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: img2stl v1.0 — drawing-to-stencil web app"
```
