"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, History, ShieldCheck, Tags, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { key: "cleaning", href: "/haccp", label: "Nettoyage", description: "Tâches du jour et validations", icon: ClipboardCheck, match: ["/haccp"] },
  { key: "temperatures", href: "/temperatures", label: "Températures", description: "Planning et relevés", icon: Thermometer, match: ["/temperatures"] },
  { key: "labels", href: "/labels", label: "Étiquettes", description: "Création, impression et archivage", icon: Tags, match: ["/labels"] },
  { key: "history", href: "/haccp#historique-controles", label: "Historique / contrôles", description: "Contrôles passés et non-conformités", icon: History, match: ["/haccp"] },
];

export function QualityNav({ compact = false, active }: { compact?: boolean; active?: "cleaning" | "temperatures" | "labels" | "history" }) {
  const pathname = usePathname();

  return (
    <section className="rounded-md border border-border bg-background/60 p-3">
      <div className="flex items-center gap-3 px-1 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Qualité</p>
          <h2 className="text-lg font-semibold">HACCP / Qualité</h2>
        </div>
      </div>
      <div className={cn("grid gap-2", compact ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-4")}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active ? item.key === active : item.match.includes(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md border border-border bg-background px-3 py-3 transition-colors hover:bg-muted",
                isActive && "border-foreground/20 bg-muted",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-semibold">{item.label}</span>
              </div>
              <p className="mt-2 text-xs text-foreground/60">{item.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
