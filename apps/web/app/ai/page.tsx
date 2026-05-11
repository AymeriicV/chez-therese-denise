import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Module IA bientôt disponible</h1>
              <p className="text-sm text-foreground/55">Cette surface utilisera les données ventes, factures, stock, production, planning et HACCP.</p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
