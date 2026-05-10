"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Eye, Loader2, Pencil, Plus, Printer, Save, Tags, X } from "lucide-react";
import { QualityNav } from "@/components/quality/quality-nav";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type FoodLabel = {
  id: string;
  title: string;
  item_name: string;
  batch_number: string | null;
  quantity: string | null;
  unit: string | null;
  prepared_at: string;
  expires_at: string;
  storage_area: string | null;
  conservation_temperature: string | null;
  allergens: string[];
  notes: string | null;
  status: "ACTIVE" | "PRINTED" | "EXPIRED";
  source_type: "STOCK" | "RECIPE" | "FREE" | "PRODUCTION";
  source_id: string | null;
  expiry_kind: "DLC" | "DDM";
  is_archived: boolean;
};

type SourceItem = { id: string; name: string; unit?: string; allergens: string[]; storage_area?: string | null };
type Sources = { stock: SourceItem[]; recipes: SourceItem[] };
type FormState = {
  source_type: "STOCK" | "RECIPE" | "FREE" | "PRODUCTION";
  source_id: string;
  title: string;
  item_name: string;
  batch_number: string;
  quantity: string;
  unit: string;
  prepared_at: string;
  expires_at: string;
  expiry_kind: "DLC" | "DDM";
  storage_area: string;
  conservation_temperature: string;
  allergens: string;
  notes: string;
};

function defaultForm(): FormState {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    source_type: "FREE",
    source_id: "",
    title: "",
    item_name: "",
    batch_number: "",
    quantity: "",
    unit: "kg",
    prepared_at: now.toISOString().slice(0, 16),
    expires_at: tomorrow.toISOString().slice(0, 16),
    expiry_kind: "DLC",
    storage_area: "Chambre froide",
    conservation_temperature: "0°C à 4°C",
    allergens: "",
    notes: "",
  };
}

export function LabelsClient() {
  const [labels, setLabels] = useState<FoodLabel[]>([]);
  const [sources, setSources] = useState<Sources>({ stock: [], recipes: [] });
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<FormState>(defaultForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = labels.find((label) => label.id === selectedId) ?? labels[0] ?? null;
  const activeLabels = useMemo(() => labels.filter((label) => !label.is_archived), [labels]);
  const expiredCount = activeLabels.filter((label) => new Date(label.expires_at).getTime() < Date.now() || label.status === "EXPIRED").length;
  const sourceOptions = form.source_type === "STOCK" ? sources.stock : form.source_type === "RECIPE" ? sources.recipes : [];

  useEffect(() => {
    void loadData();
  }, [showArchived]);

  async function loadData(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const [labelData, sourceData] = await Promise.all([
        apiRequest<FoodLabel[]>(`/quality/labels${showArchived ? "?include_archived=true" : ""}`),
        apiRequest<Sources>("/quality/labels/sources"),
      ]);
      setLabels(labelData);
      setSources(sourceData);
      setSelectedId(selectId ?? labelData[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function startCreate(sourceType: FormState["source_type"] = "FREE") {
    setForm({ ...defaultForm(), source_type: sourceType });
    setMode("create");
    setSuccess("");
  }

  function startEdit(label: FoodLabel) {
    setForm({
      source_type: label.source_type,
      source_id: label.source_id ?? "",
      title: label.title,
      item_name: label.item_name,
      batch_number: label.batch_number ?? "",
      quantity: label.quantity ? String(label.quantity) : "",
      unit: label.unit ?? "",
      prepared_at: label.prepared_at.slice(0, 16),
      expires_at: label.expires_at.slice(0, 16),
      expiry_kind: label.expiry_kind,
      storage_area: label.storage_area ?? "",
      conservation_temperature: label.conservation_temperature ?? "",
      allergens: label.allergens.join(", "),
      notes: label.notes ?? "",
    });
    setSelectedId(label.id);
    setMode("edit");
    setSuccess("");
  }

  function setField(field: keyof FormState, value: string) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "source_type") {
        next.source_id = "";
        next.title = "";
        next.item_name = "";
        next.allergens = "";
      }
      if (field === "source_id") {
        const source = (next.source_type === "STOCK" ? sources.stock : sources.recipes).find((item) => item.id === value);
        if (source) {
          next.title = source.name;
          next.item_name = source.name;
          next.allergens = source.allergens.join(", ");
          next.storage_area = source.storage_area ?? next.storage_area;
          next.unit = source.unit ?? next.unit;
        }
      }
      return next;
    });
  }

  async function saveLabel() {
    setError("");
    setSuccess("");
    if (!form.title.trim() || !form.item_name.trim()) {
      setError("Nom produit et titre d'étiquette sont obligatoires.");
      return;
    }
    if (form.source_type !== "FREE" && !form.source_id) {
      setError("Sélectionnez la source de l'étiquette.");
      return;
    }
    if (form.quantity && (Number.isNaN(Number(form.quantity)) || Number(form.quantity) < 0)) {
      setError("La quantité doit être positive.");
      return;
    }
    if (new Date(form.expires_at) <= new Date(form.prepared_at)) {
      setError("La DLC / DDM doit être postérieure à la fabrication.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      item_name: form.item_name.trim(),
      source_type: form.source_type,
      source_id: form.source_id || null,
      batch_number: form.batch_number || null,
      quantity: form.quantity || null,
      unit: form.unit || null,
      prepared_at: new Date(form.prepared_at).toISOString(),
      expires_at: new Date(form.expires_at).toISOString(),
      expiry_kind: form.expiry_kind,
      storage_area: form.storage_area || null,
      conservation_temperature: form.conservation_temperature || null,
      allergens: form.allergens.split(",").map((item) => item.trim()).filter(Boolean),
      notes: form.notes || null,
    };
    try {
      const isEdit = mode === "edit" && selected;
      const saved = await apiRequest<FoodLabel>(isEdit ? `/quality/labels/${selected.id}` : "/quality/labels", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setLabels((current) => current.some((label) => label.id === saved.id) ? current.map((label) => label.id === saved.id ? saved : label) : [saved, ...current]);
      setSelectedId(saved.id);
      setMode("idle");
      setSuccess(isEdit ? "Étiquette mise à jour." : "Étiquette créée. Elle apparaît dans la liste des étiquettes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function markPrinted(label: FoodLabel) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<FoodLabel>(`/quality/labels/${label.id}`, { method: "PATCH", body: JSON.stringify({ status: "PRINTED" }) });
      setLabels((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess("Étiquette marquée comme imprimée.");
      window.print();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impression impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archive(label: FoodLabel) {
    if (!window.confirm(`Archiver l'étiquette "${label.title}" ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const archived = await apiRequest<FoodLabel>(`/quality/labels/${label.id}`, { method: "DELETE" });
      setLabels((current) => {
        const updated = current.map((entry) => entry.id === archived.id ? archived : entry);
        return showArchived ? updated : updated.filter((entry) => !entry.is_archived);
      });
      setSelectedId((current) => current === archived.id ? "" : current);
      setSuccess("Étiquette archivée.");
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
            <p className="text-sm text-foreground/55">Catégorie Étiquettes du module Qualité / HACCP</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Étiquettes</h1>
          </div>
          <Button onClick={() => startCreate()}><Plus className="h-4 w-4" />Créer une étiquette</Button>
        </section>

        <QualityNav compact active="labels" />

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Actives" value={String(activeLabels.length)} />
          <Metric label="Expirées" value={String(expiredCount)} />
          <Metric label="Imprimées" value={String(activeLabels.filter((label) => label.status === "PRINTED").length)} />
        </section>

        {mode !== "idle" ? (
          <Card className="p-4">
            <div className="mb-4 flex flex-wrap gap-2">
              <Button variant={form.source_type === "STOCK" ? "primary" : "secondary"} onClick={() => setField("source_type", "STOCK")}>Depuis stock</Button>
              <Button variant={form.source_type === "RECIPE" ? "primary" : "secondary"} onClick={() => setField("source_type", "RECIPE")}>Depuis fiche technique</Button>
              <Button variant={form.source_type === "FREE" ? "primary" : "secondary"} onClick={() => setField("source_type", "FREE")}>Préparation libre</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {form.source_type !== "FREE" ? (
                <label className="grid gap-1 text-sm">
                  <span className="text-xs text-foreground/55">Source</span>
                  <select className="h-10 rounded-md border border-border bg-background px-3 outline-none" value={form.source_id} onChange={(event) => setField("source_id", event.target.value)}>
                    <option value="">Sélectionner</option>
                    {sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                  </select>
                </label>
              ) : null}
              <Input label="Nom produit" value={form.item_name} onChange={(value) => setField("item_name", value)} />
              <Input label="Titre étiquette" value={form.title} onChange={(value) => setField("title", value)} />
              <Input label="Lot" value={form.batch_number} onChange={(value) => setField("batch_number", value)} />
              <Input label="Quantité" type="number" value={form.quantity} onChange={(value) => setField("quantity", value)} />
              <Input label="Unité" value={form.unit} onChange={(value) => setField("unit", value)} />
              <Input label="Date de fabrication" type="datetime-local" value={form.prepared_at} onChange={(value) => setField("prepared_at", value)} />
              <label className="grid gap-1 text-sm">
                <span className="text-xs text-foreground/55">DLC / DDM</span>
                <select className="h-10 rounded-md border border-border bg-background px-3 outline-none" value={form.expiry_kind} onChange={(event) => setField("expiry_kind", event.target.value)}>
                  <option value="DLC">DLC</option>
                  <option value="DDM">DDM</option>
                </select>
              </label>
              <Input label="Date limite" type="datetime-local" value={form.expires_at} onChange={(value) => setField("expires_at", value)} />
              <Input label="Zone de stockage" value={form.storage_area} onChange={(value) => setField("storage_area", value)} />
              <Input label="Température conservation" value={form.conservation_temperature} onChange={(value) => setField("conservation_temperature", value)} />
              <Input label="Allergènes" value={form.allergens} onChange={(value) => setField("allergens", value)} />
              <Input label="Commentaire" value={form.notes} onChange={(value) => setField("notes", value)} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMode("idle")}><X className="h-4 w-4" />Annuler</Button>
              <Button onClick={saveLabel} disabled={saving || !form.title || !form.item_name}><Save className="h-4 w-4" />Enregistrer</Button>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Afficher les archivées
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des étiquettes" /> : null}
              {!loading && labels.length === 0 ? <StateLine text="Aucune étiquette créée. Utilisez le bouton Créer une étiquette." loading={false} /> : null}
              {labels.map((label) => (
                <div key={label.id} className={cn("grid gap-3 px-4 py-4 sm:grid-cols-[1fr_130px_190px] sm:items-center", selected?.id === label.id && "bg-muted")}>
                  <button className="flex min-w-0 gap-3 text-left" onClick={() => setSelectedId(label.id)}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"><Tags className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{label.title}</p>
                      <p className="truncate text-xs text-foreground/55">{label.item_name} - {label.source_type === "STOCK" ? "stock" : label.source_type === "RECIPE" ? "fiche technique" : label.source_type === "PRODUCTION" ? "production" : "libre"}</p>
                    </div>
                  </button>
                  <p className="text-sm text-foreground/70">{label.expiry_kind} {new Date(label.expires_at).toLocaleDateString("fr-FR")}</p>
                  <div className="flex gap-2 sm:justify-end">
                    <Button variant="secondary" size="icon" aria-label="Aperçu" onClick={() => setSelectedId(label.id)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Imprimer" disabled={saving || label.is_archived} onClick={() => markPrinted(label)}><Printer className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Modifier" disabled={saving || label.is_archived} onClick={() => startEdit(label)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Archiver" disabled={saving || label.is_archived} onClick={() => archive(label)}><Archive className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 print:shadow-none">
            {selected ? (
              <div className="rounded-md border border-border p-4">
                <p className="text-xs uppercase text-foreground/55">Aperçu imprimable</p>
                <h2 className="mt-2 text-2xl font-semibold">{selected.item_name}</h2>
                <div className="mt-4 grid gap-2 text-sm">
                  <Line label="Type" value={selected.source_type === "STOCK" ? "Article stock" : selected.source_type === "RECIPE" ? "Fiche technique" : selected.source_type === "PRODUCTION" ? "Lot de production" : "Préparation libre"} />
                  <Line label="Fabrication" value={new Date(selected.prepared_at).toLocaleString("fr-FR")} />
                  <Line label={selected.expiry_kind} value={new Date(selected.expires_at).toLocaleString("fr-FR")} />
                  <Line label="Lot" value={selected.batch_number || "-"} />
                  <Line label="Zone" value={selected.storage_area || "-"} />
                  <Line label="Conservation" value={selected.conservation_temperature || "-"} />
                  <Line label="Allergènes" value={selected.allergens.join(", ") || "aucun"} />
                  <Line label="Commentaire" value={selected.notes || "-"} />
                </div>
                <Button className="mt-5 print:hidden" onClick={() => markPrinted(selected)} disabled={saving || selected.is_archived}><Printer className="h-4 w-4" />Imprimer</Button>
              </div>
            ) : <p className="text-sm text-foreground/55">Les étiquettes créées s'affichent ici.</p>}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function Input({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm"><span className="text-xs text-foreground/55">{label}</span><input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted px-3 py-3"><p className="text-xs text-foreground/55">{label}</p><p className="mt-1 truncate text-base font-semibold">{value}</p></div>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <p className="flex justify-between gap-3 border-b border-border/60 pb-2"><span className="text-foreground/55">{label}</span><span className="text-right font-medium">{value}</span></p>;
}

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{text}</div>;
}
