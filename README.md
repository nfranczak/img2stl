# img2stl

Turn hand-drawn images into 3D-printable stencils.

Upload a photo of a drawing on paper (even lined notebook paper), and img2stl will clean it up, vectorize it, let you edit it, and export a ready-to-print STL file.

## Requirements

- Python 3.9+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [potrace](http://potrace.sourceforge.net/) (vector tracing)

Install potrace on macOS:

```
brew install potrace
```

## Quick Start

```
make setup
make run
```

Then open http://localhost:8000.

## Makefile Targets

| Target | Description |
|---|---|
| `make setup` | Create venv and install dependencies |
| `make install` | Install dependencies (venv must exist) |
| `make run` | Start the dev server on port 8000 |
| `make test` | Run the test suite |
| `make clean` | Remove cached/generated files |

## How It Works

1. **Upload** a photo of a hand drawing (PNG, JPG, WEBP)
2. The backend cleans the image: detects ink, removes ruled lines and red margins, crops to content
3. The cleaned image is vectorized with potrace and loaded into a **Paper.js vector editor**
4. Edit the drawing using pen, freehand, line, rectangle, ellipse, and eraser tools
5. **Export** as an STL stencil file, SVG, or PNG

## Editor Controls

| Action | Input |
|---|---|
| Pan | Two-finger swipe / Space + drag |
| Zoom | Pinch / Ctrl + scroll |
| Fit to screen | F |
| Select | V |
| Pen (bezier) | P |
| Freehand brush | B |
| Line | L |
| Eraser | E |
| Rectangle | R |
| Ellipse | O |
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Delete selected | Delete / Backspace |
| Finish pen path | Enter / double-click |
| Cancel pen path | Escape |

## STL Parameters

| Parameter | Default | Description |
|---|---|---|
| **Width** (mm) | 150 | Total width of the stencil plate. Height scales proportionally. |
| **Thickness** (mm) | 0.8 | How thick the flat plate is. 0.8mm is a single 3D-print layer. |
| **Border** (mm) | 3 | Solid frame around the design for structural support. |

White areas in the drawing become **cutout holes** where paint sprays through. Everything else is the solid plate body.

## Project Structure

```
app/
  main.py          FastAPI app with API endpoints
  pipeline.py      Image cleaning pipeline (ink detection, line removal)
  stl_generator.py NumPy-vectorized STL mesh generation
  vectorize.py     Potrace SVG wrapper
static/
  index.html       Single-page app (3 screens)
  app.js           Frontend logic (editor, export, upload)
  style.css        Dark theme styles
tests/
  test_api.py      API endpoint tests
  test_pipeline.py Image pipeline tests
  test_stl_generator.py STL generation tests
  test_vectorize.py Potrace wrapper tests
```
