"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  Copy,
  Loader2,
  Printer,
  Save,
  Sparkles,
  SquarePen,
  TimerReset,
  X,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint, getSessionRole } from "@/lib/api";
import { cn } from "@/lib/utils";

type PlanningDayCell = {
  id: string;
  weekday: number;
  morning_start: string | null;
  morning_end: string | null;
  break_minutes: number;
  evening_start: string | null;
  evening_end: string | null;
  is_day_off: boolean;
  comment: string | null;
  total_minutes: number;
};

type PlanningRowDay = {
  weekday: number;
  label: string;
  date: string;
  cell: PlanningDayCell | null;
  total_minutes: number;
};

type PlanningRow = {
  schedule_id: string | null;
  user_id: string;
  employee_name: string;
  email: string;
  position: string;
  role: string | null;
  weekly_target_minutes: number;
  comment: string;
  is_day_off: boolean;
  total_week_minutes: number;
  exceeds_objective: boolean;
  days: PlanningRowDay[];
};

type PlanningData = {
  week_start: string;
  week_end: string;
  days: Array<{ weekday: number; label: string; date: string }>;
  rows: PlanningRow[];
};

type EditorForm = {
  cell_id: string | null;
  user_id: string;
  employee_name: string;
  week_start: string;
  weekday: number;
  day_label: string;
  day_date: string;
  morning_start: string;
  morning_end: string;
  break_minutes: string;
  evening_start: string;
  evening_end: string;
  is_day_off: boolean;
  weekly_target_minutes: string;
  position: string;
  comment: string;
};

const WEEKDAY_LABELS = [
  { weekday: 0, label: "Lundi" },
  { weekday: 1, label: "Mardi" },
  { weekday: 2, label: "Mercredi" },
  { weekday: 3, label: "Jeudi" },
  { weekday: 4, label: "Vendredi" },
  { weekday: 5, label: "Samedi" },
  { weekday: 6, label: "Dimanche" },
];

function localDateInput(value = new Date()) {
  const offset = value.getTimezoneOffset();
  const local = new Date(value.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function shiftDate(value: string, deltaDays: number) {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + deltaDays);
  return localDateInput(next);
}

function toWeekStart(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const monday = new Date(date);
  monday.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1));
  return localDateInput(monday);
}

function minutesToLabel(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function timeRangeLabel(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  return `${start} - ${end}`;
}

function normalizeTime(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function PlanningClient() {
  const role = getSessionRole();
  const canEdit = role === "OWNER";
  const [targetDate, setTargetDate] = useState(localDateInput());
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<EditorForm | null>(null);
  const [copying, setCopying] = useState(false);
  const [sourceDate, setSourceDate] = useState(localDateInput());
  const [targetCopyDate, setTargetCopyDate] = useState(shiftDate(localDateInput(), 1));
  const [duplicateSourceDate, setDuplicateSourceDate] = useState(localDateInput());
  const [duplicateTargetDate, setDuplicateTargetDate] = useState(shiftDate(localDateInput(), 1));

  useEffect(() => {
    void loadPlanning(targetDate);
  }, [targetDate]);

  const weekLabel = useMemo(() => {
    if (!data) return "";
    return `${new Date(`${data.week_start}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} au ${new Date(`${data.week_end}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
  }, [data]);

  async function loadPlanning(nextTargetDate?: string) {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<PlanningData>(`/planning${nextTargetDate ? `?target_date=${nextTargetDate}` : ""}`);
      setData(response);
      if (selected) {
        const matching = response.rows
          .flatMap((row) => row.days.map((day) => ({ row, day })))
          .find(({ day }) => day.cell?.id === selected.cell_id);
        if (matching) {
          setSelected(buildEditorForm(matching.row, matching.day, response.week_start));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function openEditor(row: PlanningRow, day: PlanningRowDay) {
    if (!canEdit) return;
    if (day.cell && day.cell.is_day_off) {
      setSelected(buildEditorForm(row, day, data?.week_start ?? targetDate));
      return;
    }
    setSelected(buildEditorForm(row, day, data?.week_start ?? targetDate));
  }

  async function saveCell() {
    if (!selected) return;
    if (!selected.position.trim()) {
      setError("Le poste est obligatoire.");
      return;
    }
    if (!selected.is_day_off && !selected.morning_start && !selected.evening_start) {
      setError("Renseignez au moins un service ou cochez repos.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        user_id: selected.user_id,
        week_start: `${selected.week_start}T00:00:00.000Z`,
        weekday: selected.weekday,
        morning_start: normalizeTime(selected.morning_start),
        morning_end: normalizeTime(selected.morning_end),
        break_minutes: Number(selected.break_minutes || 0),
        evening_start: normalizeTime(selected.evening_start),
        evening_end: normalizeTime(selected.evening_end),
        is_day_off: selected.is_day_off,
        weekly_target_minutes: Number(selected.weekly_target_minutes || 0),
        position: selected.position.trim(),
        comment: selected.comment.trim() || null,
      };
      await apiRequest<unknown>(selected.cell_id ? `/planning/cells/${selected.cell_id}` : "/planning/cells", {
        method: selected.cell_id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setSelected(null);
      setSuccess("Planning enregistré.");
      await loadPlanning(targetDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  async function copyPreviousWeek() {
    setCopying(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<{ copied: number; target_week_start: string }>("/planning/copy-previous-week", {
        method: "POST",
        body: JSON.stringify({ target_date: targetCopyDate }),
      });
      setSuccess("Semaine précédente copiée.");
      await loadPlanning(targetCopyDate);
      setTargetDate(targetCopyDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copie impossible");
    } finally {
      setCopying(false);
    }
  }

  async function duplicateDay() {
    setCopying(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<{ duplicated: number }>("/planning/duplicate-day", {
        method: "POST",
        body: JSON.stringify({ source_date: duplicateSourceDate, target_date: duplicateTargetDate }),
      });
      setSuccess("Journée dupliquée.");
      await loadPlanning(targetDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplication impossible");
    } finally {
      setCopying(false);
    }
  }

  function printPlanning() {
    window.print();
  }

  const rows = data?.rows ?? [];
  const hasRows = rows.length > 0;

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-foreground/55">Vue hebdomadaire restauration type Excel</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Planning</h1>
              <p className="mt-2 text-sm text-foreground/55">{weekLabel || "Chargement de la semaine en cours"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setTargetDate(shiftDate(targetDate, -7))}>
                <CalendarDays className="h-4 w-4" />
                Semaine précédente
              </Button>
              <Button variant="secondary" onClick={() => setTargetDate(localDateInput())}>
                Aujourd’hui
              </Button>
              <Button variant="secondary" onClick={() => setTargetDate(shiftDate(targetDate, 7))}>
                Semaine suivante
              </Button>
              <Button variant="secondary" onClick={printPlanning}>
                <Printer className="h-4 w-4" />
                Imprimer
              </Button>
            </div>
          </div>

          {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
          {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}
        </section>

        {canEdit ? (
          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-base font-semibold">Actions de planning</h2>
                  <p className="text-sm text-foreground/55">Copie semaine complète ou duplication d’une journée.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs text-foreground/55">Date cible</span>
                    <input className="h-10 rounded-md border border-border bg-background px-3" type="date" value={targetCopyDate} onChange={(event) => setTargetCopyDate(event.target.value)} />
                  </label>
                  <div className="flex items-end">
                    <Button onClick={copyPreviousWeek} disabled={copying}>
                      {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                      Copier la semaine précédente
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs text-foreground/55">Jour source</span>
                    <input className="h-10 rounded-md border border-border bg-background px-3" type="date" value={duplicateSourceDate} onChange={(event) => setDuplicateSourceDate(event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs text-foreground/55">Jour cible</span>
                    <input className="h-10 rounded-md border border-border bg-background px-3" type="date" value={duplicateTargetDate} onChange={(event) => setDuplicateTargetDate(event.target.value)} />
                  </label>
                  <div className="flex items-end">
                    <Button variant="secondary" onClick={duplicateDay} disabled={copying}>
                      <TimerReset className="h-4 w-4" />
                      Dupliquer la journée
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Objectif planning</h2>
                  <p className="text-sm text-foreground/55">Les totaux sont calculés automatiquement, pause déduite.</p>
                </div>
              </div>
            </Card>
          </section>
        ) : null}

        {loading ? <LoadingState /> : null}

        {!loading && !hasRows ? (
          <Card className="p-6">
            <p className="text-sm text-foreground/55">Aucun planning trouvé pour cette semaine.</p>
          </Card>
        ) : null}

        {!loading && hasRows ? (
          <>
            <section className="hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[1500px] w-full border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-background">
                      <tr>
                        <Th>Employé</Th>
                        {WEEKDAY_LABELS.map((day) => (
                          <Th key={day.weekday}>{day.label}</Th>
                        ))}
                        <Th>Total semaine</Th>
                        <Th>Objectif</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.user_id} className="align-top">
                          <Td className="min-w-[240px]">
                            <div className="space-y-1">
                              <p className="font-medium">{row.employee_name}</p>
                              <p className="text-xs text-foreground/55">{row.position}</p>
                              <p className="text-xs text-foreground/45">{row.email}</p>
                              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                                <span className="rounded-full bg-muted px-2 py-1">{row.role ?? "Employé"}</span>
                                {row.is_day_off ? <span className="rounded-full bg-muted px-2 py-1">Repos semaine</span> : null}
                              </div>
                            </div>
                          </Td>
                          {row.days.map((day) => (
                            <Td key={`${row.user_id}-${day.weekday}`} className="min-w-[180px]">
                              <DayCellCard row={row} day={day} canEdit={canEdit} onOpen={() => openEditor(row, day)} />
                            </Td>
                          ))}
                          <Td className="min-w-[120px]">
                            <strong className={cn("text-sm", row.exceeds_objective ? "text-red-600 dark:text-red-400" : "text-foreground")}>{minutesToLabel(row.total_week_minutes)}</strong>
                          </Td>
                          <Td className="min-w-[120px]">
                            <span className={cn("rounded-full px-2 py-1 text-xs", row.exceeds_objective ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-muted text-foreground")}>
                              {row.weekly_target_minutes ? minutesToLabel(row.weekly_target_minutes) : "Non défini"}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {canEdit ? (
                <Card className="sticky top-4 p-4 self-start">
                  {selected ? (
                    <EditorPanel
                      form={selected}
                      setForm={setSelected}
                      saving={saving}
                      onCancel={() => setSelected(null)}
                      onSave={saveCell}
                    />
                  ) : (
                    <EmptyEditor />
                  )}
                </Card>
              ) : null}
            </section>

            <section className="grid gap-4 xl:hidden">
              {rows.map((row) => (
                <Card key={row.user_id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{row.employee_name}</p>
                      <p className="text-sm text-foreground/55">{row.position}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-medium", row.exceeds_objective ? "text-red-600 dark:text-red-400" : "text-foreground")}>{minutesToLabel(row.total_week_minutes)}</p>
                      <p className="text-xs text-foreground/55">Objectif {row.weekly_target_minutes ? minutesToLabel(row.weekly_target_minutes) : "non défini"}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {row.days.map((day) => (
                      <button
                        key={`${row.user_id}-${day.weekday}`}
                        type="button"
                        onClick={() => openEditor(row, day)}
                        className="rounded-md border border-border bg-background p-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{day.label}</p>
                            <p className="text-xs text-foreground/55">{new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</p>
                          </div>
                          {day.cell?.is_day_off ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">REPOS</span> : <span className="rounded-full bg-muted px-2 py-1 text-xs">{minutesToLabel(day.total_minutes)}</span>}
                        </div>
                        <div className="mt-3 grid gap-1 text-xs text-foreground/60">
                          {day.cell?.is_day_off ? (
                            <p>Journée de repos</p>
                          ) : day.cell ? (
                            <>
                              <p>Matin: {timeRangeLabel(day.cell.morning_start, day.cell.morning_end)}</p>
                              <p>Pause: {day.cell.break_minutes} min</p>
                              <p>Soir: {timeRangeLabel(day.cell.evening_start, day.cell.evening_end)}</p>
                              <p>Total jour: {minutesToLabel(day.total_minutes)}</p>
                            </>
                          ) : (
                            <p>{canEdit ? "Créer un créneau" : "Aucun créneau saisi"}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function buildEditorForm(row: PlanningRow, day: PlanningRowDay, weekStart: string): EditorForm {
  return {
    cell_id: day.cell?.id ?? null,
    user_id: row.user_id,
    employee_name: row.employee_name,
    week_start: weekStart,
    weekday: day.weekday,
    day_label: day.label,
    day_date: day.date,
    morning_start: day.cell?.morning_start ?? "",
    morning_end: day.cell?.morning_end ?? "",
    break_minutes: String(day.cell?.break_minutes ?? 0),
    evening_start: day.cell?.evening_start ?? "",
    evening_end: day.cell?.evening_end ?? "",
    is_day_off: day.cell?.is_day_off ?? false,
    weekly_target_minutes: String(row.weekly_target_minutes ?? 0),
    position: row.position,
    comment: day.cell?.comment ?? row.comment ?? "",
  };
}

function DayCellCard({
  row,
  day,
  canEdit,
  onOpen,
}: {
  row: PlanningRow;
  day: PlanningRowDay;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const cell = day.cell;
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground/55">{new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</p>
        {cell?.is_day_off ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300">REPOS</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{minutesToLabel(day.total_minutes)}</span>}
      </div>
      <div className="mt-2 grid gap-1 text-xs text-foreground/60">
        {cell?.is_day_off ? (
          <p>Repos</p>
        ) : cell ? (
          <>
            <p>Matin: {timeRangeLabel(cell.morning_start, cell.morning_end)}</p>
            <p>Pause: {cell.break_minutes} min</p>
            <p>Soir: {timeRangeLabel(cell.evening_start, cell.evening_end)}</p>
          </>
        ) : (
          <p>{canEdit ? "Cliquer pour saisir" : "Aucun créneau"}</p>
        )}
      </div>
    </>
  );

  if (!canEdit) {
    return <div className="rounded-md border border-border bg-background p-3">{content}</div>;
  }

  return (
    <button type="button" onClick={onOpen} className="w-full rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50">
      {content}
      {cell && !cell.is_day_off ? <p className="mt-2 text-xs font-medium text-foreground">Total jour: {minutesToLabel(day.total_minutes)}</p> : null}
      {row.comment && !cell ? <p className="mt-2 text-xs text-foreground/45">{row.comment}</p> : null}
    </button>
  );
}

function EditorPanel({
  form,
  setForm,
  saving,
  onCancel,
  onSave,
}: {
  form: EditorForm;
  setForm: (value: EditorForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Modifier le créneau</h2>
          <p className="text-sm text-foreground/55">{form.employee_name} - {form.day_label}</p>
        </div>
        <Button variant="secondary" size="icon" onClick={onCancel} aria-label="Fermer">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">Poste</span>
          <input className="h-10 rounded-md border border-border bg-background px-3" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">Objectif hebdomadaire en minutes</span>
          <input className="h-10 rounded-md border border-border bg-background px-3" type="number" min={0} value={form.weekly_target_minutes} onChange={(event) => setForm({ ...form, weekly_target_minutes: event.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_day_off} onChange={(event) => setForm({ ...form, is_day_off: event.target.checked })} />
          Jour de repos
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TimeField label="Matin début" value={form.morning_start} onChange={(value) => setForm({ ...form, morning_start: value })} disabled={form.is_day_off} />
          <TimeField label="Matin fin" value={form.morning_end} onChange={(value) => setForm({ ...form, morning_end: value })} disabled={form.is_day_off} />
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-foreground/55">Pause en minutes</span>
            <input className="h-10 rounded-md border border-border bg-background px-3" type="number" min={0} value={form.break_minutes} onChange={(event) => setForm({ ...form, break_minutes: event.target.value })} disabled={form.is_day_off} />
          </label>
          <TimeField label="Soir début" value={form.evening_start} onChange={(value) => setForm({ ...form, evening_start: value })} disabled={form.is_day_off} />
          <TimeField label="Soir fin" value={form.evening_end} onChange={(value) => setForm({ ...form, evening_end: value })} disabled={form.is_day_off} />
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">Commentaire</span>
          <textarea className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
        </label>
      </div>

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Fermer
        </Button>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-foreground/55">{label}</span>
      <input className="h-10 rounded-md border border-border bg-background px-3" type="time" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </label>
  );
}

function EmptyEditor() {
  return (
    <div className="grid min-h-[380px] place-items-center text-center">
      <div className="space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <SquarePen className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Sélectionnez une cellule</p>
        <p className="text-sm text-foreground/55">Cliquez sur un créneau pour modifier le planning.</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 text-sm text-foreground/55">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement du planning
      </div>
    </Card>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground/55">{children}</th>;
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-border px-3 py-3", className)}>{children}</td>;
}
