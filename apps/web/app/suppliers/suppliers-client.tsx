"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Archive, Loader2, Mail, Pencil, Phone, Plus, Save, Search, Star, Truck, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  categories: string[];
  lead_time_days: number;
  payment_terms: string | null;
  minimum_order: string | null;
  rating: string | null;
  is_active: boolean;
  stats: {
    invoice_count: number;
    review_invoice_count: number;
    purchase_total_excluding_tax: string;
  };
};

type SupplierForm = {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  categories: string;
  lead_time_days: string;
  payment_terms: string;
  minimum_order: string;
  rating: string;
};

const emptyForm: SupplierForm = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  categories: "",
  lead_time_days: "2",
  payment_terms: "",
  minimum_order: "",
  rating: "",
};

export function SuppliersClient() {
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(
    () => suppliers.filter((supplier) => `${supplier.name} ${supplier.categories.join(" ")}`.toLowerCase().includes(query.toLowerCase())),
    [query, suppliers],
  );
  const selected = suppliers.find((supplier) => supplier.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    void loadSuppliers();
  }, []);

  async function loadSuppliers(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<Supplier[]>("/suppliers");
      setSuppliers(data);
      setSelectedId(selectId ?? data[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setForm(emptyForm);
    setMode("create");
  }

  function startEdit() {
    if (!selected) return;
    setForm({
      name: selected.name,
      contact_name: selected.contact_name ?? "",
      email: selected.email ?? "",
      phone: selected.phone ?? "",
      address: selected.address ?? "",
      categories: selected.categories.join(", "),
      lead_time_days: String(selected.lead_time_days),
      payment_terms: selected.payment_terms ?? "",
      minimum_order: selected.minimum_order ?? "",
      rating: selected.rating ?? "",
    });
    setMode("edit");
  }

  async function saveSupplier() {
    setError("");
    if (!form.name.trim()) {
      setError("Le nom fournisseur est obligatoire.");
      return;
    }
    if (form.lead_time_days && Number.isNaN(Number(form.lead_time_days))) {
      setError("Le delai doit etre un nombre.");
      return;
    }
    if (form.minimum_order && Number.isNaN(Number(form.minimum_order))) {
      setError("Le minimum de commande doit etre un nombre.");
      return;
    }
    if (form.rating && (Number.isNaN(Number(form.rating)) || Number(form.rating) < 0 || Number(form.rating) > 5)) {
      setError("La note doit etre comprise entre 0 et 5.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      categories: form.categories.split(",").map((item) => item.trim()).filter(Boolean),
      lead_time_days: Number(form.lead_time_days || 0),
      payment_terms: form.payment_terms || null,
      minimum_order: form.minimum_order || null,
      rating: form.rating || null,
    };
    try {
      const saved = await apiRequest<Supplier>(mode === "edit" && selected ? `/suppliers/${selected.id}` : "/suppliers", {
        method: mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setMode("idle");
      await loadSuppliers(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelected() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const archived = await apiRequest<Supplier>(`/suppliers/${selected.id}/archive`, { method: "POST" });
      setSuppliers((current) => current.map((supplier) => (supplier.id === archived.id ? archived : supplier)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archivage impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-foreground/55">Achats et relations fournisseurs</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Fournisseurs</h1>
          </div>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Nouveau
          </Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="flex h-10 items-center gap-2 rounded-md bg-muted px-3">
                <Search className="h-4 w-4 text-foreground/45" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" />
              </div>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="Chargement fournisseurs" /> : null}
              {!loading && filtered.length === 0 ? <StateLine icon={<Truck className="h-4 w-4" />} text="Aucun fournisseur" /> : null}
              {filtered.map((supplier) => (
                <button
                  key={supplier.id}
                  className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted", supplier.id === selected?.id && "bg-muted")}
                  onClick={() => {
                    setSelectedId(supplier.id);
                    setMode("idle");
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{supplier.name}</p>
                    <p className="truncate text-xs text-foreground/55">{supplier.categories.join(", ") || "Sans categorie"}</p>
                  </div>
                  <span className={cn("rounded-md px-2 py-1 text-xs", supplier.is_active ? "bg-foreground text-background" : "bg-muted text-foreground/55")}>
                    {supplier.is_active ? "Actif" : "Archive"}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {mode === "create" || mode === "edit" ? (
            <SupplierEditor form={form} setForm={setForm} saving={saving} onCancel={() => setMode("idle")} onSave={saveSupplier} />
          ) : selected ? (
            <SupplierDetail supplier={selected} saving={saving} onEdit={startEdit} onArchive={archiveSelected} />
          ) : (
            <Card className="p-5">
              <p className="text-sm text-foreground/55">Selectionnez ou creez un fournisseur.</p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function SupplierDetail({ supplier, saving, onEdit, onArchive }: { supplier: Supplier; saving: boolean; onEdit: () => void; onArchive: () => void }) {
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm text-foreground/55">
              <Star className="h-4 w-4" />
              Note {supplier.rating ?? "non renseignee"}
            </p>
            <h2 className="mt-2 truncate text-3xl font-semibold">{supplier.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {supplier.categories.map((category) => (
                <span key={category} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/65">{category}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
            <Button variant="secondary" onClick={onArchive} disabled={saving || !supplier.is_active}>
              <Archive className="h-4 w-4" />
              Archiver
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          <Metric label="Delai" value={`${supplier.lead_time_days} j`} />
          <Metric label="Minimum" value={`${supplier.minimum_order ?? 0} EUR`} />
          <Metric label="Factures" value={String(supplier.stats.invoice_count)} />
          <Metric label="A revoir" value={String(supplier.stats.review_invoice_count)} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-base font-semibold">Contact</h3>
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-medium">{supplier.contact_name ?? "Contact non renseigne"}</p>
            <p className="flex items-center gap-2 text-foreground/60"><Mail className="h-4 w-4" />{supplier.email ?? "Email absent"}</p>
            <p className="flex items-center gap-2 text-foreground/60"><Phone className="h-4 w-4" />{supplier.phone ?? "Telephone absent"}</p>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-semibold">Conditions achat</h3>
          <div className="mt-4 space-y-3 text-sm text-foreground/65">
            <p>Paiement: {supplier.payment_terms ?? "Non renseigne"}</p>
            <p>Total achats HT: {Number(supplier.stats.purchase_total_excluding_tax || 0).toLocaleString("fr-FR")} EUR</p>
            <p>Adresse: {supplier.address ?? "Non renseignee"}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SupplierEditor({ form, setForm, saving, onCancel, onSave }: { form: SupplierForm; setForm: (form: SupplierForm) => void; saving: boolean; onCancel: () => void; onSave: () => void }) {
  function setField(field: keyof SupplierForm, value: string) {
    setForm({ ...form, [field]: value });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Fiche fournisseur</h2>
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Fermer"><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input label="Nom" value={form.name} onChange={(value) => setField("name", value)} />
        <Input label="Contact" value={form.contact_name} onChange={(value) => setField("contact_name", value)} />
        <Input label="Email" value={form.email} type="email" onChange={(value) => setField("email", value)} />
        <Input label="Telephone" value={form.phone} onChange={(value) => setField("phone", value)} />
        <Input label="Categories" value={form.categories} onChange={(value) => setField("categories", value)} />
        <Input label="Delai jours" value={form.lead_time_days} type="number" onChange={(value) => setField("lead_time_days", value)} />
        <Input label="Paiement" value={form.payment_terms} onChange={(value) => setField("payment_terms", value)} />
        <Input label="Minimum commande" value={form.minimum_order} type="number" onChange={(value) => setField("minimum_order", value)} />
        <Input label="Note" value={form.rating} type="number" onChange={(value) => setField("rating", value)} />
        <Input label="Adresse" value={form.address} onChange={(value) => setField("address", value)} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button onClick={onSave} disabled={saving || !form.name}>
          <Save className="h-4 w-4" />
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </Button>
      </div>
    </Card>
  );
}

function Input({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-foreground/55">{label}</span>
      <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
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

function StateLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">
      {icon}
      {text}
    </div>
  );
}
