import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  FileText,
  Package,
  ScanLine,
  TrendingUp,
  Truck,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const kpis = [
  { label: "Marge estimee", value: "71.4%", delta: "+2.1%", icon: TrendingUp },
  { label: "Factures a revoir", value: "12", delta: "OCR", icon: ScanLine },
  { label: "Alertes stock", value: "8", delta: "Urgent", icon: AlertTriangle },
  { label: "Conformite HACCP", value: "98%", delta: "Stable", icon: BadgeCheck },
];

const modules = [
  ["OCR factures", "Extraction IA, validation et rapprochement fournisseur", "12 en revue", FileText],
  ["Stocks intelligents", "Seuils, mouvements, inventaires et couts moyens", "8 alertes", Package],
  ["Commandes", "Bons fournisseurs et sync caisse L'Addition", "4 brouillons", Truck],
  ["Analytics", "Marge, pertes, previsions et historique complet", "+14% CA", TrendingUp],
];

const activity = [
  "Facture Metro importee et pre-analysee",
  "Releve froid positif conforme a 3.1 C",
  "Stock saumon passe sous seuil critique",
  "Fiche technique Paris-Brest mise a jour",
];

export default function DashboardPage() {
  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground/55">{kpi.label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-normal">{kpi.value}</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-4 text-xs text-foreground/55">{kpi.delta}</p>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-lg border border-border bg-foreground p-5 text-background lg:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-background/60">Chez Therese et Denise</p>
                <h2 className="mt-2 max-w-xl text-3xl font-semibold tracking-normal lg:text-5xl">
                  Operations nettes, couts visibles, decisions rapides.
                </h2>
              </div>
              <Button variant="secondary" className="shrink-0 bg-background text-foreground hover:bg-background/90">
                Ouvrir analytics
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-8 grid gap-2 sm:grid-cols-3">
              {["Food cost 28.6%", "Pertes 1.8%", "Prevision demain 146 couverts"].map((item) => (
                <div key={item} className="rounded-md border border-background/15 px-3 py-3 text-sm text-background/80">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Activite recente</h2>
              <Button variant="ghost" size="sm">Voir</Button>
            </div>
            <div className="mt-4 space-y-3">
              {activity.map((item) => (
                <div key={item} className="rounded-md bg-muted px-3 py-3 text-sm text-foreground/75">
                  {item}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {modules.map(([title, description, metric, Icon]) => (
            <Card key={title as string} className="p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-foreground/58">{description}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-foreground/55">{metric}</span>
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </Card>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
