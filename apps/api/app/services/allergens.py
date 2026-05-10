from __future__ import annotations

import unicodedata


ALLERGEN_RULES: dict[str, set[str]] = {
    "Poisson": {"lieu", "saumon", "cabillaud", "thon", "merlu", "poisson"},
    "Crustaces": {"crevette", "crabe", "homard", "langoustine", "ecrevisse"},
    "Mollusques": {"moule", "huitre", "palourde", "coque", "calamar", "seiche"},
    "Lait": {"lait", "creme", "beurre", "fromage", "yaourt"},
    "Gluten": {"farine", "ble", "pain", "seigle", "orge", "avoine"},
    "Oeufs": {"oeuf", "oeufs", "mayonnaise"},
    "Arachides": {"arachide", "cacahuete"},
    "Fruits a coque": {"amande", "noisette", "noix", "pistache", "cajou"},
    "Soja": {"soja"},
    "Moutarde": {"moutarde"},
    "Celeri": {"celeri"},
    "Sesame": {"sesame"},
    "Sulfites": {"sulfites", "sulfite", "vinaigre", "vin"},
}


def detect_allergens(name: str | None, category: str | None) -> list[str]:
    haystack = _normalize(" ".join(part for part in [name, category] if part))
    detected = [
        allergen
        for allergen, keywords in ALLERGEN_RULES.items()
        if any(keyword in haystack for keyword in keywords)
    ]
    return sorted(detected)


def merge_allergens(manual: list[str] | None, detected: list[str]) -> list[str]:
    values = [*(manual or []), *detected]
    return sorted({value.strip() for value in values if value and value.strip()})


def _normalize(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return ascii_value.lower()
