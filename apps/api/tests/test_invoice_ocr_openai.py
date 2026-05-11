from decimal import Decimal

from app.services.ocr import InvoiceOcrService


def test_parse_openai_invoice_transgourmet_payload():
    payload = {
        "supplier_name": "TRANSGOURMET OUEST",
        "number": "4460458201",
        "invoice_date": "2026-04-29",
        "total_excluding_tax": 110.52,
        "total_including_tax": 119.76,
        "confidence": 0.93,
        "lines": [
            {
                "code_article": "316803",
                "designation": "LAIT 1/2 ECREME BRICK 1 L",
                "brand": None,
                "gtin": None,
                "quantity": 6,
                "unit": "LT",
                "unit_price": 0.85,
                "total_ht": 5.10,
                "tax_rate": 5.5,
                "confidence": 0.98,
            },
            {
                "code_article": "301111",
                "designation": "CREME LIQUIDE UHT 35% 1 L",
                "brand": None,
                "gtin": None,
                "quantity": 12,
                "unit": "BRI",
                "unit_price": 3.8,
                "total_ht": 45.6,
                "tax_rate": 5.5,
                "confidence": 0.98,
            },
        ],
    }

    invoice = InvoiceOcrService._parse_openai_invoice(
        payload,
        supplier_name="TRANSGOURMET OUEST",
        original_name="facture-transgourmet.pdf",
        model="gpt-4o-mini",
    )

    assert invoice is not None
    assert invoice.supplier_name == "TRANSGOURMET OUEST"
    assert invoice.number == "4460458201"
    assert invoice.total_excluding_tax == Decimal("110.52")
    assert invoice.total_including_tax == Decimal("119.76")
    assert len(invoice.lines) == 2
    assert invoice.lines[0].code_article == "316803"
    assert invoice.lines[0].label == "LAIT 1/2 ECREME BRICK 1 L"
    assert invoice.lines[0].unit == "lt"
    assert invoice.raw_payload["engine"] == "openai-vision"


def test_template_learning_examples_feed_local_keywords():
    template = {
        "keywordHints": ["TRANSGOURMET OUEST"],
        "lineHints": ["LAIT 1/2 ECREME BRICK 1 L"],
        "exampleRows": [
            {
                "code_article": "316803",
                "designation": "LAIT 1/2 ECREME BRICK 1 L",
                "brand": None,
                "gtin": None,
                "unit": "LT",
                "quantity": "6",
                "unit_price": "0.850",
                "amount_ht": "5.10",
                "tax_rate": "5.5",
                "confidence": "0.98",
            }
        ],
    }

    keywords = InvoiceOcrService._keywords_from_template(template)

    assert "TRANSGOURMET OUEST" in keywords
    assert "316803" in keywords
    assert "LAIT 1/2 ECREME BRICK 1 L" in keywords
    assert InvoiceOcrService._line_matches_template_examples(
        "316803 LAIT 1/2 ECREME BRICK 1 L 6 LT 0,850 5,10",
        template["exampleRows"],
    )


def test_cap_maree_normalization_keeps_lieu_noir_and_kg():
    line = InvoiceOcrService._normalize_supplier_designation(
        "POK - Pollachius virens - Pêchés eau mer Atlantique Nord Est = Pave L.noir SP",
        "Cap Marée",
    )
    quantity, unit = InvoiceOcrService._normalize_supplier_quantity_unit(
        Decimal("5.5"),
        "kg",
        line,
        "Cap Marée",
    )

    assert line == "Pavé de lieu noir"
    assert quantity == Decimal("5")
    assert unit == "kg"


def test_build_correction_rows_marks_source_as_correction():
    class Line:
        codeArticle = "316803"
        label = "Pavé de lieu noir"
        unit = "kg"
        quantity = Decimal("5")
        unitPrice = Decimal("17.700")
        total = Decimal("24.69")

    rows = InvoiceOcrService._build_correction_rows(
        [{"designation": "POK - Pollachius virens", "code_article": "316803", "amount_ht": "24.69"}],
        [Line()],
    )

    assert rows[0]["source"] == "correction"
    assert rows[0]["designation"] == "Pavé de lieu noir"
    assert rows[0]["code_article"] == "316803"
