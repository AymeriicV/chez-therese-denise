"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, Loader2, Minus, Plus, Save, Search, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type CountLine = {
  id: string;
  item_id: string;
  item_name: string;
  unit: string;
  expected_qty: string;
  counted_qty: string | null;
  variance_qty: string;
  note: string | null;
};

type CountSession = {
  id: string;
  name: string;
  status: "DRAFT" | "COUNTING" | "REVIEW" | "VALIDATED" | "CANCELLED";
  storage_area: string | null;
  line_count: number;
  counted_line_count: number;
  variance_value: string;
  lines: CountLine[];
};

export function InventoryClient() {
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  const filteredLines = useMemo(
    () => (selected?.lines ?? []).filter((line) => line.item_name.toLowerCase().includes(query.toLowerCase())),
    [query, selected],
  );

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<CountSession[]>("/inventory/sessions");
      setSessions(data);
      setSelectedId(selectId ?? data[0]?.id ?? "");
      setDraftCounts(Object.fromEntries(data.flatMap((session) => session.lines.map((line) => [line.id, line.counted_qty ?? line.expected_qty]))));
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  async function createSession() {
    setError("");
    if (!newName.trim()) {
      setError("Le nom de session est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const session = await apiRequest<CountSession>("/inventory/sessions", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), storage_area: newArea.trim() || null, item_ids: [] }),
      });
      setCreating(false);
      setNewName("");
      setNewArea("");
      await loadSessions(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation session impossible");
    } finally {
      setSaving(false);
    }
  }

  async function saveLine(line: CountLine) {
    if (!selected) return;
    setError("");
    const countedQty = draftCounts[line.id] ?? line.expected_qty;
    if (Number.isNaN(Number(countedQty)) || Number(countedQty) < 0) {
      setError("La quantite comptee doit etre un nombre positif.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/inventory/sessions/${selected.id}/lines/${line.id}`, {
        method: "PATCH",
        body: JSON.stringify({ counted_qty: countedQty, note: line.note }),
      });
      await loadSessions(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saisie impossible");
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const session = await apiRequest<CountSession>(`/inventory/sessions/${selected.id}/validate`, { method: "POST" });
      await loadSessions(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation impossible");
    } finally {
      setSaving(false);
    }
  }

  function adjust(line: CountLine, delta: number) {
    const current = Number(draftCounts[line.id] ?? line.counted_qty ?? line.expected_qty);
    setDraftCounts((values) => ({ ...values, [line.id]: String(Math.max(0, Number((current + delta).toFixed(3)))) }));
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
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Session</Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}

        {creating ? (
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nom de session" />
              <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={newArea} onChange={(event) => setNewArea(event.target.value)} placeholder="Zone optionnelle" />
              <div className="flex gap-2">
                <Button variant="secondary" size="icon" onClick={() => setCreating(false)} aria-label="Annuler"><X className="h-4 w-4" /></Button>
                <Button onClick={createSession} disabled={saving || !newName}><Save className="h-4 w-4" />Creer</Button>
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[0.82fr_1.35fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3"><h2 className="text-base font-semibold">Sessions</h2></div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement sessions" /> : null}
              {!loading && sessions.length === 0 ? <StateLine text="Aucune session inventaire" loading={false} /> : null}
              {sessions.map((session) => (
                <button key={session.id} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted", session.id === selected?.id && "bg-muted")} onClick={() => setSelectedId(session.id)}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline"><ClipboardCheck className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{session.name}</p>
                    <p className="truncate text-xs text-foreground/55">{session.storage_area ?? "Toutes zones"}</p>
                  </div>
                  <span className="rounded-md bg-foreground px-2 py-1 text-xs text-background">{session.status}</span>
                </button>
              ))}
            </div>
          </Card>

          {selected ? (
            <div className="grid gap-4">
              <Card className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-foreground/55">{selected.storage_area ?? "Toutes zones"}</p>
                    <h2 className="mt-1 text-2xl font-semibold">{selected.name}</h2>
                  </div>
                  <Button disabled={saving || selected.status === "VALIDATED"} onClick={validate}><Check className="h-4 w-4" />Valider</Button>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <Metric label="Comptees" value={`${selected.counted_line_count}/${selected.line_count}`} />
                  <Metric label="Statut" value={selected.status} />
                  <Metric label="Ecart valeur" value={`${Number(selected.variance_value || 0).toFixed(2)} EUR`} />
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-border p-3">
                  <div className="flex h-10 items-center gap-2 rounded-md bg-muted px-3">
                    <Search className="h-4 w-4 text-foreground/45" />
                    <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une ligne" />
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {filteredLines.length === 0 ? <StateLine text="Aucune ligne" loading={false} /> : null}
                  {filteredLines.map((line) => {
                    const counted = Number(draftCounts[line.id] ?? line.counted_qty ?? line.expected_qty);
                    const variance = counted - Number(line.expected_qty);
                    return (
                      <div key={line.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_130px_152px] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{line.item_name}</p>
                          <p className="text-xs text-foreground/55">Attendu {line.expected_qty} {line.unit} - Ecart {variance.toFixed(3)} {line.unit}</p>
                        </div>
                        <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" type="number" disabled={selected.status === "VALIDATED"} value={draftCounts[line.id] ?? ""} onChange={(event) => setDraftCounts((values) => ({ ...values, [line.id]: event.target.value }))} />
                        <div className="flex gap-2 sm:justify-end">
                          <Button variant="secondary" size="icon" aria-label="Diminuer" disabled={selected.status === "VALIDATED"} onClick={() => adjust(line, -1)}><Minus className="h-4 w-4" /></Button>
                          <Button variant="secondary" size="icon" aria-label="Augmenter" disabled={selected.status === "VALIDATED"} onClick={() => adjust(line, 1)}><Plus className="h-4 w-4" /></Button>
                          <Button size="icon" aria-label="Sauver" disabled={saving || selected.status === "VALIDATED"} onClick={() => saveLine(line)}><Save className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-5"><p className="text-sm text-foreground/55">Creez une session pour commencer.</p></Card>
          )}
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

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {text}
    </div>
  );
}
