"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint, getSessionRole } from "@/lib/api";
import { cn } from "@/lib/utils";

type Shift = {
  id: string;
  user_id: string;
  employee_name: string;
  employee_email: string;
  role: string | null;
  position: string;
  phone: string | null;
  start_at: string;
  end_at: string;
  break_minutes: number;
  comment: string | null;
  duration_minutes: number;
  is_archived: boolean;
  archived_at: string | null;
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  is_active: boolean;
};

type PlanningResponse = {
  view: "day" | "week";
  start_date: string;
  end_date: string;
  shifts: Shift[];
};

type FormState = {
  user_id: string;
  start_at: string;
  end_at: string;
  break_minutes: string;
  position: string;
  comment: string;
};

const emptyForm: FormState = {
  user_id: "",
  start_at: "",
  end_at: "",
  break_minutes: "0",
  position: "",
  comment: "",
};

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export function PlanningClient() {
  const [planning, setPlanning] = useState<PlanningResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [mode, setMode] = useState<"day" | "week">("week");
  const [targetDate, setTargetDate] = useState(todayValue());
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editorMode, setEditorMode] = useState<"idle" | "create" | "edit">("idle");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const role = getSessionRole();
  const canWrite = role === "OWNER";
  const grouped = useMemo(() => groupShifts(planning?.shifts ?? []), [planning]);
  const selected = planning?.shifts.find((shift) => shift.id === selectedId) ?? planning?.shifts[0] ?? null;

  useEffect(() => {
    void loadData();
  }, [mode, targetDate, showArchived]);

  async function loadData(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const [planningData, employeeData] = await Promise.all([
        apiRequest<PlanningResponse>(`/planning?view=${mode}&target_date=${targetDate}${showArchived ? "&include_archived=true" : ""}`),
        canWrite ? apiRequest<Employee[]>("/team/employees") : Promise.resolve([]),
      ]);
      setPlanning(planningData);
      setEmployees(employeeData);
      setSelectedId(selectId ?? planningData.shifts[0]?.id ?? "");
      if (canWrite && employeeData[0]) {
        setForm((current) => ({
          ...current,
          user_id: current.user_id || employeeData[0].id,
          position: current.position || employeeData[0].position,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    const firstEmployee = employees[0];
    setForm({
      ...emptyForm,
      user_id: firstEmployee?.id ?? "",
      position: firstEmployee?.position ?? "",
      start_at: `${targetDate}T09:00`,
      end_at: `${targetDate}T17:00`,
    });
    setEditorMode("create");
    setSuccess("");
  }

  function startEdit(shift: Shift) {
    setForm({
      user_id: shift.user_id,
      start_at: shift.start_at.slice(0, 16),
      end_at: shift.end_at.slice(0, 16),
      break_minutes: String(shift.break_minutes),
      position: shift.position,
      comment: shift.comment ?? "",
    });
    setSelectedId(shift.id);
    setEditorMode("edit");
    setSuccess("");
  }

  async function saveShift() {
    setError("");
    setSuccess("");
    if (!form.user_id || !form.start_at || !form.end_at || !form.position.trim()) {
      setError("Employé, début, fin et poste sont obligatoires.");
      return;
    }
    if (new Date(form.end_at) <= new Date(form.start_at)) {
      setError("La fin doit être après le début.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = editorMode === "edit" && Boolean(selected);
      const saved = await apiRequest<Shift>(isEdit ? `/planning/${selected!.id}` : "/planning", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          user_id: form.user_id,
          start_at: new Date(form.start_at).toISOString(),
          end_at: new Date(form.end_at).toISOString(),
          break_minutes: Number(form.break_minutes || 0),
          position: form.position.trim(),
          comment: form.comment || null,
        }),
      });
      setPlanning((current) => {
        const shifts = current?.shifts ?? [];
        const updated = shifts.some((shift) => shift.id === saved.id)
          ? shifts.map((shift) => (shift.id === saved.id ? saved : shift))
          : [saved, ...shifts];
        return current ? { ...current, shifts: updated } : { view: mode, start_date: "", end_date: "", shifts: updated };
      });
      setSelectedId(saved.id);
      setEditorMode("idle");
      setSuccess(isEdit ? "Shift mis à jour." : "Shift créé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archiveShift() {
    if (!selected) return;
    if (!window.confirm(`Archiver le shift de ${selected.employee_name} ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const archived = await apiRequest<Shift>(`/planning/${selected.id}`, { method: "DELETE" });
      setPlanning((current) => {
        const shifts = (current?.shifts ?? []).map((shift) => (shift.id === archived.id ? archived : shift));
        return current ? { ...current, shifts: showArchived ? shifts : shifts.filter((shift) => !shift.is_archived) } : current;
      });
      setEditorMode("idle");
      setSuccess("Shift archivé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archivage impossible");
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
            <p className="text-sm text-foreground/55">Planning de service et affectation des équipes</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Planning</h1>
          </div>
          {canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Créer un shift
            </Button>
          ) : null}
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <button type="button" className={cn("rounded-md border border-border bg-background p-3 text-left", mode === "day" && "bg-muted")} onClick={() => setMode("day")}>
            <p className="text-sm font-semibold">Vue jour</p>
            <p className="text-xs text-foreground/55">Focus sur une seule date</p>
          </button>
          <button type="button" className={cn("rounded-md border border-border bg-background p-3 text-left", mode === "week" && "bg-muted")} onClick={() => setMode("week")}>
            <p className="text-sm font-semibold">Vue semaine</p>
            <p className="text-xs text-foreground/55">Aperçu complet des shifts</p>
          </button>
          <label className="grid gap-1 rounded-md border border-border bg-background p-3 text-sm">
            <span className="text-xs text-foreground/55">Date de référence</span>
            <input className="h-10 rounded-md border border-border bg-background px-3" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </label>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div>
                <h2 className="text-base font-semibold">{mode === "day" ? "Shifts du jour" : "Shifts de la semaine"}</h2>
                <p className="text-xs text-foreground/55">Les employés voient seulement leurs créneaux.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Archivés
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement du planning" /> : null}
              {!loading && grouped.length === 0 ? <StateLine text="Aucun shift sur cette période." /> : null}
              {grouped.map((group) => (
                <div key={group.day} className="px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-foreground/55">{group.label}</p>
                  <div className="mt-2 space-y-2">
                    {group.items.map((shift) => (
                      <button
                        key={shift.id}
                        className={cn("flex w-full items-start justify-between gap-3 rounded-md bg-muted px-3 py-3 text-left", selected?.id === shift.id && "bg-foreground text-background")}
                        onClick={() => {
                          setSelectedId(shift.id);
                          if (canWrite) {
                            startEdit(shift);
                          }
                        }}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{shift.employee_name}</p>
                          <p className="text-xs opacity-70">{shift.position} - {new Date(shift.start_at).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} → {new Date(shift.end_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                          {shift.comment ? <p className="mt-1 text-xs opacity-70">{shift.comment}</p> : null}
                        </div>
                        <span className="rounded-md bg-background/80 px-2 py-1 text-xs text-foreground">{shift.duration_minutes} min</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {canWrite ? (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{editorMode === "edit" ? "Modifier le shift" : "Créer un shift"}</h2>
                  <p className="text-sm text-foreground/55">Réservation horaire, pause et poste.</p>
                </div>
                {editorMode === "edit" ? <Button variant="secondary" size="icon" onClick={() => { setSelectedId(""); setEditorMode("idle"); }}><X className="h-4 w-4" /></Button> : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-xs text-foreground/55">Employé</span>
                  <select className="h-10 rounded-md border border-border bg-background px-3" value={form.user_id} onChange={(event) => {
                    const employee = employees.find((item) => item.id === event.target.value);
                    setForm((current) => ({ ...current, user_id: event.target.value, position: employee?.position ?? current.position }));
                  }}>
                    <option value="">Sélectionner</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>
                    ))}
                  </select>
                </label>
                <Field label="Début" type="datetime-local" value={form.start_at} onChange={(value) => setForm({ ...form, start_at: value })} />
                <Field label="Fin" type="datetime-local" value={form.end_at} onChange={(value) => setForm({ ...form, end_at: value })} />
                <Field label="Pause (min)" type="number" value={form.break_minutes} onChange={(value) => setForm({ ...form, break_minutes: value })} />
                <Field label="Poste" value={form.position} onChange={(value) => setForm({ ...form, position: value })} />
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-xs text-foreground/55">Commentaire</span>
                  <textarea className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={saveShift} disabled={saving}><Save className="h-4 w-4" />{saving ? "Enregistrement..." : "Enregistrer"}</Button>
                {editorMode === "edit" ? <Button variant="secondary" onClick={archiveShift} disabled={saving}><Trash2 className="h-4 w-4" />Archiver</Button> : null}
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <h2 className="text-lg font-semibold">Vue employé</h2>
              <p className="mt-2 text-sm text-foreground/55">Les employés consultent uniquement leurs shifts. La modification reste réservée à l'OWNER.</p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
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

function groupShifts(shifts: Shift[]) {
  const groups = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const day = shift.start_at.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), shift]);
  }
  return [...groups.entries()].map(([day, items]) => ({
    day,
    label: new Date(`${day}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }),
    items,
  }));
}
