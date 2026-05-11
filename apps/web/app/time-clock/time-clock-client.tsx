"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Save, UserCog } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint, getSessionRole } from "@/lib/api";
import { formatParisDateTime, formatParisTime, parisDateInput, parisDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  role: string | null;
  position: string | null;
  clock_in: string;
  clock_out: string | null;
  source: string;
  is_open: boolean;
  worked_minutes: number;
  corrections: Array<{
    id: string;
    reason: string;
    note: string | null;
    corrected_by_user_id: string;
    corrected_clock_in: string | null;
    corrected_clock_out: string | null;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  archived_at: string | null;
};

type CorrectionForm = {
  employee_id: string;
  entry_id: string;
  clock_in: string;
  clock_out: string;
  reason: string;
  note: string;
};

type EmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
};

const emptyCorrection: CorrectionForm = {
  employee_id: "",
  entry_id: "",
  clock_in: "",
  clock_out: "",
  reason: "",
  note: "",
};

export function TimeClockClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [form, setForm] = useState<CorrectionForm>(emptyCorrection);
  const [nowLabel, setNowLabel] = useState("");
  const [lastBadgeTime, setLastBadgeTime] = useState("");
  const role = getSessionRole();
  const isEmployee = role === "EMPLOYEE";
  const latestOpen = entries.find((entry) => entry.is_open) ?? null;
  const todayEntries = useMemo(() => entries.filter((entry) => parisDateKey(entry.clock_in) === parisDateInput()), [entries]);
  const selectedEntries = useMemo(
    () => (selectedEmployeeId ? entries.filter((entry) => entry.employee_id === selectedEmployeeId) : entries).slice(0, 20),
    [entries, selectedEmployeeId],
  );
  const employeeOptions = useMemo(() => {
    if (employees.length > 0) {
      return employees.map((employee) => ({ id: employee.id, name: `${employee.first_name} ${employee.last_name}` }));
    }
    const map = new Map<string, { id: string; name: string }>();
    for (const entry of entries) map.set(entry.employee_id, { id: entry.employee_id, name: entry.employee_name });
    return [...map.values()];
  }, [employees, entries]);

  useEffect(() => {
    void loadEntries();
  }, []);

  useEffect(() => {
    const update = () => setNowLabel(formatParisTime(new Date()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadEntries() {
    setLoading(true);
    setError("");
    try {
      const [entryData, employeeData] = await Promise.all([
        apiRequest<Entry[]>("/time-clock"),
        isEmployee ? Promise.resolve([] as EmployeeOption[]) : apiRequest<EmployeeOption[]>("/team/employees"),
      ]);
      const data = entryData;
      setEntries(data);
      setEmployees(employeeData);
      const initialEmployeeId = employeeData[0]?.id || data[0]?.employee_id || "";
      setSelectedEmployeeId((current) => current || initialEmployeeId);
      if (employeeData[0]) {
        setForm((current) => ({ ...current, employee_id: current.employee_id || employeeData[0].id }));
      } else if (data[0]) {
        setForm((current) => ({ ...current, employee_id: current.employee_id || data[0].employee_id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  async function punchIn() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const entry = await apiRequest<Entry>("/time-clock/punch-in", { method: "POST" });
      setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setLastBadgeTime(formatParisDateTime(entry.clock_in));
      setSuccess("Arrivée enregistrée.");
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pointage impossible");
    } finally {
      setSaving(false);
    }
  }

  async function punchOut() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const entry = await apiRequest<Entry>("/time-clock/punch-out", { method: "POST" });
      setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setLastBadgeTime(formatParisDateTime(entry.clock_out || entry.clock_in));
      setSuccess("Départ enregistré.");
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pointage impossible");
    } finally {
      setSaving(false);
    }
  }

  async function saveCorrection() {
    setError("");
    setSuccess("");
    if (!form.employee_id || !form.reason.trim()) {
      setError("Employé et justification obligatoires.");
      return;
    }
    if (!form.entry_id && !form.clock_in) {
      setError("Pour un pointage manquant, l'heure d'arrivée est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const saved = await apiRequest<Entry>("/time-clock/corrections", {
        method: "POST",
        body: JSON.stringify({
          employee_id: form.employee_id,
          entry_id: form.entry_id || null,
          clock_in: form.clock_in ? new Date(form.clock_in).toISOString() : null,
          clock_out: form.clock_out ? new Date(form.clock_out).toISOString() : null,
          reason: form.reason.trim(),
          note: form.note || null,
        }),
      });
      setEntries((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setForm(emptyCorrection);
      setSelectedEmployeeId(saved.employee_id);
      setLastBadgeTime(formatParisDateTime(saved.clock_in));
      setSuccess("Correction enregistrée.");
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-foreground/55">Pointages serveur et corrections auditables</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Badgeuse</h1>
          </div>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 md:grid-cols-3">
          <Metric label="Pointages du jour" value={String(todayEntries.length)} />
          <Metric label="Pointage ouvert" value={latestOpen ? "Oui" : "Non"} />
          <Metric label="Accès" value={isEmployee ? "Employé" : "Responsable"} />
        </section>

        {isEmployee ? (
          <Card className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Mes pointages</h2>
                <p className="text-sm text-foreground/55">Heure serveur uniquement, sans saisie manuelle.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  <p className="text-xs text-foreground/55">Heure affichée</p>
                  <p className="font-semibold">{nowLabel || "..."}</p>
                </div>
                {lastBadgeTime ? (
                  <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    <p className="text-xs text-foreground/55">Dernier badge</p>
                    <p className="font-semibold">{lastBadgeTime}</p>
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button onClick={punchIn} disabled={saving || Boolean(latestOpen)}><Clock3 className="h-4 w-4" />Pointer mon arrivée</Button>
                <Button variant="secondary" onClick={punchOut} disabled={saving || !latestOpen}><CheckCircle2 className="h-4 w-4" />Pointer mon départ</Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <h2 className="text-lg font-semibold">Vue responsable</h2>
            <p className="mt-2 text-sm text-foreground/55">Lecture complète de l'équipe, pointages et corrections.</p>
          </Card>
        )}

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div>
                <h2 className="text-base font-semibold">Historique des pointages</h2>
                <p className="text-xs text-foreground/55">{isEmployee ? "Votre historique personnel." : "Historique complet de l'équipe."}</p>
              </div>
              {!isEmployee ? (
                <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
                  <option value="">Tous les employés</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des pointages" /> : null}
              {!loading && selectedEntries.length === 0 ? <StateLine text="Aucun pointage enregistré." /> : null}
              {selectedEntries.map((entry) => (
                <button key={entry.id} className={cn("flex w-full items-start justify-between gap-3 px-4 py-3 text-left", entry.is_open && "bg-muted")} onClick={() => !isEmployee && setForm({
                  employee_id: entry.employee_id,
                  entry_id: entry.id,
                  clock_in: entry.clock_in.slice(0, 16),
                  clock_out: entry.clock_out ? entry.clock_out.slice(0, 16) : "",
                  reason: "",
                  note: "",
                })}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{entry.employee_name}</p>
                    <p className="text-xs text-foreground/55">Heure initiale: {formatParisDateTime(entry.clock_in)}</p>
                    <p className="text-xs text-foreground/55">Heure badgée: {entry.clock_out ? formatParisDateTime(entry.clock_out) : "En cours"}</p>
                    <p className="mt-1 text-xs text-foreground/55">{entry.position ?? "Poste non renseigné"} - {entry.worked_minutes} min</p>
                    {entry.corrections.length > 0 ? <p className="mt-1 text-xs text-foreground/55">Corrections: {entry.corrections.length}</p> : null}
                  </div>
                  <span className={cn("rounded-md px-2 py-1 text-xs", entry.is_open ? "bg-foreground text-background" : "bg-muted text-foreground")}>{entry.is_open ? "Ouvert" : "Clos"}</span>
                </button>
              ))}
            </div>
          </Card>

          {!isEmployee ? (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Correction / ajout</h2>
                  <p className="text-sm text-foreground/55">Justification obligatoire, audit immédiat.</p>
                </div>
                <Button variant="secondary" size="icon" onClick={() => setForm(emptyCorrection)}><Save className="h-4 w-4" /></Button>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs text-foreground/55">Employé</span>
                  <select className="h-10 rounded-md border border-border bg-background px-3" value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
                    <option value="">Sélectionner</option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs text-foreground/55">Pointage existant</span>
                  <select className="h-10 rounded-md border border-border bg-background px-3" value={form.entry_id} onChange={(event) => setForm({ ...form, entry_id: event.target.value })}>
                    <option value="">Créer un pointage manquant</option>
                    {entries.filter((entry) => !form.employee_id || entry.employee_id === form.employee_id).map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.employee_name} - {formatParisDateTime(entry.clock_in)}</option>
                    ))}
                  </select>
                </label>
                <Field label="Arrivée" type="datetime-local" value={form.clock_in} onChange={(value) => setForm({ ...form, clock_in: value })} />
                <Field label="Départ" type="datetime-local" value={form.clock_out} onChange={(value) => setForm({ ...form, clock_out: value })} />
                <Field label="Justification" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} />
                <label className="grid gap-1 text-sm">
                  <span className="text-xs text-foreground/55">Note</span>
                  <textarea className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
                </label>
                <Button onClick={saveCorrection} disabled={saving}><UserCog className="h-4 w-4" />{saving ? "Enregistrement..." : "Valider la correction"}</Button>
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <h2 className="text-lg font-semibold">Historique personnel</h2>
              <p className="mt-2 text-sm text-foreground/55">Les pointages sont enregistrés uniquement avec l'heure serveur.</p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-foreground/55">{label}</span>
      <input className="h-10 rounded-md border border-border bg-background px-3" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StateLine({ text }: { text: string }) {
  return <div className="px-4 py-4 text-sm text-foreground/55">{text}</div>;
}
