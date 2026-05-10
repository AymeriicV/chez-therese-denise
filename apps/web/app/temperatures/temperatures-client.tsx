"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, Save, Thermometer, XCircle } from "lucide-react";
import { QualityNav } from "@/components/quality/quality-nav";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type Equipment = { id: string; name: string; type: string; min_celsius: string | null; max_celsius: string | null; target: string };
type TemperatureLog = {
  id: string;
  equipment_id: string | null;
  equipment: string;
  value_celsius: string;
  min_celsius: string | null;
  max_celsius: string | null;
  service: "MIDI" | "SOIR" | null;
  check_date: string | null;
  recorded_at: string;
  is_compliant: boolean;
  corrective_action: string | null;
  note: string | null;
  is_archived: boolean;
};
type Slot = {
  id: string;
  equipment_id: string;
  equipment: string;
  equipment_type: string;
  day: string;
  date: string;
  service: "MIDI" | "SOIR";
  target: string;
  status: "A_FAIRE" | "FAIT" | "EN_RETARD";
  is_compliant: boolean | null;
};

type FormState = { equipment_id: string; value_celsius: string; service: "MIDI" | "SOIR"; check_date: string; corrective_action: string; note: string };

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function TemperaturesClient() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [logs, setLogs] = useState<TemperatureLog[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [targetDate, setTargetDate] = useState(todayInputValue());
  const [form, setForm] = useState<FormState>({ equipment_id: "", value_celsius: "", service: "MIDI", check_date: todayInputValue(), corrective_action: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedEquipment = equipment.find((item) => item.id === selectedEquipmentId) ?? equipment[0] ?? null;
  const selectedHistory = logs.filter((log) => log.equipment_id === selectedEquipment?.id).slice(0, 10);
  const badgeText = useMemo(() => {
    if (slots.length === 0) return "aucune prise prévue";
    return slots.every((slot) => slot.status === "FAIT" && slot.is_compliant !== false) ? "conforme" : "à suivre";
  }, [slots]);

  useEffect(() => {
    void loadData();
  }, [targetDate]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [equipmentData, logData, slotData] = await Promise.all([
        apiRequest<Equipment[]>("/quality/temperature-equipment"),
        apiRequest<TemperatureLog[]>("/quality/temperatures"),
        apiRequest<Slot[]>(`/quality/temperature-schedule?target_date=${targetDate}`),
      ]);
      setEquipment(equipmentData);
      setLogs(logData);
      setSlots(slotData);
      const first = equipmentData[0];
      setSelectedEquipmentId((current) => current || first?.id || "");
      setForm((current) => ({ ...current, equipment_id: current.equipment_id || first?.id || "", check_date: targetDate }));
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  function selectEquipment(item: Equipment) {
    setSelectedEquipmentId(item.id);
    setForm((current) => ({ ...current, equipment_id: item.id }));
    setSuccess("");
  }

  function startFromSlot(slot: Slot) {
    setSelectedEquipmentId(slot.equipment_id);
    setForm((current) => ({ ...current, equipment_id: slot.equipment_id, service: slot.service, check_date: slot.date }));
    setSuccess("");
  }

  function compliancePreview() {
    const item = equipment.find((entry) => entry.id === form.equipment_id);
    const value = Number(form.value_celsius);
    if (!item || Number.isNaN(value)) return true;
    if (item.min_celsius !== null && value < Number(item.min_celsius)) return false;
    if (item.max_celsius !== null && value > Number(item.max_celsius)) return false;
    return true;
  }

  async function saveTemperature() {
    setError("");
    setSuccess("");
    if (!form.equipment_id || !form.value_celsius || Number.isNaN(Number(form.value_celsius))) {
      setError("Sélectionnez un équipement et saisissez une température numérique.");
      return;
    }
    if (!compliancePreview() && !form.corrective_action.trim()) {
      setError("Action corrective obligatoire si la température est non conforme.");
      return;
    }
    const item = equipment.find((entry) => entry.id === form.equipment_id);
    if (!item) return;
    setSaving(true);
    try {
      await apiRequest<TemperatureLog>("/quality/temperatures", {
        method: "POST",
        body: JSON.stringify({
          equipment_id: item.id,
          equipment: item.name,
          value_celsius: form.value_celsius,
          service: form.service,
          check_date: new Date(`${form.check_date}T00:00:00`).toISOString(),
          corrective_action: form.corrective_action || null,
          note: form.note || null,
        }),
      });
      setSuccess(compliancePreview() ? "Température conforme enregistrée." : "Température non conforme enregistrée.");
      setForm((current) => ({ ...current, value_celsius: "", corrective_action: "", note: "" }));
      await loadData();
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
    try {
      await apiRequest<TemperatureLog>(`/quality/temperatures/${log.id}`, { method: "DELETE" });
      setSuccess("Relevé archivé.");
      await loadData();
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
        <section className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-foreground/55">Catégorie Températures du module Qualité / HACCP</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Températures</h1>
          </div>
        </section>

        <QualityNav compact active="temperatures" />

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 md:grid-cols-4">
          {equipment.map((item) => (
            <button key={item.id} className={cn("rounded-md bg-muted p-4 text-left", selectedEquipment?.id === item.id && "bg-foreground text-background")} onClick={() => selectEquipment(item)}>
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="mt-1 text-xs opacity-70">{item.type} - {item.target}</p>
            </button>
          ))}
        </section>

        <Card className="p-4">
          <h2 className="text-base font-semibold">Saisie rapide</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="grid gap-1 text-sm lg:col-span-2">
              <span className="text-xs text-foreground/55">Équipement</span>
              <select className="h-10 rounded-md border border-border bg-background px-3" value={form.equipment_id} onChange={(event) => setForm({ ...form, equipment_id: event.target.value })}>
                {equipment.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <Input label="Température °C" type="number" value={form.value_celsius} onChange={(value) => setForm({ ...form, value_celsius: value })} />
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-foreground/55">Service</span>
              <select className="h-10 rounded-md border border-border bg-background px-3" value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value as "MIDI" | "SOIR" })}>
                <option value="MIDI">Midi</option>
                <option value="SOIR">Soir</option>
              </select>
            </label>
            <Input label="Date" type="date" value={form.check_date} onChange={(value) => { setTargetDate(value); setForm({ ...form, check_date: value }); }} />
            <Button className="self-end" onClick={saveTemperature} disabled={saving}><Save className="h-4 w-4" />Enregistrer</Button>
          </div>
          {!compliancePreview() ? <div className="mt-3"><Input label="Action corrective obligatoire" value={form.corrective_action} onChange={(value) => setForm({ ...form, corrective_action: value })} /></div> : null}
        </Card>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <Input label="Date du planning" type="date" value={targetDate} onChange={(value) => { setTargetDate(value); setForm((current) => ({ ...current, check_date: value })); }} />
              <span className="rounded-md bg-muted px-2 py-2 text-xs">Badge HACCP : {badgeText}</span>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Chargement du planning du jour" /> : null}
              {!loading && slots.length === 0 ? <StateLine text="Aucune prise de température prévue aujourd'hui." loading={false} /> : null}
              {slots.map((slot) => (
                <button key={slot.id} className="grid w-full gap-2 px-4 py-3 text-left sm:grid-cols-[1fr_110px_110px] sm:items-center" onClick={() => startFromSlot(slot)}>
                  <div>
                    <p className="text-sm font-medium">{slot.day} {slot.service === "MIDI" ? "midi" : "soir"} - {slot.equipment}</p>
                    <p className="text-xs text-foreground/55">{slot.equipment_type} - {slot.target}</p>
                  </div>
                  <span className={cn("rounded-md px-2 py-1 text-xs", slot.status === "FAIT" ? "bg-muted" : slot.status === "EN_RETARD" ? "bg-foreground text-background" : "bg-muted")}>{slot.status === "A_FAIRE" ? "À faire" : slot.status === "EN_RETARD" ? "En retard" : "Fait"}</span>
                  <span className="text-xs text-foreground/55">{slot.is_compliant === null ? "" : slot.is_compliant ? "Conforme" : "Non conforme"}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold">Historique {selectedEquipment?.name ?? ""}</h2>
            <div className="mt-4 space-y-2">
              {selectedHistory.length === 0 ? <p className="text-sm text-foreground/55">Aucun relevé pour cet équipement.</p> : null}
              {selectedHistory.map((log) => (
                <div key={log.id} className="flex items-center gap-3 rounded-md bg-muted px-3 py-3 text-sm">
                  {log.is_compliant ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{Number(log.value_celsius).toFixed(1)} °C - {log.service ?? "hors planning"}</p>
                    <p className="text-xs text-foreground/55">{new Date(log.recorded_at).toLocaleString("fr-FR")}</p>
                  </div>
                  <Button variant="secondary" size="icon" aria-label="Archiver" disabled={saving} onClick={() => archive(log)}><Archive className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
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

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">{loading ? <Thermometer className="h-4 w-4 animate-pulse" /> : null}{text}</div>;
}
