"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, Loader2, Pencil, Plus, Save, Thermometer, X, XCircle } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type TemperatureLog = {
  id: string;
  equipment: string;
  value_celsius: string;
  min_celsius: string | null;
  max_celsius: string | null;
  recorded_at: string;
  is_compliant: boolean;
  corrective_action: string | null;
  note: string | null;
  is_archived: boolean;
};

type TemperatureForm = {
  equipment: string;
  value_celsius: string;
  min_celsius: string;
  max_celsius: string;
  corrective_action: string;
  note: string;
};

const emptyForm: TemperatureForm = {
  equipment: "",
  value_celsius: "4",
  min_celsius: "0",
  max_celsius: "4",
  corrective_action: "",
  note: "",
};

export function TemperaturesClient() {
  const [logs, setLogs] = useState<TemperatureLog[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<TemperatureForm>(emptyForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = logs.find((log) => log.id === selectedId) ?? logs[0] ?? null;
  const nonCompliant = useMemo(() => logs.filter((log) => !log.is_compliant && !log.is_archived), [logs]);

  useEffect(() => {
    void loadLogs();
  }, [showArchived]);

  async function loadLogs(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<TemperatureLog[]>(`/quality/temperatures${showArchived ? "?include_archived=true" : ""}`);
      setLogs(data);
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

  function startEdit(log: TemperatureLog) {
    setForm({
      equipment: log.equipment,
      value_celsius: String(log.value_celsius),
      min_celsius: log.min_celsius ? String(log.min_celsius) : "",
      max_celsius: log.max_celsius ? String(log.max_celsius) : "",
      corrective_action: log.corrective_action ?? "",
      note: log.note ?? "",
    });
    setSelectedId(log.id);
    setMode("edit");
    setSuccess("");
  }

  async function saveLog() {
    setError("");
    setSuccess("");
    if (!form.equipment.trim()) {
      setError("L'équipement est obligatoire.");
      return;
    }
    for (const [label, value] of [["température", form.value_celsius], ["minimum", form.min_celsius], ["maximum", form.max_celsius]]) {
      if (value && Number.isNaN(Number(value))) {
        setError(`Le champ ${label} doit être numérique.`);
        return;
      }
    }
    if (form.min_celsius && form.max_celsius && Number(form.min_celsius) > Number(form.max_celsius)) {
      setError("Le minimum doit être inférieur au maximum.");
      return;
    }
    setSaving(true);
    const payload = {
      equipment: form.equipment.trim(),
      value_celsius: form.value_celsius,
      min_celsius: form.min_celsius || null,
      max_celsius: form.max_celsius || null,
      corrective_action: form.corrective_action || null,
      note: form.note || null,
    };
    try {
      const isEdit = mode === "edit" && selected;
      const saved = await apiRequest<TemperatureLog>(isEdit ? `/quality/temperatures/${selected.id}` : "/quality/temperatures", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setLogs((current) => {
        const exists = current.some((log) => log.id === saved.id);
        return exists ? current.map((log) => (log.id === saved.id ? saved : log)) : [saved, ...current];
      });
      setSelectedId(saved.id);
      setMode("idle");
      setSuccess(saved.is_compliant ? "Relevé conforme enregistré." : "Relevé non conforme enregistré.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archive(log: TemperatureLog) {
    if (!window.confirm(`Archiver le relevé "${log.equipment}" ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const archived = await apiRequest<TemperatureLog>(`/quality/temperatures/${log.id}`, { method: "DELETE" });
      setLogs((current) => {
        const updated = current.map((entry) => (entry.id === archived.id ? archived : entry));
        return showArchived ? updated : updated.filter((entry) => !entry.is_archived);
      });
      setSelectedId((current) => (current === archived.id ? "" : current));
      setSuccess("Relevé archivé.");
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
            <p className="text-sm text-foreground/55">Froid, chaud, conformité et actions correctives</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Relevés températures</h1>
          </div>
          <Button onClick={startCreate}><Plus className="h-4 w-4" />Relevé</Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Relevés" value={String(logs.filter((log) => !log.is_archived).length)} />
          <Metric label="Non conformes" value={String(nonCompliant.length)} />
          <Metric label="Conformité" value={`${logs.length ? Math.round(((logs.length - nonCompliant.length) / logs.length) * 100) : 100}%`} />
        </section>

        {mode !== "idle" ? <Editor form={form} setForm={setForm} saving={saving} onCancel={() => setMode("idle")} onSave={saveLog} /> : null}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Afficher les archivés
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement des relevés" /> : null}
              {!loading && logs.length === 0 ? <StateLine text="Aucun relevé" loading={false} /> : null}
              {logs.map((log) => (
                <div key={log.id} className={cn("grid gap-3 px-4 py-4 sm:grid-cols-[1fr_120px_128px] sm:items-center", selected?.id === log.id && "bg-muted")}>
                  <button className="flex min-w-0 gap-3 text-left" onClick={() => setSelectedId(log.id)}>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted", !log.is_compliant && "bg-foreground text-background")}>
                      {log.is_compliant ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{log.equipment}</p>
                      <p className="truncate text-xs text-foreground/55">{new Date(log.recorded_at).toLocaleString("fr-FR")}</p>
                    </div>
                  </button>
                  <p className="text-sm font-semibold">{Number(log.value_celsius).toFixed(1)} °C</p>
                  <div className="flex gap-2 sm:justify-end">
                    <Button variant="secondary" size="icon" aria-label="Modifier" disabled={saving || log.is_archived} onClick={() => startEdit(log)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="secondary" size="icon" aria-label="Archiver" disabled={saving || log.is_archived} onClick={() => archive(log)}><Archive className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            {selected ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted"><Thermometer className="h-4 w-4" /></div>
                  <div>
                    <h2 className="text-base font-semibold">{selected.equipment}</h2>
                    <p className="text-sm text-foreground/55">{selected.is_compliant ? "Conforme" : "Non conforme"}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Metric label="Température" value={`${Number(selected.value_celsius).toFixed(1)} °C`} />
                  <Metric label="Plage cible" value={`${selected.min_celsius ?? "-"} / ${selected.max_celsius ?? "-"} °C`} />
                </div>
                <p className="mt-4 rounded-md bg-muted px-3 py-3 text-sm text-foreground/65">{selected.corrective_action || selected.note || "Aucune note."}</p>
              </>
            ) : <p className="text-sm text-foreground/55">Sélectionnez un relevé.</p>}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function Editor({ form, setForm, saving, onCancel, onSave }: { form: TemperatureForm; setForm: (form: TemperatureForm) => void; saving: boolean; onCancel: () => void; onSave: () => void }) {
  function setField(field: keyof TemperatureForm, value: string) {
    setForm({ ...form, [field]: value });
  }
  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Input label="Équipement" value={form.equipment} onChange={(value) => setField("equipment", value)} />
        <Input label="Température °C" value={form.value_celsius} type="number" onChange={(value) => setField("value_celsius", value)} />
        <Input label="Minimum °C" value={form.min_celsius} type="number" onChange={(value) => setField("min_celsius", value)} />
        <Input label="Maximum °C" value={form.max_celsius} type="number" onChange={(value) => setField("max_celsius", value)} />
        <Input label="Action corrective" value={form.corrective_action} onChange={(value) => setField("corrective_action", value)} />
        <Input label="Note" value={form.note} onChange={(value) => setField("note", value)} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}><X className="h-4 w-4" />Annuler</Button>
        <Button onClick={onSave} disabled={saving || !form.equipment}><Save className="h-4 w-4" />Enregistrer</Button>
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
  return (
    <div className="rounded-md bg-muted px-3 py-3">
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="mt-1 truncate text-base font-semibold">{value}</p>
    </div>
  );
}

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{text}</div>;
}
