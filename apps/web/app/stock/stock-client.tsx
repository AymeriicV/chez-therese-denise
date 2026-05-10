"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, Loader2, Pencil, Plus, Save, Search, X } from "lucide-react";
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
  stock_value: string;
  allergens: string[];
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
  allergens: "",
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

  const filtered = useMemo(
    () => items.filter((item) => `${item.name} ${item.category} ${item.supplier_name ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );
  const selected = items.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const stockValue = items.reduce((total, item) => total + Number(item.stock_value || 0), 0);
  const alerts = items.filter((item) => item.is_below_reorder_point);

  useEffect(() => {
    void loadItems();
  }, []);

  async function loadItems(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<StockItem[]>("/inventory");
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
      allergens: item.allergens.join(", "),
    });
    setSelectedId(item.id);
    setMode("edit");
  }

  async function saveItem() {
    setError("");
    if (!form.name.trim() || !form.category.trim() || !form.unit.trim()) {
      setError("Nom, categorie et unite sont obligatoires.");
      return;
    }
    for (const [label, value] of [
      ["quantite", form.quantity_on_hand],
      ["seuil", form.reorder_point],
      ["cout moyen", form.average_cost],
    ]) {
      if (Number.isNaN(Number(value)) || Number(value) < 0) {
        setError(`Le champ ${label} doit etre un nombre positif.`);
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
      allergens: form.allergens.split(",").map((item) => item.trim()).filter(Boolean),
    };
    try {
      const saved = await apiRequest<StockItem>(mode === "edit" && selected ? `/inventory/${selected.id}` : "/inventory", {
        method: mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setMode("idle");
      await loadItems(saved.id);
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
      await loadItems(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mouvement impossible");
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
                    </div>
                  </button>
                  <div>
                    <p className="text-sm font-semibold">{Number(item.quantity_on_hand).toFixed(3)} {item.unit}</p>
                    <p className="text-xs text-foreground/55">Seuil {Number(item.reorder_point).toFixed(3)} {item.unit}</p>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <Button variant="secondary" size="icon" aria-label="Modifier" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Sortie stock" disabled={saving} onClick={() => move(item, -1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Entree stock" disabled={saving} onClick={() => move(item, 1)}><ArrowUp className="h-4 w-4" /></Button>
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
        {(Object.keys(form) as Array<keyof StockForm>).map((key) => (
          <label key={key} className="grid gap-1 text-sm">
            <span className="text-xs capitalize text-foreground/55">{key.replaceAll("_", " ")}</span>
            <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type={["quantity_on_hand", "reorder_point", "average_cost"].includes(key) ? "number" : "text"} value={form[key]} onChange={(event) => setField(key, event.target.value)} />
          </label>
        ))}
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
