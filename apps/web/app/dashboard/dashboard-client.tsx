"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, AlertTriangle, BadgeCheck, Boxes, Clock3, FileText, PackageCheck, ScanLine, ShoppingCart, TrendingUp, Truck, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type DashboardOverview = {
  restaurant: { id: string; name: string; timezone?: string | null };
  kpis: Record<string, number | string>;
  alerts: {
    priority: Array<{ label: string; href: string; severity: string }>;
    stock: Array<{ name: string; qty: string; unit: string; reorder: string }>;
    price: Array<{ inventory_item_name: string | null; supplier_name: string | null; variation_percent: string; new_unit_price: string; previous_unit_price: string }>;
    labels: Array<{ name: string; expires_at: string }>;
  };
  quick_actions: Array<{ label: string; href: string }>;
  chart: Array<{ label: string; value: string }>;
  top_suppliers: Array<{ id: string; name: string; amount: string; count: number }>;
  top_price_increases: Array<{ inventory_item_name: string | null; supplier_name: string | null; variation_percent: string; new_unit_price: string; previous_unit_price: string }>;
  tasks_today: Array<{ title: string; category: string; status: string; due_at: string | null }>;
  recent_activity: Array<{ label: string; detail: string; date: string }>;
  generated_at: string;
};

const kpiConfig = [
  { key: "pending_ocr", label: "Factures en attente OCR", icon: ScanLine },
  { key: "to_validate", label: "Factures à valider", icon: FileText },
  { key: "purchase_amount_month", label: "Achats du mois", icon: ShoppingCart, money: true },
  { key: "purchase_variation_percent", label: "Évolution achats", icon: TrendingUp, percent: true },
  { key: "low_stock", label: "Sous seuil", icon: Boxes },
  { key: "ruptures", label: "Ruptures", icon: AlertTriangle },
  { key: "stock_value", label: "Valeur stock", icon: BadgeCheck, money: true },
  { key: "production_today", label: "Productions du jour", icon: PackageCheck },
  { key: "haccp_todo", label: "Tâches HACCP", icon: Clock3 },
  { key: "temperature_non_compliant", label: "Températures non conformes", icon: AlertTriangle },
  { key: "orders_to_pass", label: "Commandes à passer", icon: Truck },
  { key: "orders_pending", label: "Commandes en attente", icon: Truck },
  { key: "present_employees", label: "Employés présents", icon: Users },
  { key: "planning_today", label: "Créneaux planning", icon: Clock3 },
  { key: "labels_expiring", label: "DLC proches", icon: BadgeCheck },
  { key: "price_alerts", label: "Alertes prix", icon: TrendingUp },
];

export function DashboardClient() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await apiRequest<DashboardOverview>("/dashboard/overview");
        if (mounted) setData(response);
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

  const kpis = useMemo(() => {
    if (!data) return [];
    return kpiConfig.map((item) => ({
      ...item,
      value: data.kpis[item.key] ?? 0,
    }));
  }, [data]);

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-foreground/55">Pilotage réel du restaurant</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Dashboard</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground/60">
              Toutes les cartes ci-dessous viennent des vraies données du SaaS. Aucune valeur fictive.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/invoices">
                Importer une facture
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/stock">
                Ouvrir le stock
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {loading ? <div className="rounded-md border border-border bg-card p-5 text-sm text-foreground/60">Chargement du dashboard...</div> : null}

        {data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
              {kpis.map((kpi) => {
                const Icon = kpi.icon;
                const raw = Number(kpi.value || 0);
                const value = kpi.money
                  ? `${raw.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                  : kpi.percent
                    ? `${(raw * 100).toFixed(1)} %`
                    : String(kpi.value ?? 0);
                return (
                  <Card key={kpi.key} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground/55">{kpi.label}</p>
                        <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Achats matières</p>
                    <h2 className="text-base font-semibold">Évolution mensuelle</h2>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/analytics">Voir les analyses</Link>
                  </Button>
                </div>
                <div className="mt-5 grid gap-3">
                  {data.chart.map((point) => {
                    const value = Number(point.value || 0);
                    const maxValue = Math.max(...data.chart.map((item) => Number(item.value || 0)), 1);
                    return (
                      <div key={point.label} className="grid gap-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground/55">{point.label}</span>
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Actions rapides</p>
                    <h2 className="text-base font-semibold">Accès direct</h2>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {data.quick_actions.map((action) => (
                    <Link key={action.href} href={action.href} className="flex items-center justify-between rounded-md border border-border px-3 py-3 text-sm transition-colors hover:bg-muted">
                      <span>{action.label}</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="p-5">
                <h2 className="text-base font-semibold">Alertes prioritaires</h2>
                <div className="mt-4 grid gap-2">
                  {data.alerts.priority.map((alert) => (
                    <Link key={`${alert.label}-${alert.href}`} href={alert.href} className={cn("rounded-md border px-3 py-3 text-sm", alert.severity === "critical" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                      {alert.label}
                    </Link>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="text-base font-semibold">Tâches du jour</h2>
                <div className="mt-4 grid gap-2">
                  {data.tasks_today.length === 0 ? <p className="text-sm text-foreground/55">Aucune tâche prévue aujourd’hui.</p> : null}
                  {data.tasks_today.map((task) => (
                    <div key={`${task.title}-${task.category}`} className="rounded-md bg-muted px-3 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{task.title}</p>
                          <p className="text-xs text-foreground/55">{task.category}</p>
                        </div>
                        <span className="rounded-full bg-background px-2 py-1 text-xs">{task.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="p-5">
                <h2 className="text-base font-semibold">Top fournisseurs</h2>
                <div className="mt-4 grid gap-2">
                  {data.top_suppliers.map((supplier) => (
                    <div key={supplier.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-3 text-sm">
                      <span className="truncate">{supplier.name}</span>
                      <span className="text-foreground/60">{Number(supplier.amount).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="text-base font-semibold">Alertes prix fournisseurs</h2>
                <div className="mt-4 grid gap-2">
                  {data.top_price_increases.length === 0 ? <p className="text-sm text-foreground/55">Aucune hausse détectée.</p> : null}
                  {data.top_price_increases.map((item, index) => (
                    <div key={`${item.inventory_item_name ?? "item"}-${index}`} className="rounded-md border border-border px-3 py-3 text-sm">
                      <p className="font-medium">{item.inventory_item_name ?? "Article"}</p>
                      <p className="text-xs text-foreground/55">{item.supplier_name ?? "Fournisseur"} · {Number(item.variation_percent || 0).toFixed(1)} %</p>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card className="p-5">
                <h2 className="text-base font-semibold">Alertes stock et péremption</h2>
                <div className="mt-4 grid gap-2">
                  {data.alerts.stock.map((item) => (
                    <div key={item.name} className="rounded-md bg-muted px-3 py-3 text-sm">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-foreground/55">
                        {Number(item.qty || 0).toLocaleString("fr-FR")} {item.unit} · seuil {Number(item.reorder || 0).toLocaleString("fr-FR")}
                      </p>
                    </div>
                  ))}
                  {data.alerts.labels.map((label) => (
                    <div key={label.name} className="rounded-md bg-muted px-3 py-3 text-sm">
                      <p className="font-medium">{label.name}</p>
                      <p className="text-xs text-foreground/55">Expire le {new Date(label.expires_at).toLocaleDateString("fr-FR")}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="text-base font-semibold">Activité récente</h2>
                <div className="mt-4 grid gap-2">
                  {data.recent_activity.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="rounded-md border border-border px-3 py-3 text-sm">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-foreground/55">{item.detail} · {new Date(item.date).toLocaleString("fr-FR")}</p>
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
