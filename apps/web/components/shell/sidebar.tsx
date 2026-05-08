"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  FileScan,
  Home,
  Moon,
  PackageCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/invoices", label: "OCR factures", icon: FileScan },
  { href: "/suppliers", label: "Fournisseurs", icon: Truck },
  { href: "/stock", label: "Stocks", icon: Boxes },
  { href: "/recipes", label: "Fiches", icon: ChefHat },
  { href: "/haccp", label: "HACCP", icon: ShieldCheck },
  { href: "/production", label: "Production", icon: PackageCheck },
  { href: "/planning", label: "Planning", icon: CalendarDays },
  { href: "/team", label: "Equipe", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ai", label: "IA", icon: Sparkles },
  { href: "/settings", label: "Parametres", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();

  return (
    <>
      <aside className="hidden h-screen w-72 shrink-0 border-r border-border bg-background px-3 py-4 lg:sticky lg:top-0 lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
            CTD
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Chez Therese et Denise</p>
            <p className="truncate text-xs text-foreground/55">Restaurant principal</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm text-foreground/68 transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          <Button variant="secondary" size="icon" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Mode sombre"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Moon className="h-4 w-4" />
          </Button>
          <div className="ml-auto h-8 w-8 rounded-full bg-muted" />
        </div>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-background/95 px-2 py-2 backdrop-blur lg:hidden">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-1 rounded-md text-[10px] text-foreground/60",
                active && "bg-muted text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
