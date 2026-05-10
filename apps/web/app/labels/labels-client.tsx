"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Clock, Loader2, Pencil, Plus, Printer, Save, Tags, X } from "lucide-react";
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
  allergens: string[];
  notes: string | null;
  status: "ACTIVE" | "PRINTED" | "EXPIRED";
  is_archived: boolean;
};

type FormState = {
  title: string;
  item_name: string;
  batch_number: string;
  quantity: string;
  unit: string;
  prepared_at: string;
  expires_at: string;
  storage_area: string;
  allergens: string;
  notes: string;
};

function defaultForm(): FormState {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    title: "",
    item_name: "",
    batch_number: "",
    quantity: "",
    unit: "kg",
    prepared_at: now.toISOString().slice(0, 16),
    expires_at: tomorrow.toISOString().slice(0, 16),
    storage_area: "Chambre froide",
    allergens: "",
    notes: "",
  };
}

export function LabelsClient() {
  const [labels, setLabels] = useState<FoodLabel[]>([]);
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

  useEffect(() => {
    void loadLabels();
  }, [showArchived]);

  async function loadLabels(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<FoodLabel[]>(`/quality/labels${showArchived ? "?include_archived=true" : ""}`);
      setLabels(data);
      setSelectedId(selectId ?? data[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setForm(defaultForm());
    setMode("create");
    setSuccess("");
  }

  function startEdit(label: FoodLabel) {
    setForm({
      title: label.title,
      item_name: label.item_name,
      batch_number: label.batch_number ?? "",
      quantity: label.quantity ? String(label.quantity) : "",
      unit: label.unit ?? "",
      prepared_at: label.prepared_at.slice(0, 16),
      expires_at: label.expires_at.slice(0, 16),
      storage_area: label.storage_area ?? "",
      allergens: label.allergens.join(", "),
      notes: label.notes ?? "",
    });
    setSelectedId(label.id);
    setMode("edit");
    setSuccess("");
  }

  async function saveLabel() {
    setError("");
    setSuccess("");
    if (!form.title.trim() || !form.item_name.trim()) {
      setError("Titre et produit sont obligatoires.");
      return;
    }
    if (form.quantity && (Number.isNaN(Number(form.quantity)) || Number(form.quantity) < 0)) {
      setError("La quantité doit être positive.");
      return;
    }
    if (new Date(form.expires_at) <= new Date(form.prepared_at)) {
      setError("La DLC doit être postérieure à la préparation.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      item_name: form.item_name.trim(),
      batch_number: form.batch_number || null,
      quantity: form.quantity || null,
      unit: form.unit || null,
      prepared_at: new Date(form.prepared_at).toISOString(),
      expires_at: new Date(form.expires_at).toISOString(),
      storage_area: form.storage_area || null,
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
      setSuccess(isEdit ? "Étiquette mise à jour." : "Étiquette créée.");
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
      const updated = await apiRequest<FoodLabel>(`/quality/labels/${label.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "PRINTED" }),
      });
      setLabels((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess("Étiquette marquée comme imprimée.");
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
            <p className="text-sm text-foreground/55">DLC, lots, allergènes et impression cuisine</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Étiquettes</h1>
          </div>
          <Button onClick={startCreate}><Plus className="h-4 w-4" />Étiquette</Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Actives" value={String(activeLabels.length)} />
          <Metric label="Expirées" value={String(expiredCount)} />
          <Metric label="Imprimées" value={String(activeLabels.filter((label) => label.status === "PRINTED").length)} />
        </section>

        {mode !== "idle" ? <Editor form={form} setForm={setForm} saving={saving} onCancel={() => setMode("idle")} onSave={saveLabel} /> : null}

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Afficher les archivées
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des étiquettes" /> : null}
              {!loading && labels.length === 0 ? <StateLine text="Aucune étiquette" loading={false} /> : null}
              {labels.map((label) => {
                const expired = new Date(label.expires_at).getTime() < Date.now() || label.status === "EXPIRED";
                return (
                  <div key={label.id} className={cn("grid gap-3 px-4 py-4 sm:grid-cols-[1fr_140px_190px] sm:items-center", selected?.id === label.id && "bg-muted")}>
                    <button className="flex min-w-0 gap-3 text-left" onClick={() => setSelectedId(label.id)}>
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", expired && "bg-foreground text-background")}>
                        <Tags className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{label.title}</p>
                        <p className="truncate text-xs text-foreground/55">{label.item_name} - {label.batch_number || "Sans lot"}</p>
                      </div>
                    </button>
                    <p className="text-sm text-foreground/70">DLC {new Date(label.expires_at).toLocaleDateString("fr-FR")}</p>
                    <div className="flex gap-2 sm:justify-end">
                      <Button variant="secondary" size="icon" aria-label="Imprimer" disabled={saving || label.is_archived} onClick={() => markPrinted(label)}><Printer className="h-4 w-4" /></Button>
                      <Button variant="secondary" size="icon" aria-label="Modifier" disabled={saving || label.is_archived} onClick={() => startEdit(label)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="secondary" size="icon" aria-label="Archiver" disabled={saving || label.is_archived} onClick={() => archive(label)}><Archive className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            {selected ? (
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted"><Clock className="h-4 w-4" /></div>
                  <div>
                    <h2 className="text-xl font-semibold">{selected.title}</h2>
                    <p className="text-sm text-foreground/55">{selected.item_name}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Metric label="Préparation" value={new Date(selected.prepared_at).toLocaleString("fr-FR")} />
                  <Metric label="DLC" value={new Date(selected.expires_at).toLocaleString("fr-FR")} />
                  <Metric label="Quantité" value={`${selected.quantity ?? "-"} ${selected.unit ?? ""}`} />
                  <Metric label="Zone" value={selected.storage_area ?? "Non renseignée"} />
                </div>
                <p className="mt-4 rounded-md bg-muted px-3 py-3 text-sm text-foreground/65">Allergènes: {selected.allergens.join(", ") || "aucun"}</p>
              </div>
            ) : <p className="text-sm text-foreground/55">Sélectionnez une étiquette.</p>}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function Editor({ form, setForm, saving, onCancel, onSave }: { form: FormState; setForm: (form: FormState) => void; saving: boolean; onCancel: () => void; onSave: () => void }) {
  function setField(field: keyof FormState, value: string) {
    setForm({ ...form, [field]: value });
  }
  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Titre" value={form.title} onChange={(value) => setField("title", value)} />
        <Input label="Produit" value={form.item_name} onChange={(value) => setField("item_name", value)} />
        <Input label="Lot" value={form.batch_number} onChange={(value) => setField("batch_number", value)} />
        <Input label="Zone" value={form.storage_area} onChange={(value) => setField("storage_area", value)} />
        <Input label="Quantité" type="number" value={form.quantity} onChange={(value) => setField("quantity", value)} />
        <Input label="Unité" value={form.unit} onChange={(value) => setField("unit", value)} />
        <Input label="Préparation" type="datetime-local" value={form.prepared_at} onChange={(value) => setField("prepared_at", value)} />
        <Input label="DLC" type="datetime-local" value={form.expires_at} onChange={(value) => setField("expires_at", value)} />
        <Input label="Allergènes" value={form.allergens} onChange={(value) => setField("allergens", value)} />
        <Input label="Notes" value={form.notes} onChange={(value) => setField("notes", value)} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}><X className="h-4 w-4" />Annuler</Button>
        <Button onClick={onSave} disabled={saving || !form.title || !form.item_name}><Save className="h-4 w-4" />Enregistrer</Button>
      </div>
    </Card>
  );
}

function Input({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm"><span className="text-xs text-foreground/55">{label}</span><input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted px-3 py-3"><p className="text-xs text-foreground/55">{label}</p><p className="mt-1 truncate text-base font-semibold">{value}</p></div>;
}

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{text}</div>;
}
