"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Archive, ClipboardList, Loader2, Plus, Printer, Save } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type RecipeIngredient = {
  id: string;
  inventory_item_id: string | null;
  name: string;
  quantity: string;
  unit: string;
  total_cost: string;
};

type Recipe = {
  id: string;
  name: string;
  category: string | null;
  portion_yield: string;
  food_cost: string;
  allergens: string[];
  ingredients: RecipeIngredient[];
  is_active: boolean;
};

type ProductionBatch = {
  id: string;
  recipe_id: string;
  recipe_name: string;
  lot_number: string;
  quantity_produced: string;
  unit: string;
  prepared_at: string;
  expires_at: string;
  shelf_life_hours: number;
  storage_area: string | null;
  conservation_temperature: string | null;
  allergens: string[];
  total_ingredient_cost: string;
  cost_per_unit: string;
  waste_quantity: string;
  waste_reason: string | null;
  notes: string | null;
  status: "ACTIVE" | "ARCHIVED";
  is_archived: boolean;
  labels: Array<{ id: string; title: string; status: string; expires_at: string; batch_number: string | null }>;
  consumptions: Array<{
    id: string;
    inventory_item_id: string;
    inventory_item_name: string;
    ingredient_name: string;
    quantity_consumed: string;
    unit: string;
    unit_cost_snapshot: string;
    total_cost: string;
  }>;
};

type FormState = {
  recipe_id: string;
  quantity_produced: string;
  produced_at: string;
  shelf_life_hours: string;
  label_count: string;
  lot_number: string;
  storage_area: string;
  conservation_temperature: string;
  waste_quantity: string;
  waste_reason: string;
  notes: string;
};

function nowLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

const emptyForm: FormState = {
  recipe_id: "",
  quantity_produced: "1",
  produced_at: nowLocal(),
  shelf_life_hours: "72",
  label_count: "1",
  lot_number: "",
  storage_area: "Chambre froide",
  conservation_temperature: "0°C à 4°C",
  waste_quantity: "0",
  waste_reason: "",
  notes: "",
};

export function ProductionClient() {
  const searchParams = useSearchParams();
  const recipeIdParam = searchParams.get("recipe_id");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedRecipe = recipes.find((recipe) => recipe.id === form.recipe_id) ?? null;
  const selectedBatch = batches.find((batch) => batch.id === selectedId) ?? batches[0] ?? null;
  const productionPreview = useMemo(() => {
    if (!selectedRecipe) return [];
    const multiplier = Number(form.quantity_produced || 0) / Math.max(Number(selectedRecipe.portion_yield || 1), 1);
    return selectedRecipe.ingredients
      .filter((ingredient) => ingredient.inventory_item_id)
      .map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        quantity: (Number(ingredient.quantity) * multiplier).toFixed(3),
        unit: ingredient.unit,
      }));
  }, [selectedRecipe, form.quantity_produced]);

  const expiryPreview = useMemo(() => {
    const hours = Number(form.shelf_life_hours || 0);
    const producedAt = new Date(form.produced_at);
    if (!hours || Number.isNaN(producedAt.getTime())) return "";
    return new Date(producedAt.getTime() + hours * 3600_000).toLocaleString("fr-FR");
  }, [form.produced_at, form.shelf_life_hours]);

  useEffect(() => {
    void loadData();
  }, [showArchived]);

  async function loadData(nextSelectedId?: string) {
    setLoading(true);
    setError("");
    try {
      const [recipeData, batchData] = await Promise.all([
        apiRequest<Recipe[]>("/recipes"),
        apiRequest<ProductionBatch[]>(`/production${showArchived ? "?include_archived=true" : ""}`),
      ]);
      const activeRecipes = recipeData.filter((recipe) => recipe.is_active);
      setRecipes(activeRecipes);
      setBatches(batchData);
      setSelectedId(nextSelectedId ?? batchData[0]?.id ?? "");
      setForm((current) => ({
        ...current,
        recipe_id: current.recipe_id || (recipeIdParam && activeRecipes.some((recipe) => recipe.id === recipeIdParam) ? recipeIdParam : activeRecipes[0]?.id || ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createBatch() {
    setError("");
    setSuccess("");
    if (!form.recipe_id) {
      setError("Sélectionnez une fiche technique.");
      return;
    }
    if (Number.isNaN(Number(form.quantity_produced)) || Number(form.quantity_produced) <= 0) {
      setError("La quantité produite doit être positive.");
      return;
    }
    if (Number.isNaN(Number(form.shelf_life_hours)) || Number(form.shelf_life_hours) <= 0) {
      setError("La DLC automatique doit être définie en heures.");
      return;
    }
    if (Number(form.waste_quantity) > 0 && !form.waste_reason.trim()) {
      setError("Le motif de perte est obligatoire si une perte est saisie.");
      return;
    }
    setSaving(true);
    try {
      const batch = await apiRequest<ProductionBatch>("/production", {
        method: "POST",
        body: JSON.stringify({
          recipe_id: form.recipe_id,
          quantity_produced: form.quantity_produced,
          produced_at: new Date(form.produced_at).toISOString(),
          shelf_life_hours: Number(form.shelf_life_hours),
          label_count: Number(form.label_count),
          lot_number: form.lot_number || null,
          storage_area: form.storage_area || null,
          conservation_temperature: form.conservation_temperature || null,
          waste_quantity: form.waste_quantity,
          waste_reason: form.waste_reason || null,
          notes: form.notes || null,
        }),
      });
      setBatches((current) => [batch, ...current]);
      setSelectedId(batch.id);
      setSuccess("Production enregistrée. Stock, DLC et étiquettes générés.");
      setForm({ ...emptyForm, recipe_id: form.recipe_id, produced_at: nowLocal() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création production impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archiveBatch(batch: ProductionBatch) {
    if (!window.confirm(`Archiver le lot ${batch.lot_number} ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<ProductionBatch>(`/production/${batch.id}`, { method: "DELETE" });
      setSuccess("Lot archivé.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archivage impossible");
    } finally {
      setSaving(false);
    }
  }

  function printBatch() {
    window.print();
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-foreground/55">Productions journalières, traçabilité, DLC et étiquettes cuisine</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Production labo</h1>
          </div>
          <Button onClick={printBatch} variant="secondary"><Printer className="h-4 w-4" />Imprimer la production</Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Lots actifs" value={String(batches.filter((batch) => !batch.is_archived).length)} />
          <Metric label="Étiquettes générées" value={String(batches.reduce((sum, batch) => sum + batch.labels.length, 0))} />
          <Metric label="Pertes déclarées" value={String(batches.filter((batch) => Number(batch.waste_quantity) > 0).length)} />
          <Metric label="Traçabilité" value="Complète" />
        </section>

        <Card className="p-4">
          <h2 className="text-base font-semibold">Nouvelle production</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-sm xl:col-span-2">
              <span className="text-xs text-foreground/55">Fiche technique</span>
              <select className="h-10 rounded-md border border-border bg-background px-3 outline-none" value={form.recipe_id} onChange={(event) => setField("recipe_id", event.target.value)}>
                <option value="">Sélectionner</option>
                {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
              </select>
            </label>
            <Input label="Quantité produite" type="number" value={form.quantity_produced} onChange={(value) => setField("quantity_produced", value)} />
            <Input label="Nombre d'étiquettes" type="number" value={form.label_count} onChange={(value) => setField("label_count", value)} />
            <Input label="Date/heure production" type="datetime-local" value={form.produced_at} onChange={(value) => setField("produced_at", value)} />
            <Input label="DLC automatique (heures)" type="number" value={form.shelf_life_hours} onChange={(value) => setField("shelf_life_hours", value)} />
            <Input label="Lot" value={form.lot_number} onChange={(value) => setField("lot_number", value)} />
            <Input label="Zone de stockage" value={form.storage_area} onChange={(value) => setField("storage_area", value)} />
            <Input label="Température conservation" value={form.conservation_temperature} onChange={(value) => setField("conservation_temperature", value)} />
            <Input label="Perte" type="number" value={form.waste_quantity} onChange={(value) => setField("waste_quantity", value)} />
            <Input label="Motif perte" value={form.waste_reason} onChange={(value) => setField("waste_reason", value)} />
            <Input label="Commentaire" value={form.notes} onChange={(value) => setField("notes", value)} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">Consommations prévues</p>
              <div className="mt-3 space-y-2">
                {selectedRecipe && productionPreview.length === 0 ? <p className="text-sm text-foreground/55">La fiche doit contenir des ingrédients reliés au stock.</p> : null}
                {!selectedRecipe ? <p className="text-sm text-foreground/55">Sélectionnez une fiche technique pour voir les sorties stock prévues.</p> : null}
                {productionPreview.map((ingredient) => (
                  <div key={ingredient.id} className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-sm">
                    <span>{ingredient.name}</span>
                    <span className="font-medium">{ingredient.quantity} {ingredient.unit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">Calcul automatique</p>
              <div className="mt-3 space-y-2 text-sm">
                <PreviewLine label="Allergènes" value={selectedRecipe?.allergens.join(", ") || "aucun"} />
                <PreviewLine label="Coût matière fiche" value={selectedRecipe ? `${Number(selectedRecipe.food_cost).toFixed(2)} €` : "-"} />
                <PreviewLine label="DLC calculée" value={expiryPreview || "-"} />
                <PreviewLine label="Étiquettes" value={`${form.label_count || "0"} génération(s)`} />
              </div>
              <Button className="mt-4 w-full" onClick={createBatch} disabled={saving || !form.recipe_id}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lancer la production
              </Button>
            </div>
          </div>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div>
                <h2 className="text-base font-semibold">Historique des productions</h2>
                <p className="text-xs text-foreground/55">Lots, DLC, pertes, étiquettes et sorties stock.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Archivés
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des productions" /> : null}
              {!loading && batches.length === 0 ? <StateLine text="Aucune production enregistrée." loading={false} /> : null}
              {batches.map((batch) => (
                <div key={batch.id} className={cn("grid gap-3 px-4 py-4 sm:grid-cols-[1fr_140px_140px] sm:items-center", selectedBatch?.id === batch.id && "bg-muted")}>
                  <button className="flex min-w-0 gap-3 text-left" onClick={() => setSelectedId(batch.id)}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{batch.recipe_name}</p>
                      <p className="truncate text-xs text-foreground/55">Lot {batch.lot_number} - {new Date(batch.prepared_at).toLocaleString("fr-FR")}</p>
                    </div>
                  </button>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/70">{new Date(batch.expires_at).toLocaleDateString("fr-FR")}</span>
                  <div className="flex gap-2 sm:justify-end">
                    <span className="rounded-md bg-background px-2 py-2 text-xs">{batch.labels.length} étiquette(s)</span>
                    <Button variant="secondary" size="icon" aria-label="Archiver" disabled={saving || batch.is_archived} onClick={() => archiveBatch(batch)}><Archive className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 print:shadow-none">
            {selectedBatch ? (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold">{selectedBatch.recipe_name}</h2>
                    <p className="mt-1 text-sm text-foreground/55">Lot {selectedBatch.lot_number}</p>
                  </div>
                  <Button variant="secondary" className="print:hidden" onClick={printBatch}><Printer className="h-4 w-4" />Imprimer</Button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Metric label="Quantité" value={`${selectedBatch.quantity_produced} ${selectedBatch.unit}`} />
                  <Metric label="DLC" value={new Date(selectedBatch.expires_at).toLocaleString("fr-FR")} />
                  <Metric label="Coût total" value={`${Number(selectedBatch.total_ingredient_cost).toFixed(2)} €`} />
                  <Metric label="Coût unitaire" value={`${Number(selectedBatch.cost_per_unit).toFixed(2)} €`} />
                </div>
                <div className="mt-4 space-y-2 rounded-md bg-muted p-3 text-sm">
                  <PreviewLine label="Allergènes" value={selectedBatch.allergens.join(", ") || "aucun"} />
                  <PreviewLine label="Stockage" value={selectedBatch.storage_area || "-"} />
                  <PreviewLine label="Conservation" value={selectedBatch.conservation_temperature || "-"} />
                  <PreviewLine label="Pertes" value={Number(selectedBatch.waste_quantity) > 0 ? `${selectedBatch.waste_quantity} (${selectedBatch.waste_reason || "motif absent"})` : "aucune"} />
                </div>
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Traçabilité ingrédients</h3>
                  <div className="mt-2 space-y-2">
                    {selectedBatch.consumptions.map((item) => (
                      <div key={item.id} className="rounded-md bg-muted px-3 py-3 text-sm">
                        <p className="font-medium">{item.inventory_item_name}</p>
                        <p className="text-xs text-foreground/55">{item.quantity_consumed} {item.unit} sortis du stock - {Number(item.total_cost).toFixed(2)} €</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Étiquettes générées</h3>
                  <div className="mt-2 space-y-2">
                    {selectedBatch.labels.map((label) => (
                      <div key={label.id} className="rounded-md bg-muted px-3 py-3 text-sm">
                        <p className="font-medium">{label.title}</p>
                        <p className="text-xs text-foreground/55">Lot {label.batch_number || "-"} - DLC {new Date(label.expires_at).toLocaleString("fr-FR")}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 rounded-md border border-border p-3 text-sm text-foreground/65">
                  Historique HACCP et audit disponible via les journaux de production, les étiquettes et la tâche HACCP créée automatiquement pour ce lot.
                </div>
              </div>
            ) : <p className="text-sm text-foreground/55">Sélectionnez un lot pour afficher la traçabilité.</p>}
          </Card>
        </section>
      </div>
    </AppShell>
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
  return <div className="rounded-md bg-muted px-3 py-3"><p className="text-xs text-foreground/55">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>;
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return <p className="flex justify-between gap-3"><span className="text-foreground/55">{label}</span><span className="text-right font-medium">{value}</span></p>;
}

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{text}</div>;
}
