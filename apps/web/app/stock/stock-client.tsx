"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, ArrowDown, ArrowUp, Boxes, Loader2, Pencil, Plus, Save, Search, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type StockItem = {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  supplier_name: string | null;
  storage_area: string | null;
  unit: string;
  quantity_on_hand: string;
  reorder_point: string;
  average_cost: string;
  average_weight_grams: string | null;
  edible_yield_rate: string | null;
  weight_source: string | null;
  stock_value: string;
  allergens: string[];
  auto_allergens: string[];
  is_active: boolean;
  is_below_reorder_point: boolean;
  movement_count: number;
};

type StockForm = {
  name: string;
  category: string;
  unit: string;
  sku: string;
  storage_area: string;
  quantity_on_hand: string;
  reorder_point: string;
  average_cost: string;
  average_weight_grams: string;
  edible_yield_rate: string;
  weight_source: string;
  allergens: string;
};

const emptyForm: StockForm = {
  name: "",
  category: "",
  unit: "kg",
  sku: "",
  storage_area: "",
  quantity_on_hand: "0",
  reorder_point: "0",
  average_cost: "0",
  average_weight_grams: "",
  edible_yield_rate: "",
  weight_source: "",
  allergens: "",
};

const fieldLabels: Record<keyof StockForm, string> = {
  name: "Nom",
  category: "Catégorie",
  unit: "Unité",
  sku: "SKU",
  storage_area: "Zone de stockage",
  quantity_on_hand: "Quantité en stock",
  reorder_point: "Seuil de réapprovisionnement",
  average_cost: "Coût moyen",
  average_weight_grams: "Poids moyen brut (g)",
  edible_yield_rate: "Rendement comestible",
  weight_source: "Référence poids",
  allergens: "Allergènes",
};

export function StockClient() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<StockForm>(emptyForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(
    () => items.filter((item) => `${item.name} ${item.category} ${item.supplier_name ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );
  const selected = items.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const stockValue = items.reduce((total, item) => total + Number(item.stock_value || 0), 0);
  const alerts = items.filter((item) => item.is_below_reorder_point);

  useEffect(() => {
    void loadItems();
  }, [showArchived]);

  async function loadItems(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<StockItem[]>(`/inventory${showArchived ? "?include_archived=true" : ""}`);
      setItems(data);
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
    setSuccess("");
  }

  function startEdit(item: StockItem) {
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      sku: item.sku ?? "",
      storage_area: item.storage_area ?? "",
      quantity_on_hand: item.quantity_on_hand,
      reorder_point: item.reorder_point,
      average_cost: item.average_cost,
      average_weight_grams: item.average_weight_grams ?? "",
      edible_yield_rate: item.edible_yield_rate ?? "",
      weight_source: item.weight_source ?? "",
      allergens: item.allergens.join(", "),
    });
    setSelectedId(item.id);
    setMode("edit");
    setSuccess("");
  }

  async function saveItem() {
    setError("");
    setSuccess("");
    if (!form.name.trim() || !form.category.trim() || !form.unit.trim()) {
      setError("Nom, catégorie et unité sont obligatoires.");
      return;
    }
    for (const [label, value] of [
      ["quantité", form.quantity_on_hand],
      ["seuil", form.reorder_point],
      ["coût moyen", form.average_cost],
    ]) {
      if (Number.isNaN(Number(value)) || Number(value) < 0) {
        setError(`Le champ ${label} doit être un nombre positif.`);
        return;
      }
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      unit: form.unit.trim(),
      sku: form.sku || null,
      storage_area: form.storage_area || null,
      quantity_on_hand: form.quantity_on_hand,
      reorder_point: form.reorder_point,
      average_cost: form.average_cost,
      average_weight_grams: form.average_weight_grams || null,
      edible_yield_rate: form.edible_yield_rate || null,
      weight_source: form.weight_source || null,
      allergens: form.allergens.split(",").map((item) => item.trim()).filter(Boolean),
    };
    try {
      const isEdit = mode === "edit" && selected;
      const saved = await apiRequest<StockItem>(isEdit ? `/inventory/${selected.id}` : "/inventory", {
        method: mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setItems((current) => {
        const exists = current.some((item) => item.id === saved.id);
        if (exists) return current.map((item) => (item.id === saved.id ? saved : item));
        return [saved, ...current];
      });
      setSelectedId(saved.id);
      setMode("idle");
      setSuccess(isEdit ? "Article mis à jour." : "Article créé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function move(item: StockItem, quantity: number) {
    setSaving(true);
    setError("");
    try {
      await apiRequest("/inventory/movements", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: item.id,
          type: quantity > 0 ? "PURCHASE" : "WASTE",
          quantity,
          unit_cost: item.average_cost,
          note: quantity > 0 ? "Entree stock web" : "Sortie stock web",
        }),
      });
      setItems((current) =>
        current.map((entry) => {
          if (entry.id !== item.id) return entry;
          const nextQuantity = Math.max(0, Number(entry.quantity_on_hand) + quantity);
          const nextValue = nextQuantity * Number(entry.average_cost || 0);
          return {
            ...entry,
            quantity_on_hand: String(nextQuantity),
            stock_value: String(nextValue),
            is_below_reorder_point: nextQuantity <= Number(entry.reorder_point || 0),
            movement_count: entry.movement_count + 1,
          };
        }),
      );
      setSuccess(quantity > 0 ? "Entrée stock enregistrée." : "Sortie stock enregistrée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mouvement impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archiveItem(item: StockItem) {
    if (!window.confirm(`Archiver l'article "${item.name}" ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const archived = await apiRequest<StockItem>(`/inventory/${item.id}`, { method: "DELETE" });
      setItems((current) => {
        const updated = current.map((entry) => (entry.id === archived.id ? archived : entry));
        return showArchived ? updated : updated.filter((entry) => entry.is_active);
      });
      setSelectedId((current) => (current === archived.id ? "" : current));
      setSuccess("Article archivé.");
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
            <p className="text-sm text-foreground/55">Seuils, mouvements et valorisation</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Stocks intelligents</h1>
          </div>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Article
          </Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 sm:grid-cols-4">
          <Metric label="Valeur stock" value={`${Math.round(stockValue).toLocaleString("fr-FR")} EUR`} />
          <Metric label="Articles" value={String(items.length)} />
          <Metric label="Alertes" value={String(alerts.length)} />
          <Metric label="Mouvements" value={String(items.reduce((total, item) => total + item.movement_count, 0))} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="flex h-10 items-center gap-2 rounded-md bg-muted px-3">
                <Search className="h-4 w-4 text-foreground/45" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un article" />
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Afficher les archivés
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement stock" /> : null}
              {!loading && filtered.length === 0 ? <StateLine text="Aucun article stock" loading={false} /> : null}
              {filtered.map((item) => (
                <div key={item.id} className={cn("grid gap-3 px-4 py-4 sm:grid-cols-[1fr_150px_156px] sm:items-center", item.id === selected?.id && "bg-muted")}>
                  <button className="flex min-w-0 gap-3 text-left" onClick={() => setSelectedId(item.id)}>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", item.is_below_reorder_point && "bg-foreground text-background")}>
                      {item.is_below_reorder_point ? <AlertTriangle className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-foreground/55">{item.category} - {item.supplier_name ?? "Sans fournisseur"} - {item.storage_area ?? "Sans zone"}</p>
                      {item.auto_allergens.length > 0 ? (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-0.5 text-xs text-background">
                          <Sparkles className="h-3 w-3" />
                          Détection automatique: {item.auto_allergens.join(", ")}
                        </p>
                      ) : null}
                      {item.average_weight_grams ? (
                        <p className="mt-1 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/60">
                          1 pièce ≈ {Number(item.average_weight_grams).toLocaleString("fr-FR")} g brut
                          {item.edible_yield_rate ? ` · rendement ${Math.round(Number(item.edible_yield_rate) * 100)} %` : ""}
                        </p>
                      ) : null}
                    </div>
                  </button>
                  <div>
                    <p className="text-sm font-semibold">{Number(item.quantity_on_hand).toFixed(3)} {item.unit}</p>
                    <p className="text-xs text-foreground/55">Seuil {Number(item.reorder_point).toFixed(3)} {item.unit}</p>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <Button variant="secondary" size="icon" aria-label="Modifier" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Sortie stock" disabled={saving || !item.is_active} onClick={() => move(item, -1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Entrée stock" disabled={saving || !item.is_active} onClick={() => move(item, 1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Archiver" disabled={saving || !item.is_active} onClick={() => archiveItem(item)}><Archive className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {mode === "create" || mode === "edit" ? (
            <StockEditor form={form} setForm={setForm} saving={saving} onCancel={() => setMode("idle")} onSave={saveItem} />
          ) : (
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background"><AlertTriangle className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-base font-semibold">Alertes rupture</h2>
                  <p className="text-sm text-foreground/55">{alerts.length} article(s) sous seuil</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {alerts.map((item) => (
                  <div key={item.id} className="rounded-md bg-muted px-3 py-3">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-foreground/55">Stock {Number(item.quantity_on_hand).toFixed(3)} {item.unit}, seuil {Number(item.reorder_point).toFixed(3)} {item.unit}.</p>
                  </div>
                ))}
                {!loading && alerts.length === 0 ? <p className="text-sm text-foreground/55">Aucune alerte active.</p> : null}
              </div>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StockEditor({ form, setForm, saving, onCancel, onSave }: { form: StockForm; setForm: (form: StockForm) => void; saving: boolean; onCancel: () => void; onSave: () => void }) {
  function setField(field: keyof StockForm, value: string) {
    setForm({ ...form, [field]: value });
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Article stock</h2>
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Fermer"><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.name}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" value={form.name} onChange={(event) => setField("name", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.category}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" value={form.category} onChange={(event) => setField("category", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.unit}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" value={form.unit} onChange={(event) => setField("unit", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.sku}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" value={form.sku} onChange={(event) => setField("sku", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.storage_area}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" value={form.storage_area} onChange={(event) => setField("storage_area", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.quantity_on_hand}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type="number" value={form.quantity_on_hand} onChange={(event) => setField("quantity_on_hand", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.reorder_point}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type="number" value={form.reorder_point} onChange={(event) => setField("reorder_point", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.average_cost}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type="number" value={form.average_cost} onChange={(event) => setField("average_cost", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.average_weight_grams}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type="number" value={form.average_weight_grams} onChange={(event) => setField("average_weight_grams", event.target.value)} placeholder="Ex: 1500" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.edible_yield_rate}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type="number" step="0.01" min="0" max="1" value={form.edible_yield_rate} onChange={(event) => setField("edible_yield_rate", event.target.value)} placeholder="Ex: 0.60" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">{fieldLabels.weight_source}</span>
          <select className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" value={form.weight_source} onChange={(event) => setField("weight_source", event.target.value)}>
            <option value="">Auto</option>
            <option value="REFERENCE">Référence</option>
            <option value="MANUAL">Manuel</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs text-foreground/55">{fieldLabels.allergens}</span>
          <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" value={form.allergens} onChange={(event) => setField("allergens", event.target.value)} placeholder="Ex: poisson, lait" />
        </label>
        <p className="sm:col-span-2 text-xs text-foreground/55">
          Les allergènes détectés automatiquement depuis le nom et la catégorie sont ajoutés à la sauvegarde. Les champs poids et rendement servent à convertir les articles vendus à la pièce en kg/g dans les fiches techniques.
        </p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button onClick={onSave} disabled={saving || !form.name || !form.category || !form.unit}><Save className="h-4 w-4" />{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {text}
    </div>
  );
}
