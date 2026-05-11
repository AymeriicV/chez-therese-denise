"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChefHat, GripVertical, ImagePlus, Loader2, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiBlob, apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type RecipeIngredient = {
  id: string;
  inventory_item_id: string | null;
  sub_recipe_id: string | null;
  name: string;
  quantity: string;
  unit: string;
  unit_cost: string;
  waste_rate: string;
  total_cost: string;
  sort_order: number;
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
  updated_at: string;
  photo_name: string | null;
  photo_mime_type: string | null;
  photo_path: string | null;
  photo_url: string | null;
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

type SubRecipeOption = {
  id: string;
  name: string;
  category: string | null;
  batch_unit: string;
  cost_per_unit: string;
  allergens: string[];
  is_active: boolean;
  ingredient_count: number;
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
  const [subRecipes, setSubRecipes] = useState<SubRecipeOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(emptyRecipe);
  const [ingredientForm, setIngredientForm] = useState<IngredientForm>(emptyIngredient);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [sourceMode, setSourceMode] = useState<"stock" | "subrecipes">("stock");
  const [categoryFilter, setCategoryFilter] = useState("Toutes");
  const [editingIngredientId, setEditingIngredientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [draggingIngredientId, setDraggingIngredientId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const deferredIngredientSearch = useDeferredValue(ingredientSearch);

  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0] ?? null;
  const selectedStockItem = stockItems.find((item) => item.id === ingredientForm.inventory_item_id) ?? null;
  const selectedSubRecipeItem = subRecipes.find((item) => item.id === ingredientForm.inventory_item_id) ?? null;
  const selectedIngredientOption = selectedStockItem ?? selectedSubRecipeItem ?? null;
  const filteredIngredientItems = useMemo(() => {
    const query = deferredIngredientSearch.trim().toLowerCase();
    if (!query) {
      return [];
    }
    if (sourceMode === "stock") {
      return stockItems
        .filter((item) => item.is_active)
        .filter((item) => `${item.name} ${item.category} ${item.unit} ${item.allergens.join(" ")}`.toLowerCase().includes(query))
        .slice(0, 8);
    }
    return subRecipes
      .filter((item) => item.is_active)
      .filter((item) => `${item.name} ${item.category ?? ""} ${item.batch_unit} ${item.allergens.join(" ")}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [deferredIngredientSearch, sourceMode, stockItems, subRecipes]);
  const previewCost = selectedStockItem
    ? Number(ingredientForm.quantity || 0) * Number(selectedStockItem.average_cost || 0)
    : selectedSubRecipeItem
      ? Number(ingredientForm.quantity || 0) * Number(selectedSubRecipeItem.cost_per_unit || 0)
      : 0;
  const visibleRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const recipeCategory = recipe.category ?? "Sans catégorie";
      const matchesQuery = !query || `${recipe.name} ${recipeCategory} ${recipe.allergens.join(" ")}`.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "Toutes" || recipeCategory === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [categoryFilter, recipeSearch, recipes]);
  const categories = useMemo(
    () => ["Toutes", ...Array.from(new Set(recipes.map((recipe) => recipe.category?.trim()).filter(Boolean) as string[]))],
    [recipes],
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    let active = true;
    let currentUrl: string | null = null;
    async function loadPhoto() {
      if (!selected?.photo_url) {
        setPhotoPreviewUrl(null);
        return;
      }
      try {
        const blob = await apiBlob(selected.photo_url);
        if (!active) return;
        currentUrl = URL.createObjectURL(blob);
        setPhotoPreviewUrl(currentUrl);
      } catch {
        if (active) {
          setPhotoPreviewUrl(null);
        }
      }
    }
    void loadPhoto();
    return () => {
      active = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [selected?.id, selected?.photo_url]);

  async function loadData(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const [recipeData, stockData, subRecipeData] = await Promise.all([
        apiRequest<Recipe[]>("/recipes"),
        apiRequest<StockOption[]>("/inventory"),
        apiRequest<SubRecipeOption[]>("/recipes/sub-recipes"),
      ]);
      setRecipes(recipeData);
      setStockItems(stockData.filter((item) => item.is_active));
      setSubRecipes(subRecipeData.filter((item) => item.is_active));
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
        const subRecipe = subRecipes.find((item) => item.id === value);
        if (subRecipe) {
          next.unit = subRecipe.batch_unit;
        }
      }
      return next;
    });
  }

  function applyIngredientOption(option: StockOption | SubRecipeOption) {
    if ("average_cost" in option) {
      setSourceMode("stock");
    } else {
      setSourceMode("subrecipes");
    }
    setIngredientForm((current) => ({
      ...current,
      inventory_item_id: option.id,
      unit: "average_cost" in option ? option.unit : option.batch_unit,
    }));
    setIngredientSearch(option.name);
  }

  function clearIngredientEditor() {
    setEditingIngredientId("");
    setIngredientForm(emptyIngredient);
    setIngredientSearch("");
    setSourceMode("stock");
  }

  async function reorderRecipeIngredients(orderedIds: string[]) {
    if (!selected) return;
    if (orderedIds.length === 0) return;
    const recipe = await apiRequest<Recipe>(`/recipes/${selected.id}/ingredients/reorder`, {
      method: "POST",
      body: JSON.stringify({ ingredient_ids: orderedIds }),
    });
    updateRecipeState(recipe);
  }

  function moveIngredient(sourceId: string, targetId: string) {
    if (!selected || sourceId === targetId) return;
    const orderedIds = selected.ingredients.map((ingredient) => ingredient.id);
    const fromIndex = orderedIds.indexOf(sourceId);
    const toIndex = orderedIds.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, sourceId);
    setSaving(true);
    setError("");
    setSuccess("");
    void reorderRecipeIngredients(orderedIds)
      .then(() => setSuccess("Ordre des ingrédients mis à jour."))
      .catch((err) => setError(err instanceof Error ? err.message : "Réorganisation impossible"))
      .finally(() => setSaving(false));
  }

  async function uploadRecipePhoto(file: File) {
    if (!selected) return;
    setPhotoUploading(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const recipe = await apiRequest<Recipe>(`/recipes/${selected.id}/photo`, {
        method: "POST",
        body: formData,
      });
      updateRecipeState(recipe);
      setSuccess("Photo recette enregistrée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload photo impossible");
    } finally {
      setPhotoUploading(false);
    }
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

  async function saveIngredient(option: StockOption | SubRecipeOption | null = selectedIngredientOption) {
    if (!selected) return;
    setError("");
    setSuccess("");
    const targetOption = option ?? selectedIngredientOption;
    if (!targetOption) {
      setError("Sélectionnez un article stock.");
      return;
    }
    if (Number.isNaN(Number(ingredientForm.quantity)) || Number(ingredientForm.quantity) <= 0) {
      setError("La quantité doit être un nombre positif.");
      return;
    }
    setSaving(true);
    try {
      const isStock = "average_cost" in targetOption;
      const resolvedUnit = ingredientForm.unit || (isStock ? targetOption.unit : targetOption.batch_unit) || "kg";
      const body = JSON.stringify({
        inventory_item_id: isStock ? targetOption.id : null,
        sub_recipe_id: isStock ? null : targetOption.id,
        quantity: ingredientForm.quantity,
        unit: resolvedUnit,
      });
      const recipe = await apiRequest<Recipe>(
        editingIngredientId ? `/recipes/${selected.id}/ingredients/${editingIngredientId}` : `/recipes/${selected.id}/ingredients`,
        { method: editingIngredientId ? "PATCH" : "POST", body },
      );
      updateRecipeState(recipe);
      clearIngredientEditor();
      setSuccess(editingIngredientId ? "Ingrédient mis à jour." : "Ingrédient ajouté.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde ingrédient impossible");
    } finally {
      setSaving(false);
    }
  }

  function startIngredientEdit(ingredient: RecipeIngredient) {
    setEditingIngredientId(ingredient.id);
    const selectedItem = stockItems.find((item) => item.id === ingredient.inventory_item_id) ?? null;
    const selectedSubRecipe = subRecipes.find((item) => item.id === ingredient.sub_recipe_id) ?? null;
    setSourceMode(selectedSubRecipe ? "subrecipes" : "stock");
    setIngredientForm({
      inventory_item_id: ingredient.inventory_item_id ?? "",
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    });
    setIngredientSearch(selectedItem?.name ?? selectedSubRecipe?.name ?? ingredient.name);
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
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-foreground/55">Fiches techniques, coûts, allergènes et sous-recettes</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Fiches techniques</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Nouvelle fiche
            </Button>
            <Button variant="secondary" onClick={() => photoInputRef.current?.click()} disabled={!selected || photoUploading}>
              <ImagePlus className="h-4 w-4" />
              Photo recette
            </Button>
          </div>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        {creating ? (
          <Card className="p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_120px_140px_auto]">
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={recipeForm.name} onChange={(event) => setRecipeField("name", event.target.value)} placeholder="Nom de la fiche" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={recipeForm.category} onChange={(event) => setRecipeField("category", event.target.value)} placeholder="Catégorie" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={recipeForm.portion_yield} onChange={(event) => setRecipeField("portion_yield", event.target.value)} placeholder="Portions" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={recipeForm.selling_price} onChange={(event) => setRecipeField("selling_price", event.target.value)} placeholder="Prix vente" />
              <div className="flex gap-2">
                <Button variant="secondary" size="icon" aria-label="Annuler" onClick={() => setCreating(false)}>
                  <X className="h-4 w-4" />
                </Button>
                <Button disabled={saving} onClick={createRecipe}>
                  <Save className="h-4 w-4" />
                  Créer
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)_460px]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Bibliothèque</p>
                  <h2 className="text-base font-semibold">Recettes</h2>
                </div>
                <div className="rounded-full bg-muted px-2 py-1 text-xs text-foreground/60">{visibleRecipes.length}</div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background px-3">
                <Search className="h-4 w-4 text-foreground/45" />
                <input
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  value={recipeSearch}
                  onChange={(event) => setRecipeSearch(event.target.value)}
                  placeholder="Rechercher une recette..."
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCategoryFilter(category)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      categoryFilter === category ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground/60 hover:bg-muted",
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? <StateLine text="Chargement des fiches techniques" loading /> : null}
              {!loading && visibleRecipes.length === 0 ? <StateLine text="Aucune fiche technique" /> : null}
              <div className="divide-y divide-border">
                {visibleRecipes.map((recipe) => {
                  const marginPercent = Math.round(Number(recipe.margin_rate || 0) * 100);
                  return (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => setSelectedId(recipe.id)}
                      className={cn("flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-muted", selected?.id === recipe.id && "bg-muted")}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline">
                        <ChefHat className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{recipe.name}</p>
                            <p className="truncate text-xs text-foreground/55">{recipe.category ?? "Sans catégorie"}</p>
                          </div>
                          <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", marginPercent < 20 ? "bg-red-100 text-red-700" : marginPercent < 35 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                            {marginPercent < 20 ? "Marge" : marginPercent < 35 ? "À surveiller" : "Rentable"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-foreground/55">
                          <span>{recipe.ingredients.length} ingrédient(s)</span>
                          <span>•</span>
                          <span>{Number(recipe.food_cost || 0).toFixed(2)} EUR</span>
                          <span>•</span>
                          <span>{recipe.allergens.length ? recipe.allergens.join(", ") : "Sans allergène"}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {selected ? (
            <>
              <div className="grid gap-4">
                <Card className="overflow-hidden">
                  <div className="grid gap-4 p-5 lg:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadRecipePhoto(file);
                          }
                          event.target.value = "";
                        }}
                      />
                      <div
                        className="group relative aspect-[4/3] overflow-hidden rounded-md border border-dashed border-border bg-muted/40"
                        onClick={() => photoInputRef.current?.click()}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const file = event.dataTransfer.files?.[0];
                          if (file) {
                            void uploadRecipePhoto(file);
                          }
                        }}
                      >
                        {photoPreviewUrl ? (
                          <img src={photoPreviewUrl} alt={selected.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center p-6 text-center text-sm text-foreground/55">
                            <div>
                              <Sparkles className="mx-auto mb-3 h-5 w-5" />
                              <p>Ajouter une photo recette</p>
                              <p className="mt-1 text-xs">Cliquez ou glissez une image JPG, PNG ou WEBP</p>
                            </div>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-3 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {photoUploading ? "Upload en cours..." : "Cliquez pour importer une photo"}
                        </div>
                      </div>
                      {selected.photo_name ? <p className="text-xs text-foreground/55">Photo: {selected.photo_name}</p> : null}
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-foreground/55">{selected.category ?? "Sans catégorie"}</p>
                          <h2 className="mt-1 truncate text-2xl font-semibold">{selected.name}</h2>
                          <p className="mt-2 text-sm text-foreground/60">
                            Modifié le {new Date(selected.updated_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                        </div>
                        <Button variant="secondary" disabled={saving} onClick={() => archiveRecipe(selected)}>
                          <Archive className="h-4 w-4" />
                          Archiver
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selected.is_active ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Actif</span> : <span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground/55">Archivé</span>}
                        <span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground/55">{selected.portion_yield} portion(s)</span>
                        <span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground/55">{selected.ingredients.length} ligne(s)</span>
                        <span className={cn("rounded-full px-2 py-1 text-xs", selected.allergens.length ? "bg-amber-100 text-amber-700" : "bg-muted text-foreground/55")}>
                          {selected.allergens.length ? selected.allergens.join(", ") : "Sans allergène"}
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <Kpi label="Coût matière" value={`${Number(selected.food_cost || 0).toFixed(2)} EUR`} />
                        <Kpi label="Coût portion" value={`${Number(selected.cost_per_portion || 0).toFixed(2)} EUR`} />
                        <Kpi label="Prix de vente" value={`${Number(selected.selling_price || 0).toFixed(2)} EUR`} />
                        <Kpi label="Prix conseillé" value={`${Number(selected.recommended_price || 0).toFixed(2)} EUR`} />
                        <Kpi label="Marge" value={`${Math.round(Number(selected.margin_rate || 0) * 100)} %`} />
                        <Kpi label="Food cost" value={`${selected.selling_price && Number(selected.selling_price) > 0 ? Math.round((Number(selected.food_cost || 0) / Number(selected.selling_price)) * 100) : 0} %`} />
                      </div>

                      <div className="rounded-md border border-border bg-background p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Lecture marge</p>
                            <h3 className="text-sm font-semibold">Santé économique de la fiche</h3>
                          </div>
                          <span className={cn("rounded-full px-2 py-1 text-xs font-medium", Number(selected.margin_rate || 0) < 0.2 ? "bg-red-100 text-red-700" : Number(selected.margin_rate || 0) < 0.35 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                            {Number(selected.margin_rate || 0) < 0.2 ? "Marge dangereuse" : Number(selected.margin_rate || 0) < 0.35 ? "Faible marge" : "Rentable"}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground transition-all"
                            style={{ width: `${Math.min(Math.max(Number(selected.margin_rate || 0) * 100, 0), 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Détails métier</p>
                      <h3 className="text-base font-semibold">Portions, rendement, pertes et coûts</h3>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Kpi label="Portions" value={selected.portion_yield} />
                    <Kpi label="Rendement" value={`${selected.portion_yield} portions / fiche`} />
                    <Kpi label="Pertes %" value={`${Math.round(selected.ingredients.length ? Number(selected.ingredients.reduce((sum, ingredient) => sum + Number(ingredient.waste_rate || 0), 0)) / selected.ingredients.length : 0)} %`} />
                    <Kpi label="Dernière modification" value={new Date(selected.updated_at).toLocaleDateString("fr-FR")} />
                  </div>
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-border p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Composition</p>
                        <h3 className="text-base font-semibold">Ingrédients intelligents</h3>
                      </div>
                      <div className="flex gap-2">
                        <Button variant={sourceMode === "stock" ? "primary" : "secondary"} onClick={() => setSourceMode("stock")}>
                          Articles stock
                        </Button>
                        <Button variant={sourceMode === "subrecipes" ? "primary" : "secondary"} onClick={() => setSourceMode("subrecipes")}>
                          Sous-recettes
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_110px_110px_120px_auto]">
                      <div className="grid gap-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-xs text-foreground/55">Recherche rapide</span>
                          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3">
                            <Search className="h-4 w-4 text-foreground/45" />
                            <input
                              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                              value={ingredientSearch}
                              onChange={(event) => {
                                setIngredientSearch(event.target.value);
                                setIngredientForm((current) => ({ ...current, inventory_item_id: "", unit: "" }));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && filteredIngredientItems[0]) {
                                  event.preventDefault();
                                  applyIngredientOption(filteredIngredientItems[0]);
                                  void saveIngredient(filteredIngredientItems[0]);
                                }
                              }}
                              placeholder={sourceMode === "stock" ? "Nom, catégorie, allergène..." : "Nom, catégorie, allergène..."}
                            />
                          </div>
                        </label>
                        {ingredientSearch.trim() ? (
                          <div className="max-h-44 overflow-auto rounded-md border border-border bg-background shadow-sm">
                            {filteredIngredientItems.length === 0 ? (
                              <p className="px-3 py-3 text-sm text-foreground/55">Aucun résultat.</p>
                            ) : (
                              filteredIngredientItems.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="flex w-full items-start justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                                  onClick={() => applyIngredientOption(item)}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{item.name}</p>
                                    <p className="truncate text-xs text-foreground/55">
                                      {"average_cost" in item
                                        ? `${item.category} · ${item.unit} · ${Number(item.average_cost || 0).toFixed(2)} EUR`
                                        : `${item.category ?? "Sans catégorie"} · ${item.batch_unit} · ${Number(item.cost_per_unit || 0).toFixed(2)} EUR`}
                                    </p>
                                  </div>
                                  <span className="text-xs text-foreground/55">{item.allergens.join(", ") || "Sans allergène"}</span>
                                </button>
                              ))
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-foreground/45">Tapez un mot pour afficher les suggestions.</p>
                        )}
                      </div>
                      <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={ingredientForm.quantity} onChange={(event) => setIngredientField("quantity", event.target.value)} placeholder="Quantité" />
                      <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={ingredientForm.unit} onChange={(event) => setIngredientField("unit", event.target.value)} placeholder="Unité" />
                      <div className="rounded-md bg-muted px-3 py-2 text-sm">
                        <p className="text-xs text-foreground/55">Coût ligne</p>
                        <p className="font-semibold">{previewCost.toFixed(2)} EUR</p>
                        <p className="text-xs text-foreground/55">{selectedIngredientOption ? selectedIngredientOption.allergens.join(", ") || "Sans allergène" : "Choisissez un article ou une sous-recette"}</p>
                      </div>
                      <div className="flex gap-2">
                        {editingIngredientId ? (
                          <Button
                            variant="secondary"
                            size="icon"
                            aria-label="Annuler"
                            onClick={() => {
                              clearIngredientEditor();
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button disabled={saving || !selectedIngredientOption} onClick={() => void saveIngredient()}>
                          <Save className="h-4 w-4" />
                          {editingIngredientId ? "Modifier" : "Ajouter"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden border-b border-border bg-muted px-4 py-2 text-xs uppercase tracking-[0.16em] text-foreground/55 lg:grid lg:grid-cols-[28px_1fr_100px_110px_110px_160px] lg:gap-3">
                  <span />
                  <span>Ingrédient</span>
                  <span>Qté</span>
                  <span>Coût unit.</span>
                  <span>Total</span>
                  <span>Actions</span>
                </div>
                <div className="divide-y divide-border">
                  {selected.ingredients.length === 0 ? <p className="px-4 py-6 text-sm text-foreground/55">Aucun ingrédient dans cette fiche.</p> : null}
                  {selected.ingredients.map((ingredient, index) => (
                    <div
                      key={ingredient.id}
                      draggable
                      onDragStart={() => setDraggingIngredientId(ingredient.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggingIngredientId) {
                          moveIngredient(draggingIngredientId, ingredient.id);
                          setDraggingIngredientId(null);
                        }
                      }}
                      className={cn("grid gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40", draggingIngredientId === ingredient.id && "bg-muted/70", "lg:grid-cols-[28px_1fr_100px_110px_110px_160px] lg:items-center")}
                    >
                      <div className="flex items-center gap-2 text-foreground/45">
                        <GripVertical className="h-4 w-4" />
                        <span className="text-xs">{index + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{ingredient.name}</p>
                        <p className="truncate text-xs text-foreground/55">{ingredient.allergens.join(", ") || "Sans allergène"}</p>
                      </div>
                      <span className="lg:text-right">
                        {Number(ingredient.quantity).toFixed(3)} {ingredient.unit}
                      </span>
                      <span className="lg:text-right">{Number(ingredient.unit_cost).toFixed(2)} EUR</span>
                      <span className="lg:text-right font-medium">{Number(ingredient.total_cost).toFixed(2)} EUR</span>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="icon" aria-label="Modifier" disabled={saving} onClick={() => startIngredientEdit(ingredient)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="secondary" size="icon" aria-label="Supprimer" disabled={saving} onClick={() => deleteIngredient(ingredient)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-5">
              <p className="text-sm text-foreground/55">Créez une fiche technique pour commencer.</p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
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
