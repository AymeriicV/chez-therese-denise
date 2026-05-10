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
        lines, structured_rows = self._extract_lines(text, template_keywords, supplier_name=selected_supplier)
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
                "structured_rows": structured_rows,
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
                variants = [
                    pytesseract.image_to_string(image, config="--psm 6"),
                    pytesseract.image_to_string(image, config="--psm 4"),
                    pytesseract.image_to_string(image.resize((image.width * 2, image.height * 2)), config="--psm 6"),
                ]
        except Exception:
            return ""
        return InvoiceOcrService._merge_ocr_variants(variants)

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
        return InvoiceOcrService._normalize_text("\n".join(chunks))

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
                    chunks.extend(
                        [
                            pytesseract.image_to_string(image, config="--psm 6"),
                            pytesseract.image_to_string(image, config="--psm 4"),
                        ]
                    )
            except Exception:
                continue
        return InvoiceOcrService._merge_ocr_variants(chunks)

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
    def _extract_lines(
        cls,
        text: str,
        template_keywords: list[str] | None = None,
        *,
        supplier_name: str | None = None,
    ) -> tuple[list[ExtractedInvoiceLine], list[dict]]:
        if cls._is_transgourmet_supplier(supplier_name, template_keywords, text):
            transgourmet_lines, structured_rows = cls._extract_transgourmet_lines(text)
            if transgourmet_lines:
                return transgourmet_lines, structured_rows
        lines: list[ExtractedInvoiceLine] = []
        seen_labels: set[str] = set()
        table_started = False
        for raw_line in text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip(" |:;")
            lowered = line.lower()
            if not table_started:
                if ("article" in lowered and "designation" in lowered) or ("article" in lowered and "désignation" in lowered):
                    table_started = True
                continue
            if any(token in lowered for token in ("soustotal", "sous-total", "montant ht", "montant ttc", "net a payer", "net à payer")):
                break
            if not cls._looks_like_line_candidate(line):
                continue
            strict = re.search(
                r"(?P<label>[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 '._/-]{2,}?)\s+"
                r"(?P<qty>\d+(?:[,.]\d{1,3})?)\s*(?P<unit>kg|g|l|cl|piece|pcs|u|unite|unité|forfait)?\s+"
                r"(?P<unit_price>\d+(?:[,.]\d{1,4})?)\s+"
                r"(?P<total>\d+(?:[,.]\d{1,2})?)",
                line,
                re.IGNORECASE,
            )
            if strict:
                label = cls._sanitize_line_label(strict.group("label"))
                if len(re.sub(r"[^A-Za-zÀ-ÿ]", "", label)) < 5:
                    continue
                key = label.lower()
                if key in seen_labels:
                    continue
                seen_labels.add(key)
                lines.append(
                    ExtractedInvoiceLine(
                        label=label,
                        quantity=cls._to_decimal(strict.group("qty"), Decimal("1")),
                        unit=(strict.group("unit") or "piece").lower(),
                        unit_price=cls._to_decimal(strict.group("unit_price"), Decimal("0")),
                        total=cls._to_decimal(strict.group("total"), Decimal("0")),
                        tax_rate=Decimal("0"),
                        confidence=Decimal("0.8000"),
                    )
                )
                continue

            amounts = list(re.finditer(r"\d+(?:[,.]\d{1,4})?", line))
            if len(amounts) < 2:
                continue
            label = cls._sanitize_line_label(line[: amounts[-2].start()])
            if not label or len(re.sub(r"[^A-Za-zÀ-ÿ]", "", label)) < 5:
                continue
            key = label.lower()
            if key in seen_labels:
                continue
            seen_labels.add(key)
            unit = cls._extract_unit(line)
            quantity = cls._extract_quantity(line) if unit != "piece" else Decimal("1")
            unit_price = cls._to_decimal(amounts[-2].group(), Decimal("0"))
            total = cls._to_decimal(amounts[-1].group(), Decimal("0"))
            lines.append(
                ExtractedInvoiceLine(
                    label=label,
                    quantity=quantity,
                    unit=unit,
                    unit_price=unit_price,
                    total=total,
                    tax_rate=Decimal("0"),
                    confidence=Decimal("0.5600"),
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
        return lines[:200], []

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
    def _normalize_text(text: str) -> str:
        lines = []
        for raw_line in text.splitlines():
            line = re.sub(r"[ \t]+", " ", raw_line).strip()
            if line:
                lines.append(line)
        return "\n".join(lines)

    @staticmethod
    def _merge_ocr_variants(texts: list[str]) -> str:
        merged_lines: list[str] = []
        seen: set[str] = set()
        for text in texts:
            normalized = InvoiceOcrService._normalize_text(text)
            for line in normalized.splitlines():
                key = re.sub(r"\s+", " ", line).strip().lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                merged_lines.append(line)
        return "\n".join(merged_lines)

    @staticmethod
    def _looks_like_line_candidate(line: str) -> bool:
        if not line:
            return False
        lowered = line.lower()
        if any(token in lowered for token in ("montant ht", "montant ttc", "soustotal", "sous-total", "tva", "net à payer", "net a payer", "facture", "adresse", "siret", "tournée", "page ")):
            return False
        return bool(re.search(r"[A-Za-zÀ-ÿ]{3,}", line) and re.search(r"\d", line))

    @staticmethod
    def _sanitize_line_label(value: str) -> str:
        cleaned = re.sub(r"^[^A-Za-zÀ-ÿ0-9]+", "", value)
        cleaned = re.sub(r"^\d+\s*[\]|:-]?\s*", "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -|:;")
        tokens = [token for token in cleaned.split(" ") if token]
        while tokens and len(re.sub(r"[^A-Za-zÀ-ÿ]", "", tokens[0])) < 3:
            tokens.pop(0)
        cleaned = " ".join(tokens)
        replacements = {
            "doeuf": "oeuf",
            "oreue": "oeuf",
            "oeufs": "oeuf",
            "oeuf": "oeuf",
        }
        cleaned = " ".join(replacements.get(token.lower(), token) for token in cleaned.split())
        return cleaned[:180]

    @staticmethod
    def _extract_unit(line: str) -> str:
        lowered = line.lower()
        for token in ("kg", "g", "l", "cl", "piece", "pcs", "u", "unité", "unite", "forfait"):
            if re.search(rf"\b{re.escape(token)}\b", lowered):
                return "piece" if token in {"piece", "pcs", "u", "forfait"} else token
        return "piece"

    @staticmethod
    def _extract_quantity(line: str) -> Decimal:
        match = re.search(r"\b(\d+(?:[,.]\d{1,3})?)\s*(kg|g|l|cl|piece|pcs|u|unité|unite)\b", line, re.IGNORECASE)
        if match:
            return InvoiceOcrService._to_decimal(match.group(1), Decimal("1"))
        return Decimal("1")

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

    @staticmethod
    def _is_transgourmet_supplier(supplier_name: str | None, template_keywords: list[str] | None, text: str) -> bool:
        joined = " ".join([supplier_name or "", " ".join(template_keywords or []), text[:1000]]).lower()
        return "transgourmet" in joined

    @classmethod
    def _extract_transgourmet_lines(cls, text: str) -> tuple[list[ExtractedInvoiceLine], list[dict]]:
        raw_lines = text.splitlines()
        table_start = None
        table_end = len(raw_lines)
        for index, raw_line in enumerate(raw_lines):
            lowered = raw_line.lower()
            if table_start is None and "article" in lowered and ("designation" in lowered or "désignation" in lowered):
                table_start = index
                continue
            if table_start is not None and any(token in lowered for token in ("soustotal", "sous-total", "montant ht", "montant ttc", "net a payer", "net à payer")):
                table_end = index
                break
        if table_start is None:
            return [], []

        segments: list[list[str]] = []
        current: list[str] = []
        for index in range(table_start + 1, table_end):
            line = cls._normalize_text(raw_lines[index]).strip(" |:;")
            if not line:
                continue
            lowered = line.lower()
            if "article" in lowered and "designation" in lowered:
                continue
            has_code = bool(re.search(r"\b\d{5,6}\b", line))
            if has_code:
                if current:
                    segments.append(current)
                current = []
                previous = cls._normalize_text(raw_lines[index - 1]).strip(" |:;") if index > table_start + 1 else ""
                if previous and not re.search(r"\b\d{5,6}\b", previous) and len(re.findall(r"\d+(?:[,.]\d+)?", previous)) >= 1:
                    current.append(previous)
                current.append(line)
                continue
            if current:
                if cls._looks_like_line_candidate(line) or len(re.findall(r"\d+(?:[,.]\d+)?", line)) >= 2:
                    current.append(line)
        if current:
            segments.append(current)

        extracted_lines: list[ExtractedInvoiceLine] = []
        structured_rows: list[dict] = []
        seen_codes: set[str] = set()
        for segment in segments:
            chunk = " ".join(segment)
            code_match = re.search(r"\b(\d{5,6})\b", chunk)
            code_article = code_match.group(1) if code_match else None
            if code_article and code_article in seen_codes:
                continue
            if code_article:
                seen_codes.add(code_article)
            designation = cls._extract_transgourmet_designation(chunk, code_article)
            if not designation:
                continue
            amounts = list(re.finditer(r"\d+(?:[,.]\d{1,4})?", chunk))
            qty_match = re.search(r"\b(\d+(?:[,.]\d{1,3})?)\s*(LT|KG|BRI|BD|SHT|PCS|U|PIECE|UNITE|UNITÉ)\b", chunk, re.IGNORECASE)
            unit = cls._normalize_unit(qty_match.group(2) if qty_match else None)
            quantity = cls._to_decimal(qty_match.group(1), Decimal("1")) if qty_match else Decimal("1")
            unit_price = cls._to_decimal(amounts[-2].group(), Decimal("0")) if len(amounts) >= 2 else Decimal("0")
            total = cls._to_decimal(amounts[-1].group(), Decimal("0")) if amounts else Decimal("0")
            confidence = Decimal("0.7800")
            if code_article:
                confidence += Decimal("0.0500")
            if qty_match:
                confidence += Decimal("0.0500")
            if unit_price > 0 and total > 0:
                confidence += Decimal("0.0500")
            confidence = min(confidence, Decimal("0.9800"))
            structured_rows.append(
                {
                    "code_article": code_article,
                    "designation": designation,
                    "unit": unit,
                    "quantity": str(quantity),
                    "unit_price": str(unit_price),
                    "amount_ht": str(total),
                    "confidence": str(confidence),
                    "raw": segment,
                }
            )
            extracted_lines.append(
                ExtractedInvoiceLine(
                    label=f"{code_article} {designation}".strip(),
                    quantity=quantity,
                    unit=unit,
                    unit_price=unit_price,
                    total=total,
                    tax_rate=Decimal("0"),
                    confidence=confidence,
                )
            )

        return extracted_lines[:200], structured_rows[:200]

    @staticmethod
    def _extract_transgourmet_designation(chunk: str, code_article: str | None) -> str:
        cleaned = chunk
        if code_article:
            cleaned = re.sub(rf"\b{re.escape(code_article)}\b", " ", cleaned, count=1)
        cleaned = re.sub(r"\b\d+(?:[,.]\d{1,4})?\b", " ", cleaned)
        cleaned = re.sub(r"\b(LT|KG|BRI|BD|SHT|PCS|U|PIECE|UNITE|UNITÉ)\b", " ", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"[|_=<>]", " ", cleaned)
        cleaned = re.sub(r"^(?:code article|désignation|designation|marque|gtin)\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:;")
        label = InvoiceOcrService._sanitize_line_label(cleaned)
        transgourmet_tokens = {
            "lat": "lait",
            "lait": "lait",
            "oreue": "creme",
            "creme": "creme",
            "doeuf": "oeuf",
            "oeuf": "oeuf",
            "oure": "cure",
            "nantais": "nantais",
            "melange": "melange",
            "jeune": "jeune",
            "pousse": "pousse",
            "gat": "cat1",
            "cat1": "cat1",
            "aneth": "aneth",
            "flow": "flow",
            "pack": "pack",
            "fr": "fr",
        }
        noise_tokens = {
            "oso",
            "meee",
            "mating",
            "anuanmic",
            "jsreorsersoaeol",
            "ovvo",
            "lae",
            "ae",
            "ees",
            "eS",
            "tl",
            "ean",
            "wo",
            "woe",
            "wa",
            "wace",
            "rae",
        }
        normalized_tokens = []
        for token in label.split():
            lower = token.lower().strip("[](){}")
            mapped = transgourmet_tokens.get(lower)
            if mapped:
                normalized_tokens.append(mapped)
            elif lower not in noise_tokens and len(re.sub(r"[^A-Za-zÀ-ÿ]", "", token)) >= 3:
                normalized_tokens.append(token)
        return " ".join(normalized_tokens).strip()[:180]

    @staticmethod
    def _normalize_unit(value: str | None) -> str:
        if not value:
            return "piece"
        normalized = value.upper().replace("UNITÉ", "U").replace("UNITE", "U")
        if normalized in {"PCS", "PIECE", "U"}:
            return "piece"
        return normalized.lower()
