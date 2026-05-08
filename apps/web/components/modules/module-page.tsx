import { ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ModuleDefinition } from "@/lib/modules";

export function ModulePage({ module }: { module: ModuleDefinition }) {
  const Icon = module.icon;

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
        <section className="rounded-lg border border-border bg-card p-5 lg:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-muted">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-sm text-foreground/55">{module.status}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal lg:text-5xl">{module.title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/60">{module.description}</p>
            </div>
            <Button className="shrink-0">
              Action principale
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {["Aujourd'hui", "A traiter", "Automatisation"].map((label, index) => (
            <Card key={label} className="p-4">
              <p className="text-sm text-foreground/55">{label}</p>
              <p className="mt-3 text-2xl font-semibold">{index === 0 ? "0" : index === 1 ? "Pret" : "Active"}</p>
            </Card>
          ))}
        </section>

        <Card className="p-4">
          <div className="grid min-h-64 place-items-center rounded-md border border-dashed border-border bg-muted/40 p-6 text-center">
            <div>
              <h2 className="text-lg font-semibold">Surface module prete</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-foreground/58">
                La navigation, les permissions et la structure UI sont en place. La prochaine etape consiste a brancher
                les workflows metier detailles et les donnees API de ce module.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
