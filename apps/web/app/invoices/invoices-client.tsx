"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronRight, FileScan, Loader2, RotateCw, UploadCloud, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type InvoiceLine = {
  id: string;
  label: string;
  quantity: string;
  unit: string;
  unit_price: string;
  total: string;
  confidence: string | null;
};

type Invoice = {
  id: string;
  original_name: string;
  supplier_name: string | null;
  status: "OCR_REVIEW" | "APPROVED" | "REJECTED" | "OCR_PROCESSING" | "UPLOADED";
  number: string | null;
  total_excluding_tax: string | null;
  total_including_tax: string | null;
  ocr_confidence: string | null;
  processed_at: string | null;
  rejected_reason: string | null;
  lines: InvoiceLine[];
};

const statusLabels = {
  UPLOADED: "Importee",
  OCR_REVIEW: "A revoir",
  OCR_PROCESSING: "Analyse",
  APPROVED: "Validee",
  REJECTED: "Rejetee",
};

export function InvoicesClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0] ?? null, [invoices, selectedId]);

  useEffect(() => {
    void loadInvoices();
  }, []);

  async function loadInvoices(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<Invoice[]>("/invoices");
      setInvoices(data);
      setSelectedId(selectId ?? data[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  async function ingestFiles(files: FileList | null) {
    if (!files?.length) return;
    setSaving(true);
    setError("");
    try {
      let firstId = "";
      const uploaded: Invoice[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const invoice = await apiRequest<Invoice>("/invoices/upload", { method: "POST", body: formData });
        firstId ||= invoice.id;
        uploaded.push(invoice);
      }
      setInvoices((current) => [...uploaded, ...current]);
      setSelectedId(firstId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function updateInvoice(action: "approve" | "process" | "reject") {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const options = action === "reject" ? { reason: "Rejet depuis interface web" } : undefined;
      const invoice = await apiRequest<Invoice>(`/invoices/${selected.id}/${action}`, {
        method: "POST",
        body: options ? JSON.stringify(options) : undefined,
      });
      setInvoices((current) => current.map((entry) => (entry.id === invoice.id ? invoice : entry)));
      setSelectedId(invoice.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action facture impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <Card className="p-4 lg:p-5">
            <div
              className={cn("grid min-h-52 cursor-pointer place-items-center rounded-lg border border-dashed border-border bg-muted/35 p-5 text-center transition-colors", isDragging && "border-foreground bg-muted")}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void ingestFiles(event.dataTransfer.files);
              }}
            >
              <input ref={inputRef} className="hidden" type="file" multiple accept="application/pdf,image/*" onChange={(event) => void ingestFiles(event.target.files)} />
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-foreground text-background">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal">OCR factures fournisseurs</h1>
                <p className="mt-2 max-w-sm text-sm leading-6 text-foreground/58">Deposez PDF ou photo pour lancer l'OCR et enregistrer la facture en base.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <Metric label="A revoir" value={String(invoices.filter((invoice) => invoice.status === "OCR_REVIEW").length)} />
              <Metric label="Validees" value={String(invoices.filter((invoice) => invoice.status === "APPROVED").length)} />
              <Metric label="Total" value={String(invoices.length)} />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">File de revue</h2>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement factures" /> : null}
              {!loading && invoices.length === 0 ? <StateLine text="Aucune facture importee" /> : null}
              {invoices.map((invoice) => (
                <button key={invoice.id} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted", selected?.id === invoice.id && "bg-muted")} onClick={() => setSelectedId(invoice.id)}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline"><FileScan className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invoice.supplier_name ?? "Fournisseur a confirmer"}</p>
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
                  <p className="text-sm text-foreground/55">{selected.number ?? selected.original_name}</p>
                  <h2 className="mt-1 truncate text-2xl font-semibold">{selected.supplier_name ?? "Fournisseur a confirmer"}</h2>
                  <p className="mt-2 text-sm text-foreground/55">Analyse: {selected.processed_at ? new Date(selected.processed_at).toLocaleString("fr-FR") : "en attente"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="icon" aria-label="Relancer OCR" disabled={saving || selected.status === "APPROVED"} onClick={() => updateInvoice("process")}><RotateCw className="h-4 w-4" /></Button>
                  <Button variant="secondary" size="icon" aria-label="Rejeter" disabled={saving || selected.status === "APPROVED"} onClick={() => updateInvoice("reject")}><X className="h-4 w-4" /></Button>
                  <Button size="icon" aria-label="Approuver" disabled={saving || selected.status === "APPROVED" || selected.status === "OCR_PROCESSING"} onClick={() => updateInvoice("approve")}><Check className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <Metric label="Total HT" value={`${selected.total_excluding_tax ?? 0} EUR`} />
                <Metric label="Total TTC" value={`${selected.total_including_tax ?? 0} EUR`} />
                <Metric label="Confiance" value={selected.ocr_confidence ? `${Math.round(Number(selected.ocr_confidence) * 100)}%` : "n/a"} />
              </div>
              <div className="mt-5 overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_72px_82px] gap-2 border-b border-border bg-muted px-3 py-2 text-xs text-foreground/55 sm:grid-cols-[1fr_88px_110px_100px]">
                  <span>Article</span><span>Qte</span><span>Total</span><span className="hidden sm:block">Confiance</span>
                </div>
                {selected.lines.length === 0 ? <p className="px-3 py-3 text-sm text-foreground/55">Aucune ligne extraite.</p> : null}
                {selected.lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-[1fr_72px_82px] gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_88px_110px_100px]">
                    <span className="min-w-0 truncate">{line.label}</span>
                    <span className="text-foreground/60">{line.quantity} {line.unit}</span>
                    <span>{line.total} EUR</span>
                    <span className="hidden text-foreground/60 sm:block">{line.confidence ? `${Math.round(Number(line.confidence) * 100)}%` : "n/a"}</span>
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
                {selected.rejected_reason ? <CheckLine text={`Motif rejet: ${selected.rejected_reason}`} /> : null}
              </div>
            </Card>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: Invoice["status"] }) {
  return <span className="rounded-md bg-foreground px-2 py-1 text-xs text-background">{statusLabels[status]}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-3">
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="mt-1 truncate text-base font-semibold">{value}</p>
    </div>
  );
}

function CheckLine({ text }: { text: string }) {
  return <p className="rounded-md bg-muted px-3 py-3">{text}</p>;
}

function StateLine({ text }: { text: string }) {
  return <p className="px-4 py-4 text-sm text-foreground/55">{text}</p>;
}
