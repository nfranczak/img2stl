import numpy as np
from stl import mesh as stl_mesh
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

    # Estimate pixel size to compute border in pixels, then recalculate
    # after padding so total width (including border) equals width_mm
    pixel_mm_est = width_mm / w
    border_px = max(1, int(border_mm / pixel_mm_est))

    # Add border frame: expand image and mark border as solid
    padded = np.zeros((h + 2 * border_px, w + 2 * border_px), dtype=np.uint8)
    padded[border_px:border_px + h, border_px:border_px + w] = mask
    # Border stays 0 (solid), only interior ink pixels are cutouts
    h, w = padded.shape

    # Recalculate pixel size so padded width maps exactly to width_mm
    pixel_mm = width_mm / w

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
