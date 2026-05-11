"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, BadgeCheck, BarChart3, Clock3, TrendingUp, Truck, Utensils } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type AnalyticsOverview = {
  restaurant: { name: string };
  purchases_by_month: Array<{ label: string; value: string }>;
  supplier_spend: Array<{ id: string; name: string; amount: string; count: number }>;
  price_variations: Array<{
    inventory_item_name: string | null;
    supplier_name: string | null;
    previous_unit_price: string;
    current_unit_price: string;
    variation_percent: string;
  }>;
  price_alerts: Array<{
    id: string;
    supplier_name: string | null;
    inventory_item_name: string | null;
    invoice_number: string | null;
    previous_unit_price: string;
    new_unit_price: string;
    variation_percent: string;
    status: string;
    message: string | null;
  }>;
  recipe_profitability: Array<{
    id: string;
    name: string;
    category: string | null;
    food_cost: string;
    cost_per_portion: string;
    selling_price: string;
    margin_rate: string;
    allergens: string[];
  }>;
  production_by_period: Array<{ label: string; productions: number; quantity: string; cost: string }>;
  stock_consumption_by_period: Array<{ label: string; purchase: string; production: string; waste: string; adjustment: string }>;
  team_time: { planned_minutes: number; actual_minutes: number; difference_minutes: number };
  haccp: { todo: number; non_compliant: number; done: number; compliance_rate: number };
  invoices_by_supplier: Array<{ supplier_id: string; supplier_name: string; amount: string; count: number }>;
};

export function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const overview = await apiRequest<AnalyticsOverview>("/analytics/overview");
        if (mounted) setData(overview);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : authHint());
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const priceAlerts = useMemo(() => data?.price_alerts ?? [], [data]);

  async function markViewed(alertId: string) {
    const updated = await apiRequest<{ id: string; status: string }>(`/analytics/price-alerts/${alertId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "VIEWED" }),
    });
    setData((current) =>
      current
        ? {
            ...current,
            price_alerts: current.price_alerts.map((alert) => (alert.id === updated.id ? { ...alert, status: updated.status } : alert)),
          }
        : current,
    );
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-foreground/55">Analyse décisionnelle</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Analyses</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground/60">
              Les données ci-dessous sont calculées à partir des factures, du stock, des productions, du planning et de l’HACCP.
            </p>
          </div>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {loading ? <div className="rounded-md border border-border bg-card p-5 text-sm text-foreground/60">Chargement des analyses...</div> : null}

        {data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Conformité HACCP" value={`${Math.round(data.haccp.compliance_rate * 100)} %`} icon={BadgeCheck} />
              <Metric label="Matière perdue" value={`${data.stock_consumption_by_period.reduce((sum, row) => sum + Number(row.waste || 0), 0).toFixed(0)} unités`} icon={AlertTriangle} />
              <Metric label="Heures prévues" value={`${Math.round(data.team_time.planned_minutes / 60)} h`} icon={Clock3} />
              <Metric label="Heures pointées" value={`${Math.round(data.team_time.actual_minutes / 60)} h`} icon={Clock3} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Achats</p>
                    <h2 className="text-base font-semibold">Évolution mensuelle</h2>
                  </div>
                  <BarChart3 className="h-4 w-4 text-foreground/45" />
                </div>
                <div className="mt-5 grid gap-3">
                  {data.purchases_by_month.map((row) => {
                    const value = Number(row.value || 0);
                    const maxValue = Math.max(...data.purchases_by_month.map((entry) => Number(entry.value || 0)), 1);
                    return (
                      <div key={row.label} className="grid gap-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground/55">{row.label}</span>
                          <span className="font-medium">{value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground" style={{ width: `${(value / maxValue) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">Alertes prix fournisseur</h2>
                <div className="mt-4 grid gap-2">
                  {priceAlerts.length === 0 ? <p className="text-sm text-foreground/55">Aucune alerte prix active.</p> : null}
                  {priceAlerts.map((alert) => (
                    <div key={alert.id} className={cn("rounded-md border px-3 py-3 text-sm", alert.status === "NEW" ? "border-red-200 bg-red-50" : "border-border bg-background")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{alert.inventory_item_name ?? "Article"} </p>
                          <p className="text-xs text-foreground/55">{alert.supplier_name ?? "-"} · {Number(alert.variation_percent || 0).toFixed(1)} %</p>
                          <p className="mt-1 text-xs text-foreground/55">{alert.message ?? ""}</p>
                        </div>
                        {alert.status === "NEW" ? (
                          <Button size="sm" variant="secondary" onClick={() => void markViewed(alert.id)}>
                            Vue
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="p-5">
                <h2 className="text-base font-semibold">Variations de prix par article</h2>
                <div className="mt-4 grid gap-2">
                  {data.price_variations.length === 0 ? <p className="text-sm text-foreground/55">Pas assez d’historique pour calculer des variations.</p> : null}
                  {data.price_variations.map((row) => (
                    <div key={`${row.inventory_item_name ?? "item"}-${row.supplier_name ?? ""}`} className="rounded-md bg-muted px-3 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{row.inventory_item_name ?? "Article"}</p>
                          <p className="text-xs text-foreground/55">{row.supplier_name ?? "Fournisseur"}</p>
                        </div>
                        <span className="rounded-full bg-background px-2 py-1 text-xs">{Number(row.variation_percent || 0).toFixed(1)} %</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">Food cost et marges</h2>
                <div className="mt-4 grid gap-2">
                  {data.recipe_profitability.slice(0, 8).map((recipe) => (
                    <div key={recipe.id} className="rounded-md border border-border px-3 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{recipe.name}</p>
                          <p className="text-xs text-foreground/55">{recipe.category ?? "Sans catégorie"} · {recipe.allergens.length ? recipe.allergens.join(", ") : "Sans allergène"}</p>
                        </div>
                        <span className={cn("rounded-full px-2 py-1 text-xs", Number(recipe.margin_rate || 0) < 0.2 ? "bg-red-100 text-red-700" : Number(recipe.margin_rate || 0) < 0.35 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                          {Math.round(Number(recipe.margin_rate || 0) * 100)} %
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground/55">
                        <span>Coût portion {Number(recipe.cost_per_portion || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                        <span>•</span>
                        <span>Prix vente {Number(recipe.selling_price || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="p-5">
                <h2 className="text-base font-semibold">Fournisseurs</h2>
                <div className="mt-4 grid gap-2">
                  {data.supplier_spend.map((row) => (
                    <div key={row.id} className="rounded-md bg-muted px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{row.name}</span>
                        <span>{Number(row.amount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground/55">{row.count} facture(s)</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">Production, stock et équipe</h2>
                <div className="mt-4 grid gap-2">
                  {data.production_by_period.map((row) => (
                    <div key={row.label} className="rounded-md border border-border px-3 py-3 text-sm">
                      <p className="font-medium">{row.label}</p>
                      <p className="text-xs text-foreground/55">{row.productions} production(s) · {Number(row.quantity || 0).toLocaleString("fr-FR")} unités · {Number(row.cost || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</p>
                    </div>
                  ))}
                  <div className="rounded-md bg-muted px-3 py-3 text-sm">
                    <p className="font-medium">Stock consommé</p>
                    <p className="text-xs text-foreground/55">
                      Production {Number(data.stock_consumption_by_period.reduce((sum, row) => sum + Number(row.production || 0), 0)).toLocaleString("fr-FR")} ·
                      Pertes {Number(data.stock_consumption_by_period.reduce((sum, row) => sum + Number(row.waste || 0), 0)).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="p-5">
                <h2 className="text-base font-semibold">HACCP et temps équipe</h2>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-md bg-muted px-3 py-3 text-sm">
                    <p className="font-medium">Conformité HACCP</p>
                    <p className="text-xs text-foreground/55">{Math.round(data.haccp.compliance_rate * 100)} % · {data.haccp.done} fait(s) · {data.haccp.non_compliant} non conforme(s)</p>
                  </div>
                  <div className="rounded-md bg-muted px-3 py-3 text-sm">
                    <p className="font-medium">Temps équipe</p>
                    <p className="text-xs text-foreground/55">Prévu {Math.round(data.team_time.planned_minutes / 60)} h · Pointé {Math.round(data.team_time.actual_minutes / 60)} h · Écart {Math.round(data.team_time.difference_minutes / 60)} h</p>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">Factures par fournisseur</h2>
                <div className="mt-4 grid gap-2">
                  {data.invoices_by_supplier.map((row) => (
                    <div key={row.supplier_id} className="rounded-md border border-border px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{row.supplier_name}</span>
                        <span>{Number(row.amount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground/55">{row.count} document(s)</p>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground/55">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
