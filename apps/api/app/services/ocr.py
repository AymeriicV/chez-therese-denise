from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha1
from pathlib import Path


@dataclass(frozen=True)
class ExtractedInvoiceLine:
    label: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    total: Decimal
    tax_rate: Decimal
    confidence: Decimal


@dataclass(frozen=True)
class ExtractedInvoice:
    supplier_name: str
    number: str
    invoice_date: datetime
    total_excluding_tax: Decimal
    total_including_tax: Decimal
    confidence: Decimal
    lines: list[ExtractedInvoiceLine]
    raw_payload: dict


class InvoiceOcrService:
    """Deterministic OCR adapter placeholder with the shape expected by production AI OCR."""

    async def extract(self, path: Path, original_name: str) -> ExtractedInvoice:
        stem = Path(original_name).stem.replace("_", " ").replace("-", " ").strip() or "Facture fournisseur"
        supplier_name = self._guess_supplier(stem)
        base = Decimal(42 + (len(original_name) % 80))
        lines = [
            ExtractedInvoiceLine(
                label="Marchandises cuisine",
                quantity=Decimal("3"),
                unit="kg",
                unit_price=(base / Decimal("3")).quantize(Decimal("0.0001")),
                total=base,
                tax_rate=Decimal("5.50"),
                confidence=Decimal("0.9100"),
            ),
            ExtractedInvoiceLine(
                label="Frais logistiques",
                quantity=Decimal("1"),
                unit="forfait",
                unit_price=Decimal("8.50"),
                total=Decimal("8.50"),
                tax_rate=Decimal("20.00"),
                confidence=Decimal("0.8700"),
            ),
        ]
        total_ht = sum((line.total for line in lines), Decimal("0")).quantize(Decimal("0.01"))
        total_ttc = (total_ht * Decimal("1.085")).quantize(Decimal("0.01"))
        now = datetime.now(UTC)

        return ExtractedInvoice(
            supplier_name=supplier_name,
            number=f"OCR-{now.strftime('%Y%m%d')}-{self._stable_suffix(original_name)}",
            invoice_date=now,
            total_excluding_tax=total_ht,
            total_including_tax=total_ttc,
            confidence=Decimal("0.9025"),
            lines=lines,
            raw_payload={
                "engine": "ctd-deterministic-adapter",
                "source": str(path),
                "supplier_candidate": supplier_name,
                "fields": {
                    "number": "high",
                    "date": "medium",
                    "totals": "high",
                    "lines": "medium",
                },
            },
        )

    @staticmethod
    def _guess_supplier(stem: str) -> str:
        words = [word.capitalize() for word in stem.split() if word]
        if not words:
            return "Fournisseur inconnu"
        return " ".join(words[:3])

    @staticmethod
    def _stable_suffix(value: str) -> str:
        return sha1(value.encode("utf-8")).hexdigest()[:4].upper()
