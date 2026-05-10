"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Minus, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CountLine = {
  id: string;
  item: string;
  unit: string;
  expected: number;
  counted: number | null;
  cost: number;
};

type CountSession = {
  id: string;
  name: string;
  status: "COUNTING" | "REVIEW" | "VALIDATED";
  storageArea: string;
  lines: CountLine[];
};

const seedSessions: CountSession[] = [
  {
    id: "cnt_001",
    name: "Inventaire froid positif",
    status: "REVIEW",
    storageArea: "Froid positif",
    lines: [
      { id: "ln_001", item: "Filet de bar", unit: "kg", expected: 2.4, counted: 2.1, cost: 24.8 },
      { id: "ln_002", item: "Creme crue", unit: "l", expected: 11, counted: 12, cost: 7.45 },
      { id: "ln_003", item: "Beurre doux", unit: "kg", expected: 5, counted: null, cost: 8.2 },
    ],
  },
  {
    id: "cnt_002",
    name: "Inventaire reserve jour",
    status: "COUNTING",
    storageArea: "Reserve jour",
    lines: [
      { id: "ln_004", item: "Asperges vertes", unit: "kg", expected: 3.1, counted: 3.2, cost: 12.3 },
      { id: "ln_005", item: "Fraises", unit: "kg", expected: 4, counted: null, cost: 8.8 },
    ],
  },
];

export function InventoryClient() {
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState(seedSessions);
  const [selectedId, setSelectedId] = useState(seedSessions[0].id);
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];
  const filteredLines = useMemo(
    () => selected.lines.filter((line) => line.item.toLowerCase().includes(query.toLowerCase())),
    [query, selected.lines],
  );
  const countedCount = selected.lines.filter((line) => line.counted !== null).length;
  const varianceValue = selected.lines.reduce((total, line) => total + ((line.counted ?? line.expected) - line.expected) * line.cost, 0);

  function adjust(lineId: string, delta: number) {
    setSessions((current) =>
      current.map((session) =>
        session.id !== selected.id
          ? session
          : {
              ...session,
              status: "REVIEW",
              lines: session.lines.map((line) =>
                line.id === lineId
                  ? { ...line, counted: Number(Math.max(0, (line.counted ?? line.expected) + delta).toFixed(3)) }
                  : line,
              ),
            },
      ),
    );
  }

  function validate() {
    setSessions((current) =>
      current.map((session) => (session.id === selected.id ? { ...session, status: "VALIDATED" } : session)),
    );
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-foreground/55">Comptage, ecarts et ajustements</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Inventaires</h1>
          </div>
          <Button>
            <Plus className="h-4 w-4" />
            Session
          </Button>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.82fr_1.35fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">Sessions</h2>
            </div>
            <div className="divide-y divide-border">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted",
                    session.id === selected.id && "bg-muted",
                  )}
                  onClick={() => setSelectedId(session.id)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline">
                    <ClipboardCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{session.name}</p>
                    <p className="truncate text-xs text-foreground/55">{session.storageArea}</p>
                  </div>
                  <span className="rounded-md bg-foreground px-2 py-1 text-xs text-background">{session.status}</span>
                </button>
              ))}
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-foreground/55">{selected.storageArea}</p>
                  <h2 className="mt-1 text-2xl font-semibold">{selected.name}</h2>
                </div>
                <Button disabled={selected.status === "VALIDATED"} onClick={validate}>
                  <Check className="h-4 w-4" />
                  Valider
                </Button>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <Metric label="Comptees" value={`${countedCount}/${selected.lines.length}`} />
                <Metric label="Statut" value={selected.status} />
                <Metric label="Ecart valeur" value={`${varianceValue.toFixed(2)} EUR`} />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-border p-3">
                <div className="flex h-10 items-center gap-2 rounded-md bg-muted px-3">
                  <Search className="h-4 w-4 text-foreground/45" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Rechercher une ligne"
                  />
                </div>
              </div>
              <div className="divide-y divide-border">
                {filteredLines.map((line) => {
                  const counted = line.counted ?? line.expected;
                  const variance = counted - line.expected;
                  return (
                    <div key={line.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_120px_112px] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.item}</p>
                        <p className="text-xs text-foreground/55">
                          Attendu {line.expected} {line.unit} - Ecart {variance.toFixed(3)} {line.unit}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">
                        {counted} {line.unit}
                      </p>
                      <div className="flex gap-2 sm:justify-end">
                        <Button variant="secondary" size="icon" aria-label="Diminuer" onClick={() => adjust(line.id, -1)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Button variant="secondary" size="icon" aria-label="Augmenter" onClick={() => adjust(line.id, 1)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
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
