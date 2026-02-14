# Drawing-to-Stencil Web App Design

## Overview

A locally hosted web application that takes a photo/scan of a hand drawing on lined paper and produces a 3D-printable STL stencil file suitable for airbrushing. Users drag-and-drop images, review and edit the cleaned result in a vector editor, then export an STL.

## Architecture

```
Browser (Paper.js editor)  <-->  FastAPI backend  <-->  OpenCV/NumPy/numpy-stl pipeline
```

## User Flow

Three-screen flow:

1. **Upload** — Drag-and-drop an image of a hand drawing on lined paper
2. **Edit** — Paper.js vector editor with the cleaned image; draw, erase, edit bezier paths, add shapes
3. **Export** — Configure STL parameters, preview, and download STL (+ optional SVG/PNG)

## Backend (FastAPI + Python)

### Endpoints

- `POST /upload` — Accepts image, runs cleaning pipeline, returns cleaned PNG
- `POST /generate-stl` — Accepts final edited image (rasterized from editor), generates STL, returns file download
- `POST /generate-svg` — Runs potrace on cleaned/edited image, returns SVG
- Static file serving for the frontend (HTML/JS/CSS)

### Image Cleaning Pipeline

From the validated approach in `stencil-pipeline.md`:

1. Convert to HSV color space
2. Identify ink by darkness (grayscale < 140) OR saturated blue ink (S > 80, V < 180, H in 90-135 range)
3. Detect residual horizontal lines via morphological opening (80x1 kernel), subtract lines not near thick ink strokes
4. Detect and remove red margin line via HSV hue filtering + vertical morphological opening
5. Clean with morphological open (remove noise) then close (connect gaps) using 3x3 elliptical kernel
6. Crop to bounding box with small margin

### STL Generation

Voxel/pixel extrusion approach:

- Downscale binary image to ~400px wide
- Ink pixels = cutouts, non-ink pixels = solid plate
- Add 3mm solid border frame
- Generate rectangular prism per solid pixel (optimize: side faces only at boundaries)
- Default parameters: 150mm width, 0.8mm thickness, 3mm border

## Frontend (Vanilla JS + Paper.js)

No build step. Paper.js loaded from CDN.

### Upload Screen

- Drag-and-drop zone with file picker fallback
- Image preview before submission

### Editor Screen

Paper.js canvas with:

- **Tools:** Pen (bezier paths with control point editing), line, freehand draw, eraser (path subtraction), rectangle, ellipse
- **Controls:** Adjustable stroke width, undo/redo, zoom/pan
- **Layers:** Cleaned image as background raster, vector edits on top
- On load: cleaned image is vectorized via potrace, SVG paths loaded into Paper.js as editable vector paths

### Export Screen

- STL parameter inputs: width (mm), thickness (mm), border (mm)
- Download buttons for STL, SVG, cleaned PNG
- 3D preview if feasible (stretch goal)

## Editor-to-STL Flow

1. Image uploaded and cleaned (backend)
2. Potrace converts cleaned image to SVG (backend)
3. SVG paths loaded into Paper.js as editable vectors (frontend)
4. User edits paths
5. On export: Paper.js canvas rasterized to binary image at target resolution (frontend)
6. Binary image sent to backend for STL generation

## Dependencies

### Python

- fastapi
- uvicorn
- opencv-python-headless
- numpy
- numpy-stl
- python-multipart

### System

- potrace (`brew install potrace`)

### Frontend

- Paper.js (CDN, no build step)

## File Structure

```
img2stl/
  app/
    main.py          # FastAPI app, routes, static file serving
    pipeline.py      # Image cleaning pipeline
    stl_generator.py # STL generation from binary image
  static/
    index.html       # Single-page app
    app.js           # Frontend logic, Paper.js editor
    style.css        # Styles
  requirements.txt
```
