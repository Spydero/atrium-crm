"""Check the image links that readers open from the GitHub gallery."""
import re
import subprocess
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GALLERY = Path("design/screenshots")
CURRENT = GALLERY / "current"
LINKS = re.findall(r"\]\((current/[^)]+\.(?:jpg|jpeg|png|webp))\)",
                   (ROOT / GALLERY / "README.md").read_text())
TRACKED = set(subprocess.check_output(
    ["git", "ls-files", "--", str(CURRENT)], cwd=ROOT, text=True
).splitlines())


def test_gallery_indexes_all_current_screenshots():
    assert LINKS, "No screenshot links found in the gallery"
    assert {str(GALLERY / link) for link in LINKS} == {
        path for path in TRACKED if Path(path).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    }


@pytest.mark.parametrize("link", LINKS)
def test_linked_image_decodes(link):
    with Image.open(ROOT / GALLERY / link) as image:
        image.load()
