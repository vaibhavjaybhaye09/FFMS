import re

# Optional: pytesseract for OCR features
try:
    import pytesseract
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


def extract_number_plate(image):
    """
    Extract possible vehicle number from image using OCR.
    
    Requires pytesseract to be installed. Install with:
        pip install pytesseract
    """
    
    if not PYTESSERACT_AVAILABLE:
        raise ImportError(
            "pytesseract is not installed. Install it with: pip install pytesseract"
        )

    text = pytesseract.image_to_string(
        image,
        config="--psm 6"
    )

    if not text:
        return None

    # Normalize OCR output
    text = text.upper()

    # Remove unnecessary characters
    text = re.sub(
        r"[^A-Z0-9\s]",
        " ",
        text
    )

    # Split into possible values
    candidates = text.split()

    # Indian vehicle number pattern.
    #
    # Examples:
    # MH12AB1234
    # MH14XY1234
    # DL01AB1234
    # KA01AA1234
    #
    plate_pattern = re.compile(
        r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$"
    )

    for candidate in candidates:

        candidate = normalize_plate_number(
            candidate
        )

        if plate_pattern.match(candidate):
            return candidate

    return None