"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Check, ClipboardCheck, Loader2, Pencil, Plus, Save, X, XCircle } from "lucide-react";
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
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND";
  status: "TODO" | "DONE" | "NON_COMPLIANT";
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  corrective_action: string | null;
  notes: string | null;
  is_archived: boolean;
};

type FormState = {
  title: string;
  category: string;
  frequency: HaccpTask["frequency"];
  due_at: string;
  notes: string;
};

const emptyForm: FormState = { title: "", category: "Nettoyage", frequency: "DAILY", due_at: "", notes: "" };
const frequencyLabels = { DAILY: "Quotidien", WEEKLY: "Hebdomadaire", MONTHLY: "Mensuel", ON_DEMAND: "À la demande" };
const statusLabels = { TODO: "À faire", DONE: "Fait", NON_COMPLIANT: "Non conforme" };

export function HaccpClient() {
  const [tasks, setTasks] = useState<HaccpTask[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null;
  const activeTasks = useMemo(() => tasks.filter((task) => !task.is_archived), [tasks]);

  useEffect(() => {
    void loadTasks();
  }, [showArchived]);

  async function loadTasks(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<HaccpTask[]>(`/quality/haccp/tasks${showArchived ? "?include_archived=true" : ""}`);
      setTasks(data);
      setSelectedId(selectId ?? data[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setForm(emptyForm);
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
    const payload = {
      title: form.title.trim(),
      category: form.category.trim(),
      frequency: form.frequency,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      notes: form.notes || null,
    };
    try {
      const isEdit = mode === "edit" && selected;
      const saved = await apiRequest<HaccpTask>(isEdit ? `/quality/haccp/tasks/${selected.id}` : "/quality/haccp/tasks", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setTasks((current) => current.some((task) => task.id === saved.id) ? current.map((task) => task.id === saved.id ? saved : task) : [saved, ...current]);
      setSelectedId(saved.id);
      setMode("idle");
      setSuccess(isEdit ? "Contrôle mis à jour." : "Contrôle créé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(task: HaccpTask, status: HaccpTask["status"]) {
    setSaving(true);
    setError("");
    setSuccess("");
    const correctiveAction = status === "NON_COMPLIANT" ? window.prompt("Action corrective obligatoire") : null;
    if (status === "NON_COMPLIANT" && !correctiveAction?.trim()) {
      setSaving(false);
      setError("Une action corrective est obligatoire pour une non-conformité.");
      return;
    }
    try {
      const updated = await apiRequest<HaccpTask>(`/quality/haccp/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, corrective_action: correctiveAction }),
      });
      setTasks((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess(status === "DONE" ? "Contrôle validé." : "Non-conformité enregistrée.");
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
      const archived = await apiRequest<HaccpTask>(`/quality/haccp/tasks/${task.id}`, { method: "DELETE" });
      setTasks((current) => {
        const updated = current.map((entry) => entry.id === archived.id ? archived : entry);
        return showArchived ? updated : updated.filter((entry) => !entry.is_archived);
      });
      setSelectedId((current) => current === archived.id ? "" : current);
      setSuccess("Contrôle archivé.");
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
            <p className="text-sm text-foreground/55">Plan de maîtrise sanitaire, contrôles et actions correctives</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">HACCP / PMS</h1>
          </div>
          <Button onClick={startCreate}><Plus className="h-4 w-4" />Contrôle</Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="À faire" value={String(activeTasks.filter((task) => task.status === "TODO").length)} />
          <Metric label="Validés" value={String(activeTasks.filter((task) => task.status === "DONE").length)} />
          <Metric label="Non conformes" value={String(activeTasks.filter((task) => task.status === "NON_COMPLIANT").length)} />
        </section>

        {mode !== "idle" ? <Editor form={form} setForm={setForm} saving={saving} onCancel={() => setMode("idle")} onSave={saveTask} /> : null}

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Afficher les archivés
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des contrôles" /> : null}
              {!loading && tasks.length === 0 ? <StateLine text="Aucun contrôle HACCP" loading={false} /> : null}
              {tasks.map((task) => (
                <div key={task.id} className={cn("grid gap-3 px-4 py-4 sm:grid-cols-[1fr_160px_190px] sm:items-center", selected?.id === task.id && "bg-muted")}>
                  <button className="flex min-w-0 gap-3 text-left" onClick={() => setSelectedId(task.id)}>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", task.status === "NON_COMPLIANT" && "bg-foreground text-background")}>
                      <ClipboardCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="truncate text-xs text-foreground/55">{task.category} - {frequencyLabels[task.frequency]}</p>
                    </div>
                  </button>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/70">{statusLabels[task.status]}</span>
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
              <div>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="mt-2 text-sm text-foreground/55">{selected.category} - {statusLabels[selected.status]}</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Metric label="Fréquence" value={frequencyLabels[selected.frequency]} />
                  <Metric label="Échéance" value={selected.due_at ? new Date(selected.due_at).toLocaleString("fr-FR") : "Non définie"} />
                </div>
                <p className="mt-4 rounded-md bg-muted px-3 py-3 text-sm text-foreground/65">{selected.corrective_action || selected.notes || "Aucune note."}</p>
              </div>
            ) : <p className="text-sm text-foreground/55">Sélectionnez un contrôle.</p>}
          </Card>
        </section>
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
          <select className="h-10 rounded-md border border-border bg-background px-3 outline-none" value={form.frequency} onChange={(event) => setField("frequency", event.target.value)}>
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
