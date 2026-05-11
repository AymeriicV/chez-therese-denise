"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Check, ClipboardCheck, Loader2, Pencil, Plus, Save, X, XCircle } from "lucide-react";
import { QualityNav } from "@/components/quality/quality-nav";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type HaccpTask = {
  id: string;
  title: string;
  category: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "AFTER_SERVICE" | "ON_DEMAND";
  status: "TODO" | "DONE" | "NON_COMPLIANT";
  display_status: "TODO" | "DONE" | "NON_COMPLIANT" | "EN_RETARD";
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  corrective_action: string | null;
  notes: string | null;
  scheduled_for_date: string | null;
  scheduled_service: "MIDI" | "SOIR" | null;
  is_archived: boolean;
  validations: Array<{
    id: string;
    responsible: string;
    completed_at: string;
    comment: string | null;
    corrective_action: string | null;
    status: "DONE" | "NON_COMPLIANT";
  }>;
};

type FormState = {
  title: string;
  category: string;
  frequency: HaccpTask["frequency"];
  due_at: string;
  notes: string;
};

const emptyForm: FormState = { title: "", category: "Nettoyage", frequency: "ON_DEMAND", due_at: "", notes: "" };
const frequencyLabels = { DAILY: "Quotidien", WEEKLY: "Hebdomadaire", MONTHLY: "Mensuel", AFTER_SERVICE: "Après service", ON_DEMAND: "À la demande" };
const statusLabels = { TODO: "À faire", DONE: "Fait", NON_COMPLIANT: "Non conforme", EN_RETARD: "En retard" };

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function HaccpClient() {
  const [todayTasks, setTodayTasks] = useState<HaccpTask[]>([]);
  const [historyTasks, setHistoryTasks] = useState<HaccpTask[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [targetDate, setTargetDate] = useState(todayInputValue());
  const [form, setForm] = useState<FormState>(emptyForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [responsible, setResponsible] = useState("Aymeric Admin");
  const [comment, setComment] = useState("");
  const [showSubCategories, setShowSubCategories] = useState(false);

  const selected = useMemo(
    () => [...todayTasks, ...historyTasks].find((task) => task.id === selectedId) ?? todayTasks[0] ?? historyTasks[0] ?? null,
    [todayTasks, historyTasks, selectedId],
  );
  const counts = useMemo(
    () => ({
      todo: todayTasks.filter((task) => task.display_status === "TODO").length,
      done: todayTasks.filter((task) => task.display_status === "DONE").length,
      late: todayTasks.filter((task) => task.display_status === "EN_RETARD").length,
      nonCompliant: todayTasks.filter((task) => task.display_status === "NON_COMPLIANT").length,
    }),
    [todayTasks],
  );

  useEffect(() => {
    void loadTasks();
  }, [showArchived, targetDate]);

  async function loadTasks(nextSelectedId?: string) {
    setLoading(true);
    setError("");
    try {
      const [todayData, historyData] = await Promise.all([
        apiRequest<HaccpTask[]>(`/quality/haccp/tasks?scope=today&target_date=${targetDate}${showArchived ? "&include_archived=true" : ""}`),
        apiRequest<HaccpTask[]>(`/quality/haccp/tasks?scope=history&target_date=${targetDate}${showArchived ? "&include_archived=true" : ""}`),
      ]);
      setTodayTasks(todayData);
      setHistoryTasks(historyData.slice(0, 20));
      setSelectedId(nextSelectedId ?? todayData[0]?.id ?? historyData[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setForm({ ...emptyForm, due_at: `${targetDate}T18:00` });
    setMode("create");
    setSuccess("");
  }

  function startEdit(task: HaccpTask) {
    setForm({
      title: task.title,
      category: task.category,
      frequency: task.frequency,
      due_at: task.due_at ? task.due_at.slice(0, 16) : "",
      notes: task.notes ?? "",
    });
    setSelectedId(task.id);
    setMode("edit");
    setSuccess("");
  }

  async function saveTask() {
    setError("");
    setSuccess("");
    if (!form.title.trim() || !form.category.trim()) {
      setError("Titre et catégorie sont obligatoires.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = mode === "edit" && selected;
      const saved = await apiRequest<HaccpTask>(isEdit ? `/quality/haccp/tasks/${selected.id}` : "/quality/haccp/tasks", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category.trim(),
          frequency: form.frequency,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          notes: form.notes || null,
        }),
      });
      setMode("idle");
      setSuccess(isEdit ? "Contrôle mis à jour." : "Contrôle créé.");
      await loadTasks(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(task: HaccpTask, status: "DONE" | "NON_COMPLIANT") {
    setSaving(true);
    setError("");
    setSuccess("");
    const correctiveAction = status === "NON_COMPLIANT" ? window.prompt("Action corrective obligatoire") : null;
    if (status === "NON_COMPLIANT" && !correctiveAction?.trim()) {
      setSaving(false);
      setError("Une action corrective est obligatoire pour une non-conformité.");
      return;
    }
    if (!responsible.trim()) {
      setSaving(false);
      setError("Le responsable est obligatoire.");
      return;
    }
    try {
      const updated = await apiRequest<HaccpTask>(`/quality/haccp/tasks/${task.id}/validations`, {
        method: "POST",
        body: JSON.stringify({
          status,
          responsible: responsible.trim(),
          comment: comment || null,
          corrective_action: correctiveAction,
        }),
      });
      setComment("");
      setSuccess(status === "DONE" ? "Tâche validée." : "Non-conformité enregistrée.");
      await loadTasks(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archive(task: HaccpTask) {
    if (!window.confirm(`Archiver le contrôle "${task.title}" ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest<HaccpTask>(`/quality/haccp/tasks/${task.id}`, { method: "DELETE" });
      setSuccess("Contrôle archivé.");
      await loadTasks();
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
            <p className="text-sm text-foreground/55">Module qualité organisé par catégories avec récurrence automatique</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">HACCP / Qualité</h1>
          </div>
          <Button onClick={startCreate}><Plus className="h-4 w-4" />Contrôle manuel</Button>
        </section>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-foreground/55">Qualité / HACCP</p>
              <h2 className="text-base font-semibold">Catégories</h2>
            </div>
            <Button variant="secondary" onClick={() => setShowSubCategories((current) => !current)}>
              {showSubCategories ? "Masquer" : "Afficher"}
            </Button>
          </div>
          {showSubCategories ? <div className="mt-4"><QualityNav active="cleaning" compact /></div> : null}
        </Card>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="À faire aujourd'hui" value={String(counts.todo)} />
          <Metric label="Faites aujourd'hui" value={String(counts.done)} />
          <Metric label="En retard" value={String(counts.late)} />
          <Metric label="Non conformes" value={String(counts.nonCompliant)} />
        </section>

        <Card className="p-4">
          <div className="grid gap-3 lg:grid-cols-[180px_1fr_1fr]">
            <Input label="Date affichée" value={targetDate} type="date" onChange={setTargetDate} />
            <Input label="Responsable" value={responsible} onChange={setResponsible} />
            <Input label="Commentaire de réalisation" value={comment} onChange={setComment} />
          </div>
        </Card>

        {mode !== "idle" ? <Editor form={form} setForm={setForm} saving={saving} onCancel={() => setMode("idle")} onSave={saveTask} /> : null}

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div>
                <h2 className="text-base font-semibold">Nettoyage du jour</h2>
                <p className="text-xs text-foreground/55">Les tâches récurrentes sont générées automatiquement pour la date choisie.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Archivés
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des tâches du jour" /> : null}
              {!loading && todayTasks.length === 0 ? <StateLine text="Aucune tâche de nettoyage prévue pour cette date." loading={false} /> : null}
              {todayTasks.map((task) => (
                <div key={task.id} className={cn("grid gap-3 px-4 py-4 sm:grid-cols-[1fr_130px_190px] sm:items-center", selected?.id === task.id && "bg-muted")}>
                  <button className="flex min-w-0 gap-3 text-left" onClick={() => setSelectedId(task.id)}>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", task.display_status === "NON_COMPLIANT" && "bg-foreground text-background")}>
                      <ClipboardCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="truncate text-xs text-foreground/55">
                        {frequencyLabels[task.frequency]}
                        {task.scheduled_service ? ` - service ${task.scheduled_service === "MIDI" ? "midi" : "soir"}` : ""}
                      </p>
                    </div>
                  </button>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/70">{statusLabels[task.display_status]}</span>
                  <div className="flex gap-2 sm:justify-end">
                    <Button variant="secondary" size="icon" aria-label="Valider" disabled={saving || task.is_archived} onClick={() => updateStatus(task, "DONE")}><Check className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Non conforme" disabled={saving || task.is_archived} onClick={() => updateStatus(task, "NON_COMPLIANT")}><XCircle className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Modifier" disabled={saving || task.is_archived} onClick={() => startEdit(task)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Archiver" disabled={saving || task.is_archived} onClick={() => archive(task)}><Archive className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            {selected ? (
              <div id="historique-controles">
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="mt-2 text-sm text-foreground/55">{selected.category} - {statusLabels[selected.display_status]}</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Metric label="Fréquence" value={frequencyLabels[selected.frequency]} />
                  <Metric label="Échéance" value={selected.due_at ? new Date(selected.due_at).toLocaleString("fr-FR") : "Non définie"} />
                </div>
                <p className="mt-4 rounded-md bg-muted px-3 py-3 text-sm text-foreground/65">{selected.corrective_action || selected.notes || "Aucune note."}</p>
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold">Historique des validations</h3>
                  {selected.validations.length === 0 ? <p className="text-sm text-foreground/55">Aucune validation enregistrée.</p> : null}
                  {selected.validations.slice(0, 6).map((validation) => (
                    <div key={validation.id} className="rounded-md bg-muted px-3 py-2 text-sm">
                      <p className="font-medium">{validation.responsible} - {validation.status === "DONE" ? "fait" : "non conforme"}</p>
                      <p className="text-xs text-foreground/55">{new Date(validation.completed_at).toLocaleString("fr-FR")}</p>
                      {validation.comment ? <p className="mt-1 text-xs">{validation.comment}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-foreground/55">Sélectionnez une tâche du jour.</p>}
          </Card>
        </section>

        <Card className="overflow-hidden">
          <div className="border-b border-border p-3">
            <h2 className="text-base font-semibold">Historique / contrôles</h2>
            <p className="text-xs text-foreground/55">Les jours précédents restent disponibles séparément des tâches du jour.</p>
          </div>
          <div className="divide-y divide-border">
            {historyTasks.length === 0 ? <StateLine text="Aucun historique disponible avant cette date." loading={false} /> : null}
            {historyTasks.map((task) => (
              <button key={task.id} className="grid w-full gap-2 px-4 py-3 text-left sm:grid-cols-[1fr_120px_180px] sm:items-center" onClick={() => setSelectedId(task.id)}>
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-foreground/55">
                    {task.scheduled_for_date ? new Date(task.scheduled_for_date).toLocaleDateString("fr-FR") : "Sans date"}
                    {task.scheduled_service ? ` - ${task.scheduled_service === "MIDI" ? "midi" : "soir"}` : ""}
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/70">{statusLabels[task.display_status]}</span>
                <span className="text-xs text-foreground/55">{task.completed_by || "Aucun responsable"}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Editor({ form, setForm, saving, onCancel, onSave }: { form: FormState; setForm: (form: FormState) => void; saving: boolean; onCancel: () => void; onSave: () => void }) {
  function setField(field: keyof FormState, value: string) {
    setForm({ ...form, [field]: value });
  }
  return (
    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_160px_150px_190px]">
        <Input label="Titre" value={form.title} onChange={(value) => setField("title", value)} />
        <Input label="Catégorie" value={form.category} onChange={(value) => setField("category", value)} />
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-foreground/55">Fréquence</span>
          <select className="h-10 rounded-md border border-border bg-background px-3 outline-none" value={form.frequency} onChange={(event) => setField("frequency", event.target.value as HaccpTask["frequency"])}>
            {Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <Input label="Échéance" value={form.due_at} type="datetime-local" onChange={(value) => setField("due_at", value)} />
      </div>
      <div className="mt-3"><Input label="Notes" value={form.notes} onChange={(value) => setField("notes", value)} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}><X className="h-4 w-4" />Annuler</Button>
        <Button onClick={onSave} disabled={saving || !form.title}><Save className="h-4 w-4" />Enregistrer</Button>
      </div>
    </Card>
  );
}

function Input({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs text-foreground/55">{label}</span>
      <input className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-foreground" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted px-3 py-3"><p className="text-xs text-foreground/55">{label}</p><p className="mt-1 truncate text-base font-semibold">{value}</p></div>;
}

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{text}</div>;
}
