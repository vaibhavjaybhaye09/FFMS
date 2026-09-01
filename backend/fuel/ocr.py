import os
import re

# Optional: pytesseract for OCR features
try:
    import pytesseract

    # Only override the binary path if explicitly configured via env var.
    # On Linux (e.g. `apt install tesseract-ocr`) the binary is already on
    # PATH, so pytesseract finds it automatically — no override needed.
    # Hardcoding a Windows-only path here broke OCR on every other OS.
    _tesseract_cmd = os.environ.get("TESSERACT_CMD")
    if _tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = _tesseract_cmd

    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False


def normalize_plate_number(number):
    """
    Normalize Indian vehicle registration numbers.

    Example:
        MH 12 AB 1234
        MH-12-AB-1234
        mh12ab1234

    All become:
        MH12AB1234
    """

    if not number:
        return ""

    number = number.upper()

    # Remove spaces, -, _, ., etc.
    number = re.sub(r"[^A-Z0-9]", "", number)

    return number


# Indian vehicle number pattern.
#
# Examples:
# MH12AB1234
# MH14XY1234
# DL01AB1234
# KA01AA1234
#
_PLATE_PATTERN = re.compile(
    r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$"
)


def _candidate_strings(text):
    """
    Build an ordered list of candidate strings to test against the plate
    pattern.

    Real plate photos are frequently OCR'd as two lines (state+RTO code on
    one line, series+number on the next) or with irregular spacing. The
    original implementation only split on whitespace and tested each token
    on its own, so a plate split across a line break (e.g. "MH12" / "AB1234")
    could never match — each half fails the full pattern independently and
    is never recombined.

    This tries, in order of reliability:
      1. individual lines (most reliable single-line reads)
      2. individual whitespace-separated tokens (original behavior)
      3. adjacent line pairs joined together (handles a plate split
         across two OCR'd lines)
      4. the entire text with all whitespace removed (last resort)
    """

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    tokens = text.split()

    candidates = list(lines)
    candidates.extend(tokens)

    for i in range(len(lines) - 1):
        candidates.append(lines[i] + lines[i + 1])

    candidates.append(re.sub(r"\s+", "", text))

    return candidates


def extract_number_plate(image):
    """
    Extract possible vehicle number from image using OCR.

    Requires pytesseract (and the Tesseract binary) to be installed.
        pip install pytesseract
        # plus the Tesseract OCR engine itself, e.g.:
        #   Linux:   apt-get install tesseract-ocr
        #   macOS:   brew install tesseract
        #   Windows: install from https://github.com/UB-Mannheim/tesseract/wiki
        # If the binary isn't on PATH, set the TESSERACT_CMD env var to its
        # full path.
    """

    if not PYTESSERACT_AVAILABLE:
        raise ImportError(
            "pytesseract is not installed. Install it with: pip install pytesseract"
        )

    try:
        text = pytesseract.image_to_string(
            image,
            config="--psm 6"
        )
    except pytesseract.TesseractNotFoundError as exc:
        # Make this failure mode distinct from "couldn't read the plate" —
        # it means the tesseract binary itself couldn't be found, not that
        # OCR ran and failed. Set TESSERACT_CMD or install tesseract-ocr.
        raise RuntimeError(
            "Tesseract binary not found. Install tesseract-ocr on this "
            "machine or set the TESSERACT_CMD environment variable to its "
            "path."
        ) from exc

    if not text:
        return None

    # Normalize OCR output
    text = text.upper()

    # Remove unnecessary characters (keep whitespace so line structure
    # survives for multi-line matching below)
    text = re.sub(
        r"[^A-Z0-9\s]",
        " ",
        text
    )

    for candidate in _candidate_strings(text):

        candidate = normalize_plate_number(
            candidate
        )

        if _PLATE_PATTERN.match(candidate):
            return candidate

    return None