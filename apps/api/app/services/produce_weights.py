from __future__ import annotations

from decimal import Decimal
import re
import unicodedata
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ProduceReference:
    name: str
    average_weight_grams: Decimal
    edible_yield_rate: Decimal


PRODUCE_REFERENCES: list[tuple[tuple[str, ...], ProduceReference]] = [
    (("chou fleur", "cauliflower"), ProduceReference("Chou-fleur", Decimal("1500"), Decimal("0.60"))),
    (("brocoli", "broccoli"), ProduceReference("Brocoli", Decimal("500"), Decimal("0.60"))),
    (("carotte", "carrot"), ProduceReference("Carotte", Decimal("125"), Decimal("0.90"))),
    (("oignon rouge",), ProduceReference("Oignon rouge", Decimal("110"), Decimal("0.90"))),
    (("oignon blanc",), ProduceReference("Oignon blanc", Decimal("110"), Decimal("0.90"))),
    (("oignon jaune",), ProduceReference("Oignon jaune", Decimal("110"), Decimal("0.90"))),
    (("oignon",), ProduceReference("Oignon", Decimal("110"), Decimal("0.90"))),
    (("poireau",), ProduceReference("Poireau", Decimal("150"), Decimal("0.90"))),
    (("pomme de terre", "potato"), ProduceReference("Pomme de terre", Decimal("213"), Decimal("0.90"))),
    (("tomate", "tomato"), ProduceReference("Tomate", Decimal("125"), Decimal("0.90"))),
    (("concombre", "cucumber"), ProduceReference("Concombre", Decimal("200"), Decimal("0.90"))),
    (("courgette", "zucchini"), ProduceReference("Courgette", Decimal("196"), Decimal("0.90"))),
    (("laitue", "salade"), ProduceReference("Laitue", Decimal("275"), Decimal("0.90"))),
    (("pomme", "apple"), ProduceReference("Pomme", Decimal("182"), Decimal("0.75"))),
    (("poire", "pear"), ProduceReference("Poire", Decimal("178"), Decimal("0.75"))),
    (("banane", "banana"), ProduceReference("Banane", Decimal("118"), Decimal("1.00"))),
    (("orange",), ProduceReference("Orange", Decimal("200"), Decimal("0.60"))),
    (("clementine", "mandarine"), ProduceReference("Clémentine", Decimal("70"), Decimal("0.60"))),
    (("ananas", "pineapple"), ProduceReference("Ananas", Decimal("1400"), Decimal("0.50"))),
    (("avocat", "avocado"), ProduceReference("Avocat", Decimal("170"), Decimal("0.75"))),
    (("fraise", "strawberry"), ProduceReference("Fraise", Decimal("15"), Decimal("1.00"))),
    (("champignon",), ProduceReference("Champignon", Decimal("35"), Decimal("1.00"))),
    (("poivron", "bell pepper"), ProduceReference("Poivron", Decimal("150"), Decimal("0.90"))),
]


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    stripped = "".join(char for char in normalized if not unicodedata.combining(char))
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", stripped)
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def infer_produce_reference(name: str | None, category: str | None = None) -> ProduceReference | None:
    haystack = normalize_text(f"{name or ''} {category or ''}")
    if not haystack:
        return None
    for tokens, reference in PRODUCE_REFERENCES:
        if any(token in haystack for token in tokens):
            return reference
    return None


def suggest_inventory_weight_fields(
    *,
    name: str | None,
    category: str | None,
    average_weight_grams: Decimal | None = None,
    edible_yield_rate: Decimal | None = None,
    weight_source: str | None = None,
) -> dict[str, Any]:
    reference = infer_produce_reference(name, category)
    if not reference:
        return {
            "average_weight_grams": average_weight_grams,
            "edible_yield_rate": edible_yield_rate,
            "weight_source": weight_source,
        }
    next_average = average_weight_grams if average_weight_grams not in (None, Decimal("0")) else reference.average_weight_grams
    next_yield = edible_yield_rate if edible_yield_rate not in (None, Decimal("0")) else reference.edible_yield_rate
    return {
        "average_weight_grams": next_average,
        "edible_yield_rate": next_yield,
        "weight_source": weight_source or "REFERENCE",
    }


def normalize_recipe_unit_cost(
    *,
    source_unit: str,
    target_unit: str,
    base_unit_cost: Decimal,
    average_weight_grams: Decimal | None = None,
    edible_yield_rate: Decimal | None = None,
) -> Decimal:
    source = normalize_unit(source_unit)
    target = normalize_unit(target_unit)
    if source == target:
        return base_unit_cost
    if source in {"g", "kg"} and target in {"g", "kg"}:
        if source == "kg" and target == "g":
            return base_unit_cost / Decimal("1000")
        if source == "g" and target == "kg":
            return base_unit_cost * Decimal("1000")
        return base_unit_cost
    if source in {"l", "lt", "cl"} and target in {"l", "lt", "cl"}:
        if source in {"l", "lt"} and target == "cl":
            return base_unit_cost / Decimal("100")
        if source == "cl" and target in {"l", "lt"}:
            return base_unit_cost * Decimal("100")
        return base_unit_cost
    if source == "piece" and target in {"g", "kg"} and average_weight_grams and average_weight_grams > 0:
        yield_rate = edible_yield_rate if edible_yield_rate is not None else Decimal("1")
        edible_grams = average_weight_grams * yield_rate
        if edible_grams <= 0:
            return base_unit_cost
        cost_per_gram = base_unit_cost / edible_grams
        return cost_per_gram if target == "g" else cost_per_gram * Decimal("1000")
    if target == "piece" and source in {"g", "kg"} and average_weight_grams and average_weight_grams > 0:
        yield_rate = edible_yield_rate if edible_yield_rate is not None else Decimal("1")
        edible_grams = average_weight_grams * yield_rate
        if edible_grams <= 0:
            return base_unit_cost
        if source == "kg":
            return base_unit_cost * (edible_grams / Decimal("1000"))
        return base_unit_cost * edible_grams
    return base_unit_cost


def suggest_recipe_unit(
    *,
    stock_unit: str,
    average_weight_grams: Decimal | None = None,
    edible_yield_rate: Decimal | None = None,
) -> str:
    unit = normalize_unit(stock_unit)
    if unit == "piece" and average_weight_grams and average_weight_grams > 0:
        return "kg"
    if unit == "g":
        return "g"
    if unit in {"kg", "l", "lt", "cl"}:
        return unit
    return "kg" if average_weight_grams and average_weight_grams > 0 else stock_unit


def normalize_unit(value: str | None) -> str:
    if not value:
        return "piece"
    normalized = normalize_text(value)
    if normalized in {"piece", "pieces", "pcs", "pc", "u", "un", "unite", "unité"}:
        return "piece"
    if normalized in {"kg", "kilo", "kilos"}:
        return "kg"
    if normalized in {"g", "gr", "gramme", "grammes"}:
        return "g"
    if normalized in {"lt", "l", "litre", "litres"}:
        return "lt"
    if normalized in {"cl", "centilitre", "centilitres"}:
        return "cl"
    return normalized
