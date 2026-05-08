"use client";

import { useMemo, useState } from "react";
import { Archive, Mail, Phone, Plus, Search, Star, Truck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Supplier = {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  categories: string[];
  leadTime: number;
  paymentTerms: string;
  minimumOrder: number;
  rating: number;
  active: boolean;
  invoiceCount: number;
  reviewCount: number;
  purchaseTotal: number;
};

const seedSuppliers: Supplier[] = [
  {
    id: "sup_001",
    name: "Metro",
    contact: "Sophie Laurent",
    email: "commande@metro.example",
    phone: "+33 1 42 00 00 00",
    categories: ["Epicerie", "Frais", "Boissons"],
    leadTime: 1,
    paymentTerms: "30 jours fin de mois",
    minimumOrder: 150,
    rating: 4.7,
    active: true,
    invoiceCount: 42,
    reviewCount: 3,
    purchaseTotal: 18420,
  },
  {
    id: "sup_002",
    name: "Primeurs Denise",
    contact: "Nadia Mercier",
    email: "primeurs@denise.example",
    phone: "+33 6 12 34 56 78",
    categories: ["Fruits", "Legumes"],
    leadTime: 0,
    paymentTerms: "Comptant",
    minimumOrder: 60,
    rating: 4.9,
    active: true,
    invoiceCount: 28,
    reviewCount: 0,
    purchaseTotal: 7210,
  },
  {
    id: "sup_003",
    name: "Poissonnerie Atlantique",
    contact: "Marc Vilar",
    email: "criee@atlantique.example",
    phone: "+33 2 98 00 00 00",
    categories: ["Poisson", "Coquillage"],
    leadTime: 2,
    paymentTerms: "15 jours",
    minimumOrder: 220,
    rating: 4.4,
    active: true,
    invoiceCount: 17,
    reviewCount: 2,
    purchaseTotal: 12680,
  },
];

export function SuppliersClient() {
  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState(seedSuppliers);
  const [selectedId, setSelectedId] = useState(seedSuppliers[0].id);
  const filtered = useMemo(
    () => suppliers.filter((supplier) => supplier.name.toLowerCase().includes(query.toLowerCase())),
    [query, suppliers],
  );
  const selected = suppliers.find((supplier) => supplier.id === selectedId) ?? filtered[0] ?? suppliers[0];

  function archiveSelected() {
    setSuppliers((current) =>
      current.map((supplier) => (supplier.id === selected.id ? { ...supplier, active: false } : supplier)),
    );
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-foreground/55">Achats et relations fournisseurs</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Fournisseurs</h1>
          </div>
          <Button>
            <Plus className="h-4 w-4" />
            Nouveau
          </Button>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="flex h-10 items-center gap-2 rounded-md bg-muted px-3">
                <Search className="h-4 w-4 text-foreground/45" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher"
                />
              </div>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((supplier) => (
                <button
                  key={supplier.id}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted",
                    supplier.id === selected.id && "bg-muted",
                  )}
                  onClick={() => setSelectedId(supplier.id)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{supplier.name}</p>
                    <p className="truncate text-xs text-foreground/55">{supplier.categories.join(", ")}</p>
                  </div>
                  <span className={cn("rounded-md px-2 py-1 text-xs", supplier.active ? "bg-foreground text-background" : "bg-muted text-foreground/55")}>
                    {supplier.active ? "Actif" : "Archive"}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm text-foreground/55">
                    <Star className="h-4 w-4" />
                    Note {selected.rating.toFixed(1)} / 5
                  </p>
                  <h2 className="mt-2 truncate text-3xl font-semibold">{selected.name}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.categories.map((category) => (
                      <span key={category} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/65">
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
                <Button variant="secondary" onClick={archiveSelected}>
                  <Archive className="h-4 w-4" />
                  Archiver
                </Button>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-4">
                <Metric label="Delai" value={`${selected.leadTime} j`} />
                <Metric label="Minimum" value={`${selected.minimumOrder} EUR`} />
                <Metric label="Factures" value={String(selected.invoiceCount)} />
                <Metric label="A revoir" value={String(selected.reviewCount)} />
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="text-base font-semibold">Contact</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <p className="font-medium">{selected.contact}</p>
                  <p className="flex items-center gap-2 text-foreground/60">
                    <Mail className="h-4 w-4" />
                    {selected.email}
                  </p>
                  <p className="flex items-center gap-2 text-foreground/60">
                    <Phone className="h-4 w-4" />
                    {selected.phone}
                  </p>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-base font-semibold">Conditions achat</h3>
                <div className="mt-4 space-y-3 text-sm text-foreground/65">
                  <p>Paiement: {selected.paymentTerms}</p>
                  <p>Total achats HT: {selected.purchaseTotal.toLocaleString("fr-FR")} EUR</p>
                  <p>Rapprochement OCR: {selected.reviewCount === 0 ? "A jour" : `${selected.reviewCount} facture(s) a verifier`}</p>
                </div>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-3">
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="mt-1 truncate text-base font-semibold">{value}</p>
    </div>
  );
}
