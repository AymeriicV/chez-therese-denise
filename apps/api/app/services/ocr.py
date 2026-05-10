from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha1
from io import BytesIO
from pathlib import Path
import re

import fitz
import pytesseract
from PIL import Image
from pypdf import PdfReader


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

    async def extract(
        self,
        path: Path,
        original_name: str,
        *,
        supplier_name: str | None = None,
        template: dict | None = None,
    ) -> ExtractedInvoice:
        text = self._extract_text(path)
        stem = Path(original_name).stem.replace("_", " ").replace("-", " ").strip()
        selected_supplier = supplier_name or self._extract_supplier(text) or self._guess_supplier(stem)
        template_keywords = self._keywords_from_template(template)
        lines = self._extract_lines(text, template_keywords)
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
                    label=selected_supplier,
                    quantity=Decimal("1"),
                    unit="piece",
                    unit_price=line_total,
                    total=line_total,
                    tax_rate=Decimal("0"),
                    confidence=Decimal("0.3500"),
                )
            ]

        return ExtractedInvoice(
            supplier_name=selected_supplier,
            number=self._extract_number(text) or f"OCR-{self._stable_suffix(original_name)}",
            invoice_date=self._extract_date(text) or datetime.now(UTC),
            total_excluding_tax=total_ht,
            total_including_tax=total_ttc,
            confidence=self._confidence(text, lines, template_keywords),
            lines=lines,
            raw_payload={
                "engine": "ctd-local-ocr",
                "source": str(path),
                "supplier_candidate": selected_supplier,
                "text_length": len(text),
                "line_count": len(lines),
                "template_keywords": template_keywords,
                "template_name": template.get("name") if template else None,
            },
        )

    @staticmethod
    def _extract_text(path: Path) -> str:
        try:
            suffix = path.suffix.lower()
            if suffix in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
                return InvoiceOcrService._ocr_image(path)
            if suffix == ".pdf":
                text = InvoiceOcrService._extract_pdf_text(path)
                if len(text) >= 40:
                    return text
                return InvoiceOcrService._ocr_pdf(path)
            content = path.read_bytes()
        except FileNotFoundError:
            return ""
        decoded = content.decode("utf-8", errors="ignore")
        decoded = re.sub(r"\s+", " ", decoded)
        return decoded.strip()

    @staticmethod
    def _ocr_image(path: Path) -> str:
        try:
            with Image.open(path) as image:
                text = pytesseract.image_to_string(image, config="--psm 6")
        except Exception:
            return ""
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _extract_pdf_text(path: Path) -> str:
        try:
            reader = PdfReader(str(path))
        except Exception:
            return ""
        chunks = []
        for page in reader.pages[:4]:
            try:
                extracted = page.extract_text() or ""
            except Exception:
                extracted = ""
            if extracted:
                chunks.append(extracted)
        return re.sub(r"\s+", " ", " ".join(chunks)).strip()

    @staticmethod
    def _ocr_pdf(path: Path) -> str:
        chunks = []
        try:
            document = fitz.open(str(path))
        except Exception:
            return ""
        for index, page in enumerate(document):
            if index >= 4:
                break
            try:
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                with Image.open(BytesIO(pixmap.tobytes("png"))) as image:
                    chunks.append(pytesseract.image_to_string(image, config="--psm 6"))
            except Exception:
                continue
        return re.sub(r"\s+", " ", " ".join(chunks)).strip()

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
    def _extract_lines(cls, text: str, template_keywords: list[str] | None = None) -> list[ExtractedInvoiceLine]:
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
        if not lines and template_keywords:
            for keyword in template_keywords[:5]:
                if keyword and keyword.lower() in text.lower():
                    lines.append(
                        ExtractedInvoiceLine(
                            label=keyword[:180],
                            quantity=Decimal("1"),
                            unit="piece",
                            unit_price=Decimal("0"),
                            total=Decimal("0"),
                            tax_rate=Decimal("0"),
                            confidence=Decimal("0.4200"),
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

    @staticmethod
    def _keywords_from_template(template: dict | None) -> list[str]:
        if not template:
            return []
        raw = template.get("keywordHints") or template.get("keyword_hints") or []
        if isinstance(raw, list):
            return [str(item).strip() for item in raw if str(item).strip()]
        if isinstance(raw, str):
            return [segment.strip() for segment in re.split(r"[,;\n]", raw) if segment.strip()]
        return []

    @staticmethod
    def _confidence(text: str, lines: list[ExtractedInvoiceLine], template_keywords: list[str]) -> Decimal:
        base = Decimal("0.3500")
        if text:
            base += Decimal("0.2500")
        if lines:
            base += min(Decimal("0.2500"), Decimal("0.0500") * Decimal(str(len(lines))))
        if template_keywords:
            base += Decimal("0.0500")
        return min(base, Decimal("0.9800")).quantize(Decimal("0.0001"))
