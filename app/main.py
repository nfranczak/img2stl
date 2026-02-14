import base64

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import Response
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
