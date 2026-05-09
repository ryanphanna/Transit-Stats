import re


def normalize_route_for_ml(route, agency=None):
    """Normalize route labels for training and analytics without mutating raw trip text."""
    if route is None:
        return route

    route_str = str(route).strip()
    if not route_str:
        return route_str

    agency_str = str(agency or "").strip()

    # TTC variants should collapse to the numbered family so branches, shuttles,
    # and short turns reinforce the same core route class.
    if agency_str == "TTC":
        match = re.match(r"^(\d+)", route_str)
        return match.group(1) if match else route_str

    # For other agencies, preserve the route identity while normalizing compact
    # alphanumeric formatting like 18c -> 18C or 1t -> 1T.
    compact = re.match(r"^(\d+)([a-zA-Z]+)$", route_str)
    if compact:
        return f"{compact.group(1)}{compact.group(2).upper()}"

    # Single-letter routes are usually meaningful route IDs (e.g. K, N).
    if re.match(r"^[A-Za-z]$", route_str):
        return route_str.upper()

    return route_str
