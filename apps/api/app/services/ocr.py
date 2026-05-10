from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha1
from pathlib import Path
import re


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
    """Local invoice extraction service used by the FastAPI invoice workflow."""

    async def extract(self, path: Path, original_name: str) -> ExtractedInvoice:
        text = self._extract_text(path)
        stem = Path(original_name).stem.replace("_", " ").replace("-", " ").strip()
        supplier_name = self._extract_supplier(text) or self._guess_supplier(stem)
        lines = self._extract_lines(text)
        total_ht = self._extract_amount(text, ("total ht", "total hors taxe", "montant ht"))
        total_ttc = self._extract_amount(text, ("total ttc", "net a payer", "net à payer", "total"))
        if total_ht is None:
            total_ht = sum((line.total for line in lines), Decimal("0")).quantize(Decimal("0.01"))
        if total_ttc is None:
            total_ttc = total_ht
        if not lines:
            line_total = total_ht if total_ht > 0 else Decimal("0")
            lines = [
                ExtractedInvoiceLine(
                    label=supplier_name,
                    quantity=Decimal("1"),
                    unit="piece",
                    unit_price=line_total,
                    total=line_total,
                    tax_rate=Decimal("0"),
                    confidence=Decimal("0.3500"),
                )
            ]

        return ExtractedInvoice(
            supplier_name=supplier_name,
            number=self._extract_number(text) or f"OCR-{self._stable_suffix(original_name)}",
            invoice_date=self._extract_date(text) or datetime.now(UTC),
            total_excluding_tax=total_ht,
            total_including_tax=total_ttc,
            confidence=Decimal("0.7800") if text else Decimal("0.3500"),
            lines=lines,
            raw_payload={
                "engine": "ctd-local-text-extractor",
                "source": str(path),
                "supplier_candidate": supplier_name,
                "text_length": len(text),
                "line_count": len(lines),
            },
        )

    @staticmethod
    def _extract_text(path: Path) -> str:
        try:
            content = path.read_bytes()
        except FileNotFoundError:
            return ""
        decoded = content.decode("utf-8", errors="ignore")
        decoded = re.sub(r"\s+", " ", decoded)
        return decoded.strip()

    @staticmethod
    def _extract_supplier(text: str) -> str | None:
        if not text:
            return None
        for candidate in re.split(r"[\r\n]+| {2,}", text):
            cleaned = candidate.strip(" -:\t")
            if len(cleaned) >= 3 and not re.search(r"\d{4,}", cleaned):
                return cleaned[:120]
        return None

    @staticmethod
    def _extract_number(text: str) -> str | None:
        match = re.search(r"(?:facture|invoice|numero|numéro|n[°o])\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})", text, re.IGNORECASE)
        return match.group(1)[:80] if match else None

    @staticmethod
    def _extract_date(text: str) -> datetime | None:
        match = re.search(r"\b(\d{2})[/-](\d{2})[/-](\d{4})\b", text)
        if not match:
            return None
        day, month, year = (int(part) for part in match.groups())
        try:
            return datetime(year, month, day, tzinfo=UTC)
        except ValueError:
            return None

    @classmethod
    def _extract_lines(cls, text: str) -> list[ExtractedInvoiceLine]:
        pattern = re.compile(
            r"(?P<label>[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 '._/-]{2,}?)\s+"
            r"(?P<qty>\d+(?:[,.]\d{1,3})?)\s*(?P<unit>kg|g|l|cl|piece|pcs|u|unite|unité|forfait)?\s+"
            r"(?P<unit_price>\d+(?:[,.]\d{1,4})?)\s+"
            r"(?P<total>\d+(?:[,.]\d{1,2})?)",
            re.IGNORECASE,
        )
        lines: list[ExtractedInvoiceLine] = []
        for match in pattern.finditer(text):
            lines.append(
                ExtractedInvoiceLine(
                    label=match.group("label").strip()[:180],
                    quantity=cls._to_decimal(match.group("qty"), Decimal("1")),
                    unit=(match.group("unit") or "piece").lower(),
                    unit_price=cls._to_decimal(match.group("unit_price"), Decimal("0")),
                    total=cls._to_decimal(match.group("total"), Decimal("0")),
                    tax_rate=Decimal("0"),
                    confidence=Decimal("0.7600"),
                )
            )
        return lines[:200]

    @classmethod
    def _extract_amount(cls, text: str, labels: tuple[str, ...]) -> Decimal | None:
        for label in labels:
            match = re.search(rf"{re.escape(label)}\s*[:=]?\s*(\d+(?:[,.]\d{{1,2}})?)", text, re.IGNORECASE)
            if match:
                return cls._to_decimal(match.group(1), Decimal("0")).quantize(Decimal("0.01"))
        return None

    @staticmethod
    def _to_decimal(value: str, default: Decimal) -> Decimal:
        try:
            return Decimal(value.replace(",", "."))
        except Exception:
            return default

    @staticmethod
    def _guess_supplier(stem: str) -> str:
        words = [word.capitalize() for word in stem.split() if word]
        if not words:
            return "Fournisseur inconnu"
        return " ".join(words[:3])

    @staticmethod
    def _stable_suffix(value: str) -> str:
        return sha1(value.encode("utf-8")).hexdigest()[:4].upper()
