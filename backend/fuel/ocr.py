import os
import re

# Optional: pytesseract / Pillow for OCR features
try:
    import pytesseract
    from PIL import Image, UnidentifiedImageError

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


def _load_image(image):
    """
    Normalize whatever we were handed into a PIL Image that pytesseract
    can actually work with.

    `pytesseract.image_to_string` only accepts a PIL Image, a numpy
    array, or a file path string — it does NOT accept Django's
    UploadedFile / InMemoryUploadedFile / TemporaryUploadedFile objects
    (what `serializer.validated_data["vehicle_image"]` gives you), even
    though those objects are file-like. Passing one straight through
    raises `TypeError: Unsupported image object` immediately, before any
    actual OCR is attempted — every single call fails this way
    regardless of how clear the plate photo is, which looks identical to
    "OCR couldn't read the plate" from the caller's point of view.

    PIL.Image.open() accepts a path, bytes, or any file-like object
    (seeking to zero for us), so route everything through it unless it's
    already a PIL Image.
    """

    if isinstance(image, Image.Image):
        return image

    try:
        pil_image = Image.open(image)
        pil_image.load()
    except UnidentifiedImageError as exc:
        raise ValueError(
            "Could not identify the uploaded file as an image."
        ) from exc

    return pil_image


def extract_number_plate(image):
    """
    Extract possible vehicle number from image using OCR.

    `image` can be a file path, a file-like/Django UploadedFile object,
    or an already-opened PIL Image.

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

    pil_image = _load_image(image)

    # Try a few page-segmentation modes in order of preference:
    #   6  - assume a single uniform block of text (best for a tight,
    #        cropped-in shot of just the plate)
    #   11 - sparse text, no particular order (best for a fuller scene
    #        photo where the plate is a small part of the frame, which is
    #        the common case for a phone camera capture)
    #   3  - fully automatic page segmentation, no OSD (general fallback)
    for psm in ("6", "11", "3"):
        try:
            text = pytesseract.image_to_string(
                pil_image,
                config=f"--psm {psm}"
            )
        except pytesseract.TesseractNotFoundError as exc:
            # Make this failure mode distinct from "couldn't read the
            # plate" — it means the tesseract binary itself couldn't be
            # found, not that OCR ran and failed. Set TESSERACT_CMD or
            # install tesseract-ocr.
            raise RuntimeError(
                "Tesseract binary not found. Install tesseract-ocr on "
                "this machine or set the TESSERACT_CMD environment "
                "variable to its path."
            ) from exc

        if not text:
            continue

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


# Character pairs that OCR engines routinely confuse because the glyphs
# look alike (0/O, 1/I, 1/L, 5/S, 8/B, 2/Z, 6/G, 0/D, 0/Q). Used to allow
# a *deliberately narrow* amount of tolerance when comparing an OCR
# reading against the plate number already on file for the truck —
# tolerating a look-alike misread is very different from tolerating an
# arbitrary character difference, which could just as easily mean "this
# is actually a different truck".
_CONFUSABLE_PAIRS = frozenset({
    frozenset({"0", "O"}),
    frozenset({"1", "I"}),
    frozenset({"1", "L"}),
    frozenset({"5", "S"}),
    frozenset({"8", "B"}),
    frozenset({"2", "Z"}),
    frozenset({"6", "G"}),
    frozenset({"0", "D"}),
    frozenset({"0", "Q"}),
})


def is_confusable_pair(a, b):
    """True if `a` and `b` are a single character each and are a known
    OCR look-alike pair (e.g. '0' and 'O')."""
    return frozenset({a, b}) in _CONFUSABLE_PAIRS


def fuzzy_plate_match(detected, expected, max_mismatches=1):
    """
    Compare an OCR-detected plate number against the expected plate
    number on file, tolerating a small number of common OCR look-alike
    misreads (see _CONFUSABLE_PAIRS) instead of requiring a byte-for-byte
    match.

    This is intentionally conservative:
      - both strings must already be normalize_plate_number()'d
      - lengths must match exactly (no tolerance for a dropped/extra
        character, since that changes which characters line up and is a
        much easier way to accidentally match a different plate)
      - at most `max_mismatches` differing positions are allowed (default 1)
      - every differing position must be a *known look-alike pair*, not
        just any two different characters — this is what keeps two
        genuinely different plates (e.g. sequential registrations) from
        slipping through as a "close enough" match

    Returns a tuple: (is_match: bool, mismatch_count: int).
    `mismatch_count` is 0 for an exact match, and > 0 when the match was
    only accepted due to look-alike tolerance — callers should use this
    to flag/audit auto-corrected approvals rather than treating them
    identically to an exact read.
    """

    if detected == expected:
        return True, 0

    if len(detected) != len(expected):
        return False, None

    diffs = [
        (a, b) for a, b in zip(detected, expected) if a != b
    ]

    if len(diffs) > max_mismatches:
        return False, None

    if not all(is_confusable_pair(a, b) for a, b in diffs):
        return False, None

    return True, len(diffs)