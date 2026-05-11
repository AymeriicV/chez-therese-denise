"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  Clock3,
  FileScan,
  Home,
  LogOut,
  Moon,
  PackageCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Thermometer,
  Truck,
  Users,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { clearStoredSession, getSessionRole, redirectToLogin } from "@/lib/api";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: Home },
  { href: "/invoices", label: "OCR factures", icon: FileScan },
  { href: "/suppliers", label: "Fournisseurs", icon: Truck },
  { href: "/stock", label: "Stocks", icon: Boxes },
  { href: "/recipes", label: "Fiches", icon: ChefHat },
  { href: "/haccp", label: "Qualité / HACCP", icon: ShieldCheck },
  { href: "/production", label: "Production", icon: PackageCheck },
  { href: "/planning", label: "Planning", icon: CalendarDays },
  { href: "/team", label: "Équipe", icon: Users },
  { href: "/analytics", label: "Analyses", icon: BarChart3 },
  { href: "/ai", label: "IA", icon: Sparkles },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

const qualityItems = [
  { href: "/haccp", label: "Nettoyage", icon: ClipboardCheck },
  { href: "/temperatures", label: "Températures", icon: Thermometer },
  { href: "/labels", label: "Étiquettes", icon: Tags },
];

export function Sidebar() {
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();
  const role = getSessionRole();
  const isEmployee = role === "EMPLOYEE";
  const desktopItems = isEmployee ? employeeNavItems : navItems;
  const mobileItems = useMemo(() => (isEmployee ? employeeNavItems : navItems.slice(0, 3)), [isEmployee]);
  const [mobileOpen, setMobileOpen] = useState(false);

  function logout() {
    clearStoredSession();
    redirectToLogin();
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <aside className="hidden h-screen w-72 shrink-0 border-r border-border bg-background px-3 py-4 lg:sticky lg:top-0 lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
            <img src="/logo.png" alt="Chez Thérèse & Denise" className="h-12 w-12 rounded-full object-contain"/>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Chez Thérèse et Denise</p>
            <p className="truncate text-xs text-foreground/55">Restaurant principal</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {desktopItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm text-foreground/68 transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-muted text-foreground",
                  )}
                >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
              </div>
            );
          })}
        </nav>
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          {isEmployee ? null : (
            <>
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
            </>
          )}
          <Button variant="secondary" size="icon" aria-label="Déconnexion" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
          <div className="ml-auto h-8 w-8 rounded-full bg-muted" />
        </div>
      </aside>
      <nav className={cn("fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-background/95 px-2 py-2 backdrop-blur lg:hidden", isEmployee ? "grid-cols-3" : "grid-cols-5")}>
        {mobileItems.map((item) => {
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
        {isEmployee ? (
          <button type="button" onClick={logout} className="flex h-11 flex-col items-center justify-center gap-1 rounded-md text-[10px] text-foreground/60">
            <LogOut className="h-4 w-4" />
            <span className="max-w-full truncate">Quitter</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-11 flex-col items-center justify-center gap-1 rounded-md text-[10px] text-foreground/60"
          >
            <Menu className="h-4 w-4" />
            <span className="max-w-full truncate">Menu</span>
          </button>
        )}
      </nav>
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-background/95 px-4 py-4 lg:hidden">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Navigation</p>
              <h2 className="text-lg font-semibold">Modules</h2>
            </div>
            <Button variant="secondary" size="icon" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 grid gap-3 overflow-y-auto pb-24">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn("flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm", pathname === item.href && "bg-muted")}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="rounded-md border border-border bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Qualité / HACCP</p>
              <div className="mt-3 grid gap-2">
                {qualityItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm", pathname === item.href && "bg-muted")}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <button type="button" onClick={logout} className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-left text-sm">
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const employeeNavItems = [
  { href: "/planning", label: "Mon planning", icon: CalendarDays },
  { href: "/time-clock", label: "Badgeuse", icon: Clock3 },
];
