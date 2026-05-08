"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StockItem = {
  id: string;
  name: string;
  category: string;
  supplier: string;
  storageArea: string;
  unit: string;
  quantity: number;
  reorderPoint: number;
  averageCost: number;
  movementCount: number;
};

const seedItems: StockItem[] = [
  {
    id: "stk_001",
    name: "Filet de bar",
    category: "Poisson",
    supplier: "Poissonnerie Atlantique",
    storageArea: "Froid positif",
    unit: "kg",
    quantity: 2.4,
    reorderPoint: 4,
    averageCost: 24.8,
    movementCount: 18,
  },
  {
    id: "stk_002",
    name: "Creme crue",
    category: "Cremerie",
    supplier: "Metro",
    storageArea: "Froid positif",
    unit: "l",
    quantity: 11,
    reorderPoint: 8,
    averageCost: 7.45,
    movementCount: 24,
  },
  {
    id: "stk_003",
    name: "Asperges vertes",
    category: "Legumes",
    supplier: "Primeurs Denise",
    storageArea: "Reserve jour",
    unit: "kg",
    quantity: 3.1,
    reorderPoint: 3,
    averageCost: 12.3,
    movementCount: 9,
  },
];

export function StockClient() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(seedItems);
  const filtered = useMemo(
    () => items.filter((item) => `${item.name} ${item.category} ${item.supplier}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );
  const stockValue = items.reduce((total, item) => total + item.quantity * item.averageCost, 0);
  const alerts = items.filter((item) => item.quantity <= item.reorderPoint);

  function move(itemId: string, quantity: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, quantity: Math.max(0, Number((item.quantity + quantity).toFixed(3))), movementCount: item.movementCount + 1 }
          : item,
      ),
    );
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
          <Button>
            <Plus className="h-4 w-4" />
            Article
          </Button>
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <Metric label="Valeur stock" value={`${Math.round(stockValue).toLocaleString("fr-FR")} EUR`} />
          <Metric label="Articles" value={String(items.length)} />
          <Metric label="Alertes" value={String(alerts.length)} />
          <Metric label="Mouvements" value={String(items.reduce((total, item) => total + item.movementCount, 0))} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="flex h-10 items-center gap-2 rounded-md bg-muted px-3">
                <Search className="h-4 w-4 text-foreground/45" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher un article"
                />
              </div>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((item) => {
                const alert = item.quantity <= item.reorderPoint;
                return (
                  <div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_150px_116px] sm:items-center">
                    <div className="flex min-w-0 gap-3">
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", alert && "bg-foreground text-background")}>
                        {alert ? <AlertTriangle className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-foreground/55">
                          {item.category} - {item.supplier} - {item.storageArea}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {item.quantity} {item.unit}
                      </p>
                      <p className="text-xs text-foreground/55">Seuil {item.reorderPoint} {item.unit}</p>
                    </div>
                    <div className="flex gap-2 sm:justify-end">
                      <Button variant="secondary" size="icon" aria-label="Sortie stock" onClick={() => move(item.id, -1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="secondary" size="icon" aria-label="Entree stock" onClick={() => move(item.id, 1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Alertes rupture</h2>
                <p className="text-sm text-foreground/55">{alerts.length} article(s) sous seuil</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {alerts.map((item) => (
                <div key={item.id} className="rounded-md bg-muted px-3 py-3">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-foreground/55">
                    Commander chez {item.supplier}. Stock {item.quantity} {item.unit}, seuil {item.reorderPoint} {item.unit}.
                  </p>
                </div>
              ))}
              {alerts.length === 0 ? <p className="text-sm text-foreground/55">Aucune alerte active.</p> : null}
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
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
