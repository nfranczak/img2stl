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
