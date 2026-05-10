"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, Download, FileScan, Loader2, RotateCw, Search, UploadCloud, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiBlob, apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type InvoiceLine = {
  id: string;
  label: string;
  quantity: string;
  unit: string;
  unit_price: string;
  total: string;
  tax_rate: string | null;
  confidence: string | null;
  inventory_item_id: string | null;
  inventory_item_name: string | null;
};

type Invoice = {
  id: string;
  original_name: string;
  stored_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  uploaded_by_name: string | null;
  status: "UPLOADED" | "OCR_PROCESSING" | "OCR_REVIEW" | "APPROVED" | "REJECTED";
  number: string | null;
  total_excluding_tax: string | null;
  total_including_tax: string | null;
  invoice_date: string | null;
  ocr_confidence: string | null;
  processed_at: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string;
  uploaded_at: string;
  document_url: string | null;
  can_reprocess: boolean;
  can_approve: boolean;
  template: {
    id: string;
    name: string | null;
    keywordHints: string[];
    lineHints: string[];
    notes: string | null;
    isActive: boolean;
  } | null;
  lines: InvoiceLine[];
};

type Supplier = {
  id: string;
  name: string;
};

type StockItem = {
  id: string;
  name: string;
  unit: string;
  category: string;
};

type InvoiceDraftLine = {
  id: string | null;
  label: string;
  quantity: string;
  unit: string;
  unit_price: string;
  total: string;
  inventory_item_id: string;
};

type InvoiceDraft = {
  supplier_id: string;
  number: string;
  invoice_date: string;
  total_excluding_tax: string;
  total_including_tax: string;
  lines: InvoiceDraftLine[];
};

type Filters = {
  supplier_id: string;
  number: string;
  status: string;
  invoice_date_from: string;
  invoice_date_to: string;
  uploaded_from: string;
  uploaded_to: string;
  min_total: string;
  max_total: string;
  sort_by: "created_at" | "supplier" | "amount" | "status";
  sort_dir: "asc" | "desc";
};

const emptyFilters: Filters = {
  supplier_id: "",
  number: "",
  status: "",
  invoice_date_from: "",
  invoice_date_to: "",
  uploaded_from: "",
  uploaded_to: "",
  min_total: "",
  max_total: "",
  sort_by: "created_at",
  sort_dir: "desc",
};

const statusLabels: Record<Invoice["status"], string> = {
  UPLOADED: "Importée",
  OCR_PROCESSING: "Analyse",
  OCR_REVIEW: "À revoir",
  APPROVED: "Validée",
  REJECTED: "Rejetée",
};

const emptyLine = (): InvoiceDraftLine => ({
  id: null,
  label: "",
  quantity: "1",
  unit: "piece",
  unit_price: "0",
  total: "0",
  inventory_item_id: "",
});

export function InvoicesClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string>("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [uploadSupplierId, setUploadSupplierId] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const selectedStatus = selected?.status ?? null;
  const uploadedAt = selected?.uploaded_at ? new Date(selected.uploaded_at) : null;
  const selectedTotals = useMemo(() => {
    if (!draft) return { ht: "0", ttc: "0" };
    return { ht: draft.total_excluding_tax || "0", ttc: draft.total_including_tax || "0" };
  }, [draft]);

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInvoices();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setPreviewUrl("");
      return;
    }
    setDraft({
      supplier_id: selected.supplier_id ?? "",
      number: selected.number ?? "",
      invoice_date: selected.invoice_date ? selected.invoice_date.slice(0, 10) : "",
      total_excluding_tax: selected.total_excluding_tax ?? "",
      total_including_tax: selected.total_including_tax ?? "",
      lines: selected.lines.map((line) => ({
        id: line.id,
        label: line.label,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        total: line.total,
        inventory_item_id: line.inventory_item_id ?? "",
      })),
    });
  }, [selected]);

  useEffect(() => {
    let revoked = false;
    async function loadPreview() {
      if (!selected) return;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
      try {
        const blob = await apiBlob(`/invoices/${selected.id}/document`);
        const url = URL.createObjectURL(blob);
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chargement du document impossible");
      }
    }
    void loadPreview();
    return () => {
      revoked = true;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
    };
  }, [selected?.id]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function loadReferenceData() {
    try {
      const [supplierData, stockData] = await Promise.all([
        apiRequest<Supplier[]>("/suppliers"),
        apiRequest<StockItem[]>("/inventory"),
      ]);
      setSuppliers(supplierData);
      setStockItems(stockData);
      setUploadSupplierId((current) => current || supplierData[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    }
  }

  async function loadInvoices(nextSelectedId?: string) {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (filters.supplier_id) query.set("supplier_id", filters.supplier_id);
      if (filters.number) query.set("number", filters.number);
      if (filters.status) query.set("status", filters.status);
      if (filters.invoice_date_from) query.set("invoice_date_from", filters.invoice_date_from);
      if (filters.invoice_date_to) query.set("invoice_date_to", filters.invoice_date_to);
      if (filters.uploaded_from) query.set("uploaded_from", filters.uploaded_from);
      if (filters.uploaded_to) query.set("uploaded_to", filters.uploaded_to);
      if (filters.min_total) query.set("min_total", filters.min_total);
      if (filters.max_total) query.set("max_total", filters.max_total);
      query.set("sort_by", filters.sort_by);
      query.set("sort_dir", filters.sort_dir);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const data = await apiRequest<Invoice[]>(`/invoices${suffix}`);
      setInvoices(data);
      const nextId = nextSelectedId ?? data[0]?.id ?? "";
      setSelectedId(nextId);
      setSelected(data.find((invoice) => invoice.id === nextId) ?? data[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const next = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0] ?? null;
    setSelected(next);
  }, [invoices, selectedId]);

  async function uploadInvoice(file: File) {
    if (!uploadSupplierId) {
      setError("Choisissez d'abord un fournisseur.");
      return;
    }
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("supplier_id", uploadSupplierId);
      formData.append("file", file);
      const invoice = await apiRequest<Invoice>("/invoices/upload", { method: "POST", body: formData });
      setInvoices((current) => [invoice, ...current.filter((entry) => entry.id !== invoice.id)]);
      setSelectedId(invoice.id);
      setSuccess("Facture importée. Lancez l'OCR pour commencer la correction.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setUploading(false);
    }
  }

  async function processInvoice() {
    if (!selected) return;
    setProcessing(true);
    setError("");
    setSuccess("");
    try {
      const invoice = await apiRequest<Invoice>(`/invoices/${selected.id}/process`, { method: "POST" });
      setInvoices((current) => current.map((entry) => (entry.id === invoice.id ? invoice : entry)));
      setSelected(invoice);
      setSuccess("OCR lancé. Vérifiez les lignes puis validez la facture.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR impossible");
    } finally {
      setProcessing(false);
    }
  }

  async function saveDraft() {
    if (!selected || !draft) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        supplier_id: draft.supplier_id || null,
        number: draft.number || null,
        invoice_date: draft.invoice_date ? `${draft.invoice_date}T00:00:00.000Z` : null,
        total_excluding_tax: draft.total_excluding_tax || null,
        total_including_tax: draft.total_including_tax || null,
        lines: draft.lines.map((line) => ({
          id: line.id,
          label: line.label,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          total: line.total,
          inventory_item_id: line.inventory_item_id || null,
        })),
      };
      const invoice = await apiRequest<Invoice>(`/invoices/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setInvoices((current) => current.map((entry) => (entry.id === invoice.id ? invoice : entry)));
      setSelected(invoice);
      setSuccess("Corrections enregistrées.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  async function approveInvoice() {
    if (!selected) return;
    setProcessing(true);
    setError("");
    setSuccess("");
    try {
      const invoice = await apiRequest<Invoice>(`/invoices/${selected.id}/approve`, { method: "POST" });
      setInvoices((current) => current.map((entry) => (entry.id === invoice.id ? invoice : entry)));
      setSelected(invoice);
      setSuccess("Facture validée et stock mis à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation impossible");
    } finally {
      setProcessing(false);
    }
  }

  async function rejectInvoice() {
    if (!selected) return;
    const reason = window.prompt("Motif du rejet");
    if (!reason) return;
    setProcessing(true);
    setError("");
    setSuccess("");
    try {
      const invoice = await apiRequest<Invoice>(`/invoices/${selected.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setInvoices((current) => current.map((entry) => (entry.id === invoice.id ? invoice : entry)));
      setSelected(invoice);
      setSuccess("Facture rejetée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejet impossible");
    } finally {
      setProcessing(false);
    }
  }

  async function openDocument(download = false) {
    if (!selected) return;
    const blob = await apiBlob(`/invoices/${selected.id}/document`);
    const url = URL.createObjectURL(blob);
    if (download) {
      const link = document.createElement("a");
      link.href = url;
      link.download = selected.original_name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function updateDraftLine(index: number, patch: Partial<InvoiceDraftLine>) {
    setDraft((current) => {
      if (!current) return current;
      const lines = current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line));
      return { ...current, lines };
    });
  }

  function addLine() {
    setDraft((current) => (current ? { ...current, lines: [...current.lines, emptyLine()] } : current));
  }

  function removeLine(index: number) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) };
    });
  }

  function setNumber(value: string) {
    setDraft((current) => (current ? { ...current, number: value } : current));
  }

  const canEdit = selectedStatus !== "APPROVED" && selectedStatus !== "REJECTED";
  const filteredCount = invoices.length;

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-foreground/55">Archivage durable, OCR guidé par fournisseur et validation stock</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Factures fournisseurs</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" asChild>
                <Link href="/suppliers">Créer un fournisseur</Link>
              </Button>
              <Button variant="secondary" onClick={() => void loadInvoices(selectedId)}>
                <RotateCw className="h-4 w-4" />
                Actualiser
              </Button>
            </div>
          </div>
          {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
          {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="p-4 lg:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Importer une facture</h2>
                <p className="text-sm text-foreground/55">Étape 1: choisissez un fournisseur avant l'envoi du fichier.</p>
              </div>
              <FileScan className="h-5 w-5 text-foreground/50" />
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-xs text-foreground/55">Fournisseur</span>
                <select className="h-10 rounded-md border border-border bg-background px-3" value={uploadSupplierId} onChange={(event) => setUploadSupplierId(event.target.value)}>
                  <option value="">Sélectionner un fournisseur</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-foreground/55">
                Si le fournisseur n'existe pas encore, <Link href="/suppliers" className="underline">créez-le ici</Link>.
              </p>
              <div
                className={cn(
                  "grid min-h-44 place-items-center rounded-lg border border-dashed border-border bg-muted/35 p-5 text-center transition-colors",
                  uploadSupplierId ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed opacity-60",
                  isDragging && uploadSupplierId && "border-foreground bg-muted",
                )}
                onClick={() => {
                  if (uploadSupplierId) fileInputRef.current?.click();
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (uploadSupplierId) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  if (!uploadSupplierId) {
                    setError("Choisissez d'abord un fournisseur.");
                    return;
                  }
                  void uploadInvoice(event.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  disabled={!uploadSupplierId || uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadInvoice(file);
                  }}
                />
                <div className="space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-foreground text-background">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                  </div>
                  <p className="text-sm font-medium">{uploadSupplierId ? "Déposer un JPG, PNG ou PDF" : "Sélectionnez un fournisseur pour activer l'import"}</p>
                  <p className="text-sm text-foreground/55">Le fichier original est conservé dans le volume Docker persistant.</p>
                </div>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <Metric label="Importées" value={String(filteredCount)} />
                <Metric label="À revoir" value={String(invoices.filter((invoice) => invoice.status === "OCR_REVIEW").length)} />
                <Metric label="Validées" value={String(invoices.filter((invoice) => invoice.status === "APPROVED").length)} />
              </div>
            </div>
          </Card>

          <Card className="p-4 lg:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Filtres et tri</h2>
                <p className="text-sm text-foreground/55">Recherche par fournisseur, numéro, date et montant.</p>
              </div>
              <Search className="h-5 w-5 text-foreground/50" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Fournisseur" as="select" value={filters.supplier_id} onChange={(value) => setFilters((current) => ({ ...current, supplier_id: value }))}>
                <option value="">Tous les fournisseurs</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Field>
              <Field label="Numéro facture" value={filters.number} onChange={(value) => setFilters((current) => ({ ...current, number: value }))} />
              <Field label="Statut" as="select" value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
                <option value="">Tous les statuts</option>
                <option value="UPLOADED">Importée</option>
                <option value="OCR_PROCESSING">Analyse</option>
                <option value="OCR_REVIEW">À revoir</option>
                <option value="APPROVED">Validée</option>
                <option value="REJECTED">Rejetée</option>
              </Field>
              <Field label="Date facture début" type="date" value={filters.invoice_date_from} onChange={(value) => setFilters((current) => ({ ...current, invoice_date_from: value }))} />
              <Field label="Date facture fin" type="date" value={filters.invoice_date_to} onChange={(value) => setFilters((current) => ({ ...current, invoice_date_to: value }))} />
              <Field label="Date upload début" type="date" value={filters.uploaded_from} onChange={(value) => setFilters((current) => ({ ...current, uploaded_from: value }))} />
              <Field label="Date upload fin" type="date" value={filters.uploaded_to} onChange={(value) => setFilters((current) => ({ ...current, uploaded_to: value }))} />
              <Field label="Montant min" type="number" value={filters.min_total} onChange={(value) => setFilters((current) => ({ ...current, min_total: value }))} />
              <Field label="Montant max" type="number" value={filters.max_total} onChange={(value) => setFilters((current) => ({ ...current, max_total: value }))} />
              <Field label="Tri" as="select" value={filters.sort_by} onChange={(value) => setFilters((current) => ({ ...current, sort_by: value as Filters["sort_by"] }))}>
                <option value="created_at">Plus récente</option>
                <option value="supplier">Fournisseur</option>
                <option value="amount">Montant</option>
                <option value="status">Statut</option>
              </Field>
              <Field label="Ordre" as="select" value={filters.sort_dir} onChange={(value) => setFilters((current) => ({ ...current, sort_dir: value as Filters["sort_dir"] }))}>
                <option value="desc">Décroissant</option>
                <option value="asc">Croissant</option>
              </Field>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">Liste des factures</h2>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des factures" /> : null}
              {!loading && invoices.length === 0 ? <StateLine text="Aucune facture importée" /> : null}
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted", selected?.id === invoice.id && "bg-muted")}
                  onClick={() => {
                    setSelectedId(invoice.id);
                    setSelected(invoice);
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline">
                    <FileScan className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invoice.supplier_name ?? "Fournisseur à confirmer"}</p>
                    <p className="truncate text-xs text-foreground/55">{invoice.original_name}</p>
                    <p className="truncate text-xs text-foreground/45">{invoice.invoice_date ? `Facture: ${new Date(invoice.invoice_date).toLocaleDateString("fr-FR")}` : "Date facture à confirmer"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <StatusBadge status={invoice.status} />
                    <p className="text-xs text-foreground/55">{invoice.total_including_tax ?? invoice.total_excluding_tax ?? "0"} EUR</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-foreground/35" />
                </button>
              ))}
            </div>
          </Card>

          {selected && draft ? (
            <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="p-4 lg:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground/55">Fournisseur: {selected.supplier_name ?? "à confirmer"}</p>
                    <h2 className="mt-1 truncate text-2xl font-semibold">{selected.number || selected.original_name}</h2>
                    <p className="mt-2 text-sm text-foreground/55">
                      Importée le {uploadedAt ? uploadedAt.toLocaleString("fr-FR") : "n/a"}
                      {selected.uploaded_by_name ? ` par ${selected.uploaded_by_name}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => void openDocument(false)}>
                      Voir le document original
                    </Button>
                    <Button variant="secondary" onClick={() => void openDocument(true)}>
                      <Download className="h-4 w-4" />
                      Télécharger
                    </Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-4">
                  <Metric label="Statut OCR" value={statusLabels[selected.status]} />
                  <Metric label="Confiance" value={selected.ocr_confidence ? `${Math.round(Number(selected.ocr_confidence) * 100)}%` : "n/a"} />
                  <Metric label="Total HT" value={selectedTotals.ht} />
                  <Metric label="Total TTC" value={selectedTotals.ttc} />
                </div>

                <div className="mt-5 rounded-lg border border-border">
                  <div className="border-b border-border bg-muted px-3 py-2 text-xs text-foreground/55">
                    Aperçu du document
                  </div>
                  {previewUrl ? (
                    selected.mime_type === "application/pdf" ? (
                      <iframe title="Aperçu facture" src={previewUrl} className="h-[560px] w-full bg-background" />
                    ) : (
                      <img src={previewUrl} alt={selected.original_name} className="h-[560px] w-full object-contain bg-background" />
                    )
                  ) : (
                    <div className="grid h-[360px] place-items-center text-sm text-foreground/55">Chargement de l'aperçu...</div>
                  )}
                </div>
              </Card>

              <Card className="p-4 lg:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">OCR + correction</h2>
                    <p className="text-sm text-foreground/55">Étape 3: corriger puis valider la facture.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="icon" onClick={() => void processInvoice()} disabled={processing || !selected.can_reprocess}>
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                    </Button>
                    <Button variant="secondary" size="icon" onClick={() => void rejectInvoice()} disabled={processing || selected.status === "APPROVED"}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="icon" onClick={() => void approveInvoice()} disabled={processing || !selected.can_approve}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <Field label="Fournisseur" as="select" value={draft.supplier_id} onChange={(value) => setDraft((current) => (current ? { ...current, supplier_id: value } : current))}>
                    <option value="">Sélectionner un fournisseur</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </Field>
                  <Field label="Numéro facture" value={draft.number} onChange={setNumber} />
                  <Field
                    label="Date facture"
                    type="date"
                    value={draft.invoice_date}
                    onChange={(value) => setDraft((current) => (current ? { ...current, invoice_date: value } : current))}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Total HT"
                      type="number"
                      value={draft.total_excluding_tax}
                      onChange={(value) => setDraft((current) => (current ? { ...current, total_excluding_tax: value } : current))}
                    />
                    <Field
                      label="Total TTC"
                      type="number"
                      value={draft.total_including_tax}
                      onChange={(value) => setDraft((current) => (current ? { ...current, total_including_tax: value } : current))}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Lignes facture</h3>
                  <Button variant="secondary" size="sm" onClick={addLine}>
                    Ajouter une ligne
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {draft.lines.length === 0 ? <p className="text-sm text-foreground/55">Aucune ligne. Lancez l'OCR ou ajoutez une ligne manuellement.</p> : null}
                  {draft.lines.map((line, index) => (
                    <div key={`${line.id ?? "new"}-${index}`} className="rounded-lg border border-border p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Libellé" value={line.label} onChange={(value) => updateDraftLine(index, { label: value })} />
                        <Field label="Article stock lié" as="select" value={line.inventory_item_id} onChange={(value) => updateDraftLine(index, { inventory_item_id: value })}>
                          <option value="">Non lié</option>
                          {stockItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.category})
                            </option>
                          ))}
                        </Field>
                        <Field label="Quantité" type="number" value={line.quantity} onChange={(value) => updateDraftLine(index, { quantity: value })} />
                        <Field label="Unité" value={line.unit} onChange={(value) => updateDraftLine(index, { unit: value })} />
                        <Field label="Prix unitaire" type="number" value={line.unit_price} onChange={(value) => updateDraftLine(index, { unit_price: value })} />
                        <Field label="Total ligne" type="number" value={line.total} onChange={(value) => updateDraftLine(index, { total: value })} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-foreground/55">
                        <span>{line.inventory_item_id ? "Article stock lié" : "Lien stock facultatif"}</span>
                        <Button variant="secondary" size="sm" onClick={() => removeLine(index)}>
                          Supprimer la ligne
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {selected.rejected_reason ? (
                  <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-foreground">Motif de rejet: {selected.rejected_reason}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => void saveDraft()} disabled={saving || selected.status === "APPROVED"}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <SaveIcon />}
                    Enregistrer les corrections
                  </Button>
                  <Button variant="secondary" onClick={() => void processInvoice()} disabled={processing || selected.status === "APPROVED"}>
                    <RotateCw className="h-4 w-4" />
                    Relancer OCR
                  </Button>
                  <Button onClick={() => void approveInvoice()} disabled={processing || !selected.can_approve}>
                    <Check className="h-4 w-4" />
                    Valider la facture
                  </Button>
                </div>
              </Card>
            </section>
          ) : (
            <Card className="p-5">
              <p className="text-sm text-foreground/55">Sélectionnez une facture importée pour la consulter.</p>
            </Card>
          )}
        </section>
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  as = "input",
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  as?: "input" | "select";
  children?: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-foreground/55">{label}</span>
      {as === "select" ? (
        <select className="h-10 rounded-md border border-border bg-background px-3" value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
      ) : (
        <input className="h-10 rounded-md border border-border bg-background px-3" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function StateLine({ text }: { text: string }) {
  return <p className="px-4 py-4 text-sm text-foreground/55">{text}</p>;
}

function SaveIcon() {
  return <span className="inline-flex h-4 w-4 items-center justify-center">✓</span>;
}
