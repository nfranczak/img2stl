import io
import struct

import cv2
import numpy as np


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
    h, w = padded.shape

    # Recalculate pixel size so padded width maps exactly to width_mm
    pixel_mm = width_mm / w

    # Build solid grid: True = solid (not ink), False = cutout (ink)
    solid = padded < 128

    # Find coordinates of all solid pixels
    rows, cols = np.where(solid)
    if len(rows) == 0:
        # Edge case: entirely cutout — return a minimal valid STL
        return _write_stl(np.array([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]))

    n = len(rows)
    z_top = thickness_mm
    z_bot = 0.0

    # Compute pixel corner coordinates for all solid pixels at once
    x0 = cols.astype(np.float32) * pixel_mm
    x1 = (cols + 1).astype(np.float32) * pixel_mm
    y0 = rows.astype(np.float32) * pixel_mm
    y1 = (rows + 1).astype(np.float32) * pixel_mm

    zt = np.full(n, z_top, dtype=np.float32)
    zb = np.full(n, z_bot, dtype=np.float32)

    # --- Top and bottom faces (always present for every solid pixel) ---
    # Top face: 2 triangles per pixel = 2n triangles
    top1 = np.stack([
        np.stack([x0, y0, zt], axis=1),
        np.stack([x1, y0, zt], axis=1),
        np.stack([x1, y1, zt], axis=1),
    ], axis=1)
    top2 = np.stack([
        np.stack([x0, y0, zt], axis=1),
        np.stack([x1, y1, zt], axis=1),
        np.stack([x0, y1, zt], axis=1),
    ], axis=1)

    # Bottom face: 2 triangles per pixel (reversed winding)
    bot1 = np.stack([
        np.stack([x0, y0, zb], axis=1),
        np.stack([x1, y1, zb], axis=1),
        np.stack([x1, y0, zb], axis=1),
    ], axis=1)
    bot2 = np.stack([
        np.stack([x0, y0, zb], axis=1),
        np.stack([x0, y1, zb], axis=1),
        np.stack([x1, y1, zb], axis=1),
    ], axis=1)

    face_tris = [top1, top2, bot1, bot2]

    # --- Side faces (only at boundaries) ---
    # Pad solid grid for safe neighbor lookups
    solid_padded = np.pad(solid, 1, constant_values=False)
    # Neighbor checks using the padded grid (offset by 1)
    r = rows + 1  # offset into padded grid
    c = cols + 1

    # Left boundary: col==0 or left neighbor is not solid
    left_mask = ~solid_padded[r, c - 1]
    if np.any(left_mask):
        lx0, ly0, ly1 = x0[left_mask], y0[left_mask], y1[left_mask]
        lzt, lzb = zt[left_mask], zb[left_mask]
        face_tris.append(np.stack([
            np.stack([lx0, ly0, lzb], axis=1),
            np.stack([lx0, ly0, lzt], axis=1),
            np.stack([lx0, ly1, lzt], axis=1),
        ], axis=1))
        face_tris.append(np.stack([
            np.stack([lx0, ly0, lzb], axis=1),
            np.stack([lx0, ly1, lzt], axis=1),
            np.stack([lx0, ly1, lzb], axis=1),
        ], axis=1))

    # Right boundary
    right_mask = ~solid_padded[r, c + 1]
    if np.any(right_mask):
        rx1, ry0, ry1 = x1[right_mask], y0[right_mask], y1[right_mask]
        rzt, rzb = zt[right_mask], zb[right_mask]
        face_tris.append(np.stack([
            np.stack([rx1, ry0, rzb], axis=1),
            np.stack([rx1, ry1, rzt], axis=1),
            np.stack([rx1, ry0, rzt], axis=1),
        ], axis=1))
        face_tris.append(np.stack([
            np.stack([rx1, ry0, rzb], axis=1),
            np.stack([rx1, ry1, rzb], axis=1),
            np.stack([rx1, ry1, rzt], axis=1),
        ], axis=1))

    # Top edge (y0 side)
    top_edge_mask = ~solid_padded[r - 1, c]
    if np.any(top_edge_mask):
        tx0, tx1, ty0 = x0[top_edge_mask], x1[top_edge_mask], y0[top_edge_mask]
        tzt, tzb = zt[top_edge_mask], zb[top_edge_mask]
        face_tris.append(np.stack([
            np.stack([tx0, ty0, tzb], axis=1),
            np.stack([tx1, ty0, tzt], axis=1),
            np.stack([tx0, ty0, tzt], axis=1),
        ], axis=1))
        face_tris.append(np.stack([
            np.stack([tx0, ty0, tzb], axis=1),
            np.stack([tx1, ty0, tzb], axis=1),
            np.stack([tx1, ty0, tzt], axis=1),
        ], axis=1))

    # Bottom edge (y1 side)
    bot_edge_mask = ~solid_padded[r + 1, c]
    if np.any(bot_edge_mask):
        bx0, bx1, by1 = x0[bot_edge_mask], x1[bot_edge_mask], y1[bot_edge_mask]
        bzt, bzb = zt[bot_edge_mask], zb[bot_edge_mask]
        face_tris.append(np.stack([
            np.stack([bx0, by1, bzb], axis=1),
            np.stack([bx0, by1, bzt], axis=1),
            np.stack([bx1, by1, bzt], axis=1),
        ], axis=1))
        face_tris.append(np.stack([
            np.stack([bx0, by1, bzb], axis=1),
            np.stack([bx1, by1, bzt], axis=1),
            np.stack([bx1, by1, bzb], axis=1),
        ], axis=1))

    # Concatenate all triangles
    all_tris = np.concatenate(face_tris, axis=0)
    return _write_stl(all_tris)


def _write_stl(triangles: np.ndarray) -> bytes:
    """Write triangles to binary STL format. triangles shape: (N, 3, 3)."""
    n = len(triangles)
    tris = triangles.astype(np.float32)

    # Binary STL: 50 bytes per triangle
    # normal (3 floats = 12 bytes) + 3 vertices (9 floats = 36 bytes) + attr (uint16 = 2 bytes)
    record_dtype = np.dtype([
        ('normal', np.float32, (3,)),
        ('v', np.float32, (9,)),
        ('attr', np.uint16),
    ])
    records = np.zeros(n, dtype=record_dtype)
    records['v'] = tris.reshape(n, 9)

    buf = io.BytesIO()
    buf.write(b'\0' * 80)  # header
    buf.write(struct.pack('<I', n))  # triangle count
    buf.write(records.tobytes())  # all triangles at once
    return buf.getvalue()
