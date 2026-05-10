"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Archive, Loader2, Plus, Save, Search, Users, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint, getSessionRole } from "@/lib/api";
import { cn } from "@/lib/utils";

type Employee = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "CHEF" | "EMPLOYEE";
  position: string;
  phone: string | null;
  is_active: boolean;
  archived_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

type EmployeeForm = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Employee["role"];
  position: string;
  phone: string;
};

const emptyForm: EmployeeForm = {
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  role: "EMPLOYEE",
  position: "",
  phone: "",
};

export function TeamClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const role = getSessionRole();
  const canWrite = role === "OWNER" || role === "ADMIN";

  const filtered = useMemo(
    () => employees.filter((employee) => `${employee.first_name} ${employee.last_name} ${employee.position} ${employee.email}`.toLowerCase().includes(query.toLowerCase())),
    [employees, query],
  );
  const selected = employees.find((employee) => employee.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    void loadEmployees();
  }, [showArchived]);

  async function loadEmployees(selectId?: string) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<Employee[]>(`/team/employees${showArchived ? "?include_archived=true" : ""}`);
      setEmployees(data);
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

  function startEdit(employee: Employee) {
    setForm({
      email: employee.email,
      password: "",
      first_name: employee.first_name,
      last_name: employee.last_name,
      role: employee.role,
      position: employee.position,
      phone: employee.phone ?? "",
    });
    setSelectedId(employee.id);
    setMode("edit");
    setSuccess("");
  }

  async function saveEmployee() {
    setError("");
    setSuccess("");
    if (!form.email.trim() || !form.first_name.trim() || !form.last_name.trim() || !form.position.trim()) {
      setError("Email, prénom, nom et poste sont obligatoires.");
      return;
    }
    if (mode === "create" && !form.password.trim()) {
      setError("Le mot de passe initial est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = mode === "edit" && selected;
      const payload: Record<string, unknown> = {
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
        position: form.position.trim(),
        phone: form.phone.trim() || null,
      };
      if (form.password.trim()) payload.password = form.password.trim();
      const saved = await apiRequest<Employee>(isEdit ? `/team/employees/${selected.id}` : "/team/employees", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setEmployees((current) => current.some((employee) => employee.id === saved.id) ? current.map((employee) => employee.id === saved.id ? saved : employee) : [saved, ...current]);
      setSelectedId(saved.id);
      setMode("idle");
      setSuccess(isEdit ? "Employé mis à jour." : "Employé créé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archiveEmployee() {
    if (!selected) return;
    if (!window.confirm(`Archiver ${selected.first_name} ${selected.last_name} ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const archived = await apiRequest<Employee>(`/team/employees/${selected.id}`, { method: "DELETE" });
      setEmployees((current) => {
        const updated = current.map((employee) => (employee.id === archived.id ? archived : employee));
        return showArchived ? updated : updated.filter((employee) => employee.is_active);
      });
      setSuccess("Employé archivé.");
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
            <p className="text-sm text-foreground/55">Accès équipe, rôles et comptes personnels</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Équipe</h1>
          </div>
          {canWrite ? (
            <Button onClick={startCreate}>
              <Plus className="h-4 w-4" />
              Créer un employé
            </Button>
          ) : null}
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="flex h-10 items-center gap-2 rounded-md bg-muted px-3">
                <Search className="h-4 w-4 text-foreground/45" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un employé" />
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Afficher les archivés
              </label>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="Chargement des employés" /> : null}
              {!loading && filtered.length === 0 ? <StateLine icon={<Users className="h-4 w-4" />} text="Aucun employé" /> : null}
              {filtered.map((employee) => (
                <button
                  key={employee.id}
                  className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted", employee.id === selected?.id && "bg-muted")}
                  onClick={() => {
                    setSelectedId(employee.id);
                    setMode("idle");
                  }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background shadow-hairline">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{employee.first_name} {employee.last_name}</p>
                    <p className="truncate text-xs text-foreground/55">{employee.position} - {employee.email}</p>
                  </div>
                  <span className={cn("rounded-md px-2 py-1 text-xs", employee.is_active ? "bg-foreground text-background" : "bg-muted text-foreground/55")}>{employee.is_active ? employee.role : "Archivé"}</span>
                </button>
              ))}
            </div>
          </Card>

          {mode === "create" || mode === "edit" ? (
            <Editor
              form={form}
              setForm={setForm}
              saving={saving}
              onCancel={() => setMode("idle")}
              onSave={saveEmployee}
              isEdit={mode === "edit"}
            />
          ) : selected ? (
            <Detail employee={selected} saving={saving} canWrite={canWrite} onEdit={() => startEdit(selected)} onArchive={archiveEmployee} />
          ) : (
            <Card className="p-5">
              <p className="text-sm text-foreground/55">Sélectionnez ou créez un employé.</p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Editor({
  form,
  setForm,
  saving,
  onCancel,
  onSave,
  isEdit,
}: {
  form: EmployeeForm;
  setForm: (value: EmployeeForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => Promise<void>;
  isEdit: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{isEdit ? "Modifier l'employé" : "Créer un employé"}</h2>
          <p className="text-sm text-foreground/55">Compte personnel, rôle et poste.</p>
        </div>
        <Button variant="secondary" size="icon" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <Field label="Mot de passe initial" value={form.password} type="password" onChange={(value) => setForm({ ...form, password: value })} />
        <Field label="Prénom" value={form.first_name} onChange={(value) => setForm({ ...form, first_name: value })} />
        <Field label="Nom" value={form.last_name} onChange={(value) => setForm({ ...form, last_name: value })} />
        <Field label="Poste" value={form.position} onChange={(value) => setForm({ ...form, position: value })} />
        <Field label="Téléphone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs text-foreground/55">Rôle</span>
          <select className="h-10 rounded-md border border-border bg-background px-3" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as EmployeeForm["role"] })}>
            <option value="EMPLOYEE">Employé</option>
            <option value="CHEF">Chef</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
            <option value="OWNER">OWNER</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={onSave} disabled={saving}><Save className="h-4 w-4" />{saving ? "Enregistrement..." : "Enregistrer"}</Button>
      </div>
    </Card>
  );
}

function Detail({
  employee,
  saving,
  canWrite,
  onEdit,
  onArchive,
}: {
  employee: Employee;
  saving: boolean;
  canWrite: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-foreground/55">Fiche employé</p>
          <h2 className="text-2xl font-semibold">{employee.first_name} {employee.last_name}</h2>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onEdit}>Modifier</Button>
            <Button variant="secondary" onClick={onArchive} disabled={saving}><Archive className="h-4 w-4" />Archiver</Button>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Email" value={employee.email} />
        <Info label="Rôle" value={employee.role} />
        <Info label="Poste" value={employee.position} />
        <Info label="Téléphone" value={employee.phone ?? "Non renseigné"} />
        <Info label="Statut" value={employee.is_active ? "Actif" : "Archivé"} />
        <Info label="Dernière connexion" value={employee.last_login_at ? new Date(employee.last_login_at).toLocaleString("fr-FR") : "Jamais"} />
      </div>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="text-xs text-foreground/55">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function StateLine({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">
      {icon}
      <span>{text}</span>
    </div>
  );
}
