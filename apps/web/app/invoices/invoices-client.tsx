"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  FileScan,
  Loader2,
  RotateCw,
  UploadCloud,
  X,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type InvoiceLine = {
  label: string;
  quantity: string;
  unit: string;
  unit_price: string;
  total: string;
  confidence: string;
};

type Invoice = {
  id: string;
  original_name: string;
  supplier_name: string;
  status: "OCR_REVIEW" | "APPROVED" | "REJECTED" | "OCR_PROCESSING";
  number: string;
  total_excluding_tax: string;
  total_including_tax: string;
  ocr_confidence: string;
  processed_at: string;
  lines: InvoiceLine[];
};

const seedInvoices: Invoice[] = [
  {
    id: "inv_001",
    original_name: "metro_mai_2026.pdf",
    supplier_name: "Metro",
    status: "OCR_REVIEW",
    number: "OCR-20260508-1042",
    total_excluding_tax: "184.40",
    total_including_tax: "200.07",
    ocr_confidence: "0.91",
    processed_at: "08/05/2026 13:40",
    lines: [
      { label: "Filet de bar", quantity: "4.000", unit: "kg", unit_price: "24.80", total: "99.20", confidence: "0.93" },
      { label: "Creme crue", quantity: "6.000", unit: "l", unit_price: "7.45", total: "44.70", confidence: "0.89" },
      { label: "Frais logistiques", quantity: "1.000", unit: "forfait", unit_price: "8.50", total: "8.50", confidence: "0.87" },
    ],
  },
  {
    id: "inv_002",
    original_name: "primeurs_denise.jpg",
    supplier_name: "Primeurs Denise",
    status: "APPROVED",
    number: "OCR-20260508-2231",
    total_excluding_tax: "72.10",
    total_including_tax: "76.07",
    ocr_confidence: "0.96",
    processed_at: "08/05/2026 12:15",
    lines: [
      { label: "Asperges vertes", quantity: "3.000", unit: "kg", unit_price: "12.30", total: "36.90", confidence: "0.97" },
      { label: "Fraises", quantity: "4.000", unit: "kg", unit_price: "8.80", total: "35.20", confidence: "0.95" },
    ],
  },
];

const statusLabels = {
  OCR_REVIEW: "A revoir",
  OCR_PROCESSING: "Analyse",
  APPROVED: "Validee",
  REJECTED: "Rejetee",
};

export function InvoicesClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState(seedInvoices);
  const [selectedId, setSelectedId] = useState(seedInvoices[0]?.id);
  const [isDragging, setIsDragging] = useState(false);
  const selected = useMemo(() => invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0], [invoices, selectedId]);

  function ingestFiles(files: FileList | null) {
    if (!files?.length) return;
    const created = Array.from(files).map((file, index): Invoice => {
      const total = 58 + file.name.length + index * 7;
      return {
        id: `local_${Date.now()}_${index}`,
        original_name: file.name,
        supplier_name: file.name.split(/[_.-]/)[0]?.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Fournisseur",
        status: "OCR_REVIEW",
        number: `OCR-LOCAL-${String(total).padStart(4, "0")}`,
        total_excluding_tax: total.toFixed(2),
        total_including_tax: (total * 1.085).toFixed(2),
        ocr_confidence: "0.90",
        processed_at: "Maintenant",
        lines: [
          {
            label: "Marchandises cuisine",
            quantity: "3.000",
            unit: "kg",
            unit_price: (total / 3).toFixed(4),
            total: total.toFixed(2),
            confidence: "0.91",
          },
        ],
      };
    });
    setInvoices((current) => [...created, ...current]);
    setSelectedId(created[0].id);
  }

  function updateStatus(status: Invoice["status"]) {
    if (!selected) return;
    setInvoices((current) => current.map((invoice) => (invoice.id === selected.id ? { ...invoice, status } : invoice)));
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <Card className="p-4 lg:p-5">
            <div
              className={cn(
                "grid min-h-52 cursor-pointer place-items-center rounded-lg border border-dashed border-border bg-muted/35 p-5 text-center transition-colors",
                isDragging && "border-foreground bg-muted",
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                ingestFiles(event.dataTransfer.files);
              }}
            >
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                multiple
                accept="application/pdf,image/*"
                onChange={(event) => ingestFiles(event.target.files)}
              />
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-foreground text-background">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal">OCR factures fournisseurs</h1>
                <p className="mt-2 max-w-sm text-sm leading-6 text-foreground/58">
                  Deposez PDF ou photo. L'IA extrait fournisseur, totaux, lignes et score de confiance avant validation.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <Metric label="A revoir" value={String(invoices.filter((invoice) => invoice.status === "OCR_REVIEW").length)} />
              <Metric label="Validees" value={String(invoices.filter((invoice) => invoice.status === "APPROVED").length)} />
              <Metric label="Confiance" value="92%" />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">File de revue</h2>
            </div>
            <div className="divide-y divide-border">
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted",
                    selected?.id === invoice.id && "bg-muted",
                  )}
                  onClick={() => setSelectedId(invoice.id)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline">
                    <FileScan className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invoice.supplier_name}</p>
                    <p className="truncate text-xs text-foreground/55">{invoice.original_name}</p>
                  </div>
                  <StatusBadge status={invoice.status} />
                  <ChevronRight className="h-4 w-4 text-foreground/35" />
                </button>
              ))}
            </div>
          </Card>
        </section>

        {selected ? (
          <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="p-4 lg:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-foreground/55">{selected.number}</p>
                  <h2 className="mt-1 truncate text-2xl font-semibold">{selected.supplier_name}</h2>
                  <p className="mt-2 text-sm text-foreground/55">Analyse effectuee: {selected.processed_at}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="icon" aria-label="Relancer OCR">
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="icon" aria-label="Rejeter" onClick={() => updateStatus("REJECTED")}>
                    <X className="h-4 w-4" />
                  </Button>
                  <Button size="icon" aria-label="Approuver" onClick={() => updateStatus("APPROVED")}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <Metric label="Total HT" value={`${selected.total_excluding_tax} EUR`} />
                <Metric label="Total TTC" value={`${selected.total_including_tax} EUR`} />
                <Metric label="Confiance" value={`${Math.round(Number(selected.ocr_confidence) * 100)}%`} />
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_72px_82px] gap-2 border-b border-border bg-muted px-3 py-2 text-xs text-foreground/55 sm:grid-cols-[1fr_88px_110px_100px]">
                  <span>Article</span>
                  <span>Qte</span>
                  <span>Total</span>
                  <span className="hidden sm:block">Confiance</span>
                </div>
                {selected.lines.map((line) => (
                  <div
                    key={`${selected.id}-${line.label}`}
                    className="grid grid-cols-[1fr_72px_82px] gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_88px_110px_100px]"
                  >
                    <span className="min-w-0 truncate">{line.label}</span>
                    <span className="text-foreground/60">{line.quantity} {line.unit}</span>
                    <span>{line.total} EUR</span>
                    <span className="hidden text-foreground/60 sm:block">{Math.round(Number(line.confidence) * 100)}%</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 lg:p-5">
              <div className="flex items-center gap-3">
                {selected.status === "OCR_PROCESSING" ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertCircle className="h-5 w-5" />}
                <h2 className="text-base font-semibold">Controle avant validation</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm text-foreground/65">
                <CheckLine text="Fournisseur rapproche ou cree automatiquement" />
                <CheckLine text="Totaux extraits et prets pour cout matiere" />
                <CheckLine text="Lignes conservees pour audit, stock et historique" />
                <CheckLine text="Validation reservee aux roles manager, admin ou comptable" />
              </div>
            </Card>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-3">
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="mt-1 truncate text-base font-semibold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Invoice["status"] }) {
  return (
    <span className="shrink-0 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background">
      {statusLabels[status]}
    </span>
  );
}

function CheckLine({ text }: { text: string }) {
  return (
    <div className="flex gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
