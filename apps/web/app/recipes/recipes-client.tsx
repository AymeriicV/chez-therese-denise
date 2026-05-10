"use client";

import { useEffect, useState } from "react";
import { ChefHat, Loader2, Plus, Save, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";

type Recipe = {
  id: string;
  name: string;
  category: string | null;
  portion_yield: string;
  selling_price: string;
  food_cost: string;
  margin_rate: string;
  allergens: string[];
};

export function RecipesClient() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [portionYield, setPortionYield] = useState("1");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadRecipes();
  }, []);

  async function loadRecipes() {
    setLoading(true);
    setError("");
    try {
      setRecipes(await apiRequest<Recipe[]>("/recipes"));
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  async function createRecipe() {
    setError("");
    if (!name.trim()) {
      setError("Le nom de recette est obligatoire.");
      return;
    }
    if (Number.isNaN(Number(portionYield)) || Number(portionYield) <= 0 || Number.isNaN(Number(sellingPrice)) || Number(sellingPrice) < 0) {
      setError("Rendement et prix doivent etre des nombres valides.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest<Recipe>("/recipes", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim() || null,
          portion_yield: portionYield,
          selling_price: sellingPrice,
        }),
      });
      setName("");
      setCategory("");
      setPortionYield("1");
      setSellingPrice("0");
      setCreating(false);
      await loadRecipes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation recette impossible");
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
            <p className="text-sm text-foreground/55">Fiches techniques et couts</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Recettes</h1>
          </div>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Recette</Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}

        {creating ? (
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_120px_auto]">
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Categorie" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={portionYield} onChange={(event) => setPortionYield(event.target.value)} />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} />
              <div className="flex gap-2">
                <Button variant="secondary" size="icon" aria-label="Annuler" onClick={() => setCreating(false)}><X className="h-4 w-4" /></Button>
                <Button disabled={saving} onClick={createRecipe}><Save className="h-4 w-4" />Creer</Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {loading ? <StateLine text="Chargement recettes" loading /> : null}
            {!loading && recipes.length === 0 ? <StateLine text="Aucune recette" /> : null}
            {recipes.map((recipe) => (
              <div key={recipe.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_120px_120px_120px] sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"><ChefHat className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{recipe.name}</p>
                    <p className="truncate text-xs text-foreground/55">{recipe.category ?? "Sans categorie"} - {recipe.allergens.join(", ") || "Sans allergene"}</p>
                  </div>
                </div>
                <Metric label="Portions" value={recipe.portion_yield} />
                <Metric label="Cout" value={`${recipe.food_cost} EUR`} />
                <Metric label="Prix" value={`${recipe.selling_price} EUR`} />
              </div>
            ))}
          </div>
        </Card>
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
