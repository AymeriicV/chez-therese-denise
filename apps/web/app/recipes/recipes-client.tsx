"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ChefHat, Loader2, Pencil, Plus, Save, Trash2, Utensils, X } from "lucide-react";
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
  unit_cost: string;
  waste_rate: string;
  total_cost: string;
  allergens: string[];
};

type Recipe = {
  id: string;
  name: string;
  category: string | null;
  portion_yield: string;
  selling_price: string;
  food_cost: string;
  cost_per_portion: string;
  recommended_price: string;
  margin_rate: string;
  allergens: string[];
  is_active: boolean;
  ingredients: RecipeIngredient[];
};

type StockOption = {
  id: string;
  name: string;
  category: string;
  unit: string;
  average_cost: string;
  allergens: string[];
  is_active: boolean;
};

type RecipeForm = {
  name: string;
  category: string;
  portion_yield: string;
  selling_price: string;
};

type IngredientForm = {
  inventory_item_id: string;
  quantity: string;
  unit: string;
};

const emptyRecipe: RecipeForm = { name: "", category: "", portion_yield: "1", selling_price: "0" };
const emptyIngredient: IngredientForm = { inventory_item_id: "", quantity: "1", unit: "" };

export function RecipesClient() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [stockItems, setStockItems] = useState<StockOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(emptyRecipe);
  const [ingredientForm, setIngredientForm] = useState<IngredientForm>(emptyIngredient);
  const [editingIngredientId, setEditingIngredientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0] ?? null;
  const selectedStockItem = stockItems.find((item) => item.id === ingredientForm.inventory_item_id) ?? null;
  const previewCost = selectedStockItem ? Number(ingredientForm.quantity || 0) * Number(selectedStockItem.average_cost || 0) : 0;

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const [recipeData, stockData] = await Promise.all([
        apiRequest<Recipe[]>("/recipes"),
        apiRequest<StockOption[]>("/inventory"),
      ]);
      setRecipes(recipeData);
      setStockItems(stockData.filter((item) => item.is_active));
      setSelectedId(selectId ?? recipeData[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function updateRecipeState(recipe: Recipe) {
    setRecipes((current) => current.map((entry) => (entry.id === recipe.id ? recipe : entry)));
    setSelectedId(recipe.id);
  }

  function setRecipeField(field: keyof RecipeForm, value: string) {
    setRecipeForm((current) => ({ ...current, [field]: value }));
  }

  function setIngredientField(field: keyof IngredientForm, value: string) {
    setIngredientForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "inventory_item_id") {
        next.unit = stockItems.find((item) => item.id === value)?.unit ?? current.unit;
      }
      return next;
    });
  }

  async function createRecipe() {
    setError("");
    setSuccess("");
    if (!recipeForm.name.trim()) {
      setError("Le nom de la fiche technique est obligatoire.");
      return;
    }
    if (Number.isNaN(Number(recipeForm.portion_yield)) || Number(recipeForm.portion_yield) <= 0 || Number.isNaN(Number(recipeForm.selling_price)) || Number(recipeForm.selling_price) < 0) {
      setError("Le nombre de portions et le prix de vente doivent être valides.");
      return;
    }
    setSaving(true);
    try {
      const recipe = await apiRequest<Recipe>("/recipes", {
        method: "POST",
        body: JSON.stringify({
          name: recipeForm.name.trim(),
          category: recipeForm.category.trim() || null,
          portion_yield: recipeForm.portion_yield,
          selling_price: recipeForm.selling_price,
        }),
      });
      setRecipes((current) => [recipe, ...current]);
      setSelectedId(recipe.id);
      setRecipeForm(emptyRecipe);
      setCreating(false);
      setSuccess("Fiche technique créée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création fiche technique impossible");
    } finally {
      setSaving(false);
    }
  }

  async function saveIngredient() {
    if (!selected) return;
    setError("");
    setSuccess("");
    if (!ingredientForm.inventory_item_id) {
      setError("Sélectionnez un article stock.");
      return;
    }
    if (Number.isNaN(Number(ingredientForm.quantity)) || Number(ingredientForm.quantity) <= 0) {
      setError("La quantité doit être un nombre positif.");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        inventory_item_id: ingredientForm.inventory_item_id,
        quantity: ingredientForm.quantity,
        unit: ingredientForm.unit || selectedStockItem?.unit || "kg",
      });
      const recipe = await apiRequest<Recipe>(
        editingIngredientId ? `/recipes/${selected.id}/ingredients/${editingIngredientId}` : `/recipes/${selected.id}/ingredients`,
        { method: editingIngredientId ? "PATCH" : "POST", body },
      );
      updateRecipeState(recipe);
      setIngredientForm(emptyIngredient);
      setEditingIngredientId("");
      setSuccess(editingIngredientId ? "Ingrédient mis à jour." : "Ingrédient ajouté.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde ingrédient impossible");
    } finally {
      setSaving(false);
    }
  }

  function startIngredientEdit(ingredient: RecipeIngredient) {
    setEditingIngredientId(ingredient.id);
    setIngredientForm({
      inventory_item_id: ingredient.inventory_item_id ?? "",
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    });
    setSuccess("");
  }

  async function deleteIngredient(ingredient: RecipeIngredient) {
    if (!selected) return;
    if (!window.confirm(`Supprimer l'ingrédient "${ingredient.name}" ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const recipe = await apiRequest<Recipe>(`/recipes/${selected.id}/ingredients/${ingredient.id}`, { method: "DELETE" });
      updateRecipeState(recipe);
      setSuccess("Ingrédient supprimé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression ingrédient impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archiveRecipe(recipe: Recipe) {
    if (!window.confirm(`Archiver la fiche technique "${recipe.name}" ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<void>(`/recipes/${recipe.id}`, { method: "DELETE" });
      setRecipes((current) => current.filter((entry) => entry.id !== recipe.id));
      setSelectedId((current) => (current === recipe.id ? "" : current));
      setSuccess("Fiche technique archivée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archivage fiche technique impossible");
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
            <p className="text-sm text-foreground/55">Fiches techniques, coûts et allergènes</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Fiches techniques</h1>
          </div>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Fiche</Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        {creating ? (
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_140px_auto]">
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={recipeForm.name} onChange={(event) => setRecipeField("name", event.target.value)} placeholder="Nom" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={recipeForm.category} onChange={(event) => setRecipeField("category", event.target.value)} placeholder="Catégorie" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={recipeForm.portion_yield} onChange={(event) => setRecipeField("portion_yield", event.target.value)} placeholder="Portions" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={recipeForm.selling_price} onChange={(event) => setRecipeField("selling_price", event.target.value)} placeholder="Prix de vente" />
              <div className="flex gap-2">
                <Button variant="secondary" size="icon" aria-label="Annuler" onClick={() => setCreating(false)}><X className="h-4 w-4" /></Button>
                <Button disabled={saving} onClick={createRecipe}><Save className="h-4 w-4" />Créer</Button>
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3"><h2 className="text-base font-semibold">Fiches</h2></div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des fiches techniques" loading /> : null}
              {!loading && recipes.length === 0 ? <StateLine text="Aucune fiche technique" /> : null}
              {recipes.map((recipe) => (
                <button key={recipe.id} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted", selected?.id === recipe.id && "bg-muted")} onClick={() => setSelectedId(recipe.id)}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline"><ChefHat className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{recipe.name}</p>
                    <p className="truncate text-xs text-foreground/55">{recipe.category ?? "Sans catégorie"} - {recipe.ingredients.length} ingrédient(s)</p>
                  </div>
                  <Metric label="Coût" value={`${Number(recipe.food_cost || 0).toFixed(2)} EUR`} />
                </button>
              ))}
            </div>
          </Card>

          {selected ? (
            <div className="grid gap-4">
              <Card className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground/55">{selected.category ?? "Sans catégorie"}</p>
                    <h2 className="mt-1 truncate text-2xl font-semibold">{selected.name}</h2>
                    <p className="mt-2 text-sm text-foreground/60">{selected.allergens.join(", ") || "Aucun allergène consolidé"}</p>
                  </div>
                  <Button variant="secondary" disabled={saving} onClick={() => archiveRecipe(selected)}><Archive className="h-4 w-4" />Archiver</Button>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-4">
                  <Metric label="Coût matière" value={`${Number(selected.food_cost || 0).toFixed(2)} EUR`} />
                  <Metric label="Coût portion" value={`${Number(selected.cost_per_portion || 0).toFixed(2)} EUR`} />
                  <Metric label="Prix vente" value={`${Number(selected.selling_price || 0).toFixed(2)} EUR`} />
                  <Metric label="Marge" value={`${Math.round(Number(selected.margin_rate || 0) * 100)}%`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Utensils className="h-4 w-4" />
                  <h3 className="text-base font-semibold">{editingIngredientId ? "Modifier l'ingrédient" : "Ajouter un ingrédient"}</h3>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_120px_140px_auto]">
                  <select className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={ingredientForm.inventory_item_id} onChange={(event) => setIngredientField("inventory_item_id", event.target.value)}>
                    <option value="">Article stock</option>
                    {stockItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.name} - {item.unit} - {Number(item.average_cost || 0).toFixed(2)} EUR</option>
                    ))}
                  </select>
                  <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={ingredientForm.quantity} onChange={(event) => setIngredientField("quantity", event.target.value)} placeholder="Quantité" />
                  <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={ingredientForm.unit} onChange={(event) => setIngredientField("unit", event.target.value)} placeholder="Unité" />
                  <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    <p className="text-xs text-foreground/55">Coût ligne</p>
                    <p className="font-semibold">{previewCost.toFixed(2)} EUR</p>
                  </div>
                  <div className="flex gap-2">
                    {editingIngredientId ? <Button variant="secondary" size="icon" aria-label="Annuler" onClick={() => { setEditingIngredientId(""); setIngredientForm(emptyIngredient); }}><X className="h-4 w-4" /></Button> : null}
                    <Button disabled={saving || !ingredientForm.inventory_item_id} onClick={saveIngredient}><Save className="h-4 w-4" />{editingIngredientId ? "Modifier" : "Ajouter"}</Button>
                  </div>
                </div>
                {selectedStockItem ? <p className="mt-2 text-xs text-foreground/55">Allergènes repris: {selectedStockItem.allergens.join(", ") || "aucun"}</p> : null}
              </Card>

              <Card className="overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_90px_84px] gap-2 border-b border-border bg-muted px-3 py-2 text-xs text-foreground/55 sm:grid-cols-[1fr_90px_110px_110px_150px]">
                  <span>Ingrédient</span><span>Qté</span><span>Coût unit.</span><span>Total</span><span className="hidden sm:block">Actions</span>
                </div>
                {selected.ingredients.length === 0 ? <p className="px-3 py-4 text-sm text-foreground/55">Aucun ingrédient dans cette fiche.</p> : null}
                {selected.ingredients.map((ingredient) => (
                  <div key={ingredient.id} className="grid grid-cols-[1fr_80px_90px_84px] gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_90px_110px_110px_150px] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ingredient.name}</p>
                      <p className="truncate text-xs text-foreground/55">{ingredient.allergens.join(", ") || "Sans allergène"}</p>
                    </div>
                    <span>{Number(ingredient.quantity).toFixed(3)} {ingredient.unit}</span>
                    <span>{Number(ingredient.unit_cost).toFixed(2)} EUR</span>
                    <span>{Number(ingredient.total_cost).toFixed(2)} EUR</span>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="icon" aria-label="Modifier" disabled={saving} onClick={() => startIngredientEdit(ingredient)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="secondary" size="icon" aria-label="Supprimer" disabled={saving} onClick={() => deleteIngredient(ingredient)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          ) : (
            <Card className="p-5"><p className="text-sm text-foreground/55">Créez une fiche technique pour commencer.</p></Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function StateLine({ text, loading = false }: { text: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {text}
    </div>
  );
}
