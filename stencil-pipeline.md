# Drawing-to-Stencil Pipeline

## Goal
Build a CLI tool that takes a photo/scan of a hand drawing on lined paper and produces a 3D-printable STL stencil file suitable for airbrushing. The stencil is a thin flat plate with the drawing lines cut through as openings.

## Pipeline Steps

### 1. Clean the scanned drawing
The input is a photo of ink drawing on ruled notebook paper. We need to extract just the ink and remove:
- Horizontal ruled lines (light blue)
- Red margin line
- Paper texture and uneven lighting

**Approach that worked:**
- Convert to HSV color space
- Identify ink by darkness (grayscale < 140) OR saturated blue ink (S > 80, V < 180, H in 90-135 range)
- Detect residual horizontal lines via morphological opening with a wide horizontal kernel (80×1), then subtract lines that aren't near thick ink strokes
- Detect and remove the red margin line via HSV hue filtering + vertical morphological opening
- Clean with morphological open (remove noise) then close (connect gaps) using a 3×3 elliptical kernel
- Crop to bounding box of the drawing with small margin

**Key dependencies:** OpenCV (cv2), NumPy

### 2. Vectorize (optional, for SVG output)
- Use `potrace` (system tool, `apt install potrace`) on a BMP of the cleaned binary image
- `potrace input.bmp -s -o output.svg --turdsize 10 --alphamax 1.0`
- turdsize removes small speck contours, alphamax controls corner smoothing

### 3. Generate STL stencil
Convert the cleaned binary image into a 3D-printable stencil:

- **Ink pixels = cutouts** (where airbrush paint passes through)
- **Non-ink pixels = solid plate** (the stencil body)
- Add a solid border frame (~3mm) around the entire design

**Approach that worked — voxel/pixel extrusion:**
- Downscale the binary image to a reasonable mesh resolution (~400px wide)
- For each solid (non-ink) pixel, generate a rectangular prism (6 faces = 12 triangles)
- Optimize by only generating side faces at boundaries between solid and cutout regions
- Top and bottom faces for every solid pixel

**Parameters:**
- Stencil width: 150mm (configurable)
- Thickness: 0.8mm (good for airbrushing — 2 layers at 0.4mm layer height)
- Frame border: 3mm
- Mesh resolution: ~0.4mm per pixel at 400px grid width

**Key dependency:** numpy-stl for STL file writing

### 4. Output files
- `stencil.stl` — the 3D printable file
- `drawing.svg` — vector version for editing/rescaling
- `cleaned.png` — the processed binary image

## Stencil Design Notes

- **Bridges:** For this particular drawing style (continuous flowing lines), bridges aren't a major concern since the lines form an interconnected network. For drawings with isolated closed shapes (like the inside of an O), you'd need to add bridges — thin connecting strips that keep island pieces attached to the main stencil body.
- **Thickness:** 0.8mm is a sweet spot. Thinner risks warping, thicker creates more paint shadow/offset from the surface.
- **Print settings:** 100% infill, PLA or PETG, print flat on bed.
- **Mesh quality:** Slicers (Cura, PrusaSlicer) will auto-repair non-manifold edges from the voxel approach. Alternatively, a contour-based extrusion with proper triangulation (ear clipping or Delaunay on polygon outlines) produces cleaner meshes but is significantly more complex to implement.

## Potential Improvements
- Accept threshold/sensitivity parameters for different ink colors and paper types
- Auto-detect and add bridges for isolated closed regions
- Use contour-based extrusion (potrace SVG → extrude polygon outlines) instead of voxel approach for smaller file sizes and smoother edges
- Support multi-color stencils (separate layers for different ink colors, e.g. the blue and black in this drawing)
- Add registration marks for multi-layer alignment
