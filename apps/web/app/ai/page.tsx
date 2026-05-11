"use client";

import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
        <section className="rounded-lg border border-border bg-card p-5 lg:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-muted">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="text-sm text-foreground/55">Prévision de demande, ruptures et achats recommandés</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal lg:text-5xl">IA prédictive</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/60">
                Les fondations de l’espace IA sont prêtes. Les prochains travaux brancheront les prévisions locales,
                les anomalies et les recommandations d’achats sur les données métier réelles.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {["Prévisions", "Anomalies", "Recommandations"].map((label, index) => (
            <Card key={label} className="p-4">
              <p className="text-sm text-foreground/55">{label}</p>
              <p className="mt-3 text-2xl font-semibold">{index === 0 ? "En attente" : index === 1 ? "Active" : "Prêtes"}</p>
            </Card>
          ))}
        </section>

        <Card className="p-4">
          <div className="grid min-h-64 place-items-center rounded-md border border-dashed border-border bg-muted/40 p-6 text-center">
            <div>
              <h2 className="text-lg font-semibold">Surface module prête</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-foreground/58">
                L’espace IA reste accessible sans casser le build du front. Il sera raccordé au moteur local
                d’apprentissage sur les données restaurant.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
