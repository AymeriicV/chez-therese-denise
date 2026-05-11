"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Printer, Save, Shield, Settings as SettingsIcon, Trash2, TrendingUp, Truck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";

type SettingsSnapshot = {
  restaurant: {
    id: string;
    name: string;
    legal_name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    siret: string | null;
    vat_number: string | null;
    logo_url: string | null;
    opening_hours: Record<string, unknown>;
    timezone: string;
    currency: string;
  };
  company: {
    brand_name: string;
    invoice_email: string | null;
    haccp_manager: string | null;
  };
  settings: {
    haccp: {
      temperature_schedule: Array<{ day: string; service: string }>;
      cleaning_tasks: Array<{ title: string; frequency: string }>;
    };
    stock: {
      units: string[];
      categories: string[];
      default_reorder_point: string;
      storage_areas: string[];
    };
    invoices: {
      ocr_mode: string;
      confidence_threshold: number;
      templates: Array<unknown>;
      openai_configured: boolean;
      model: string;
    };
    price_alerts: {
      enabled: boolean;
      threshold_percent: string;
      notify_dashboard: boolean;
    };
    integrations: {
      ladition: {
        enabled: boolean;
        api_url: string;
        api_key: string;
        status: string;
      };
    };
    printers: Array<PrinterConfig>;
  };
};

type PrinterConfig = {
  id: string;
  name: string;
  type: string;
  address: string;
  format: string;
  is_default: boolean;
};

const roleMatrix = [
  { role: "OWNER", modules: "Tous les modules et toutes les corrections" },
  { role: "MANAGER", modules: "Planning, équipe, production, HACCP, stock selon besoin" },
  { role: "EMPLOYEE", modules: "Mon planning et Badgeuse uniquement" },
];

export function SettingsClient() {
  const [data, setData] = useState<SettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [restaurantName, setRestaurantName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [siret, setSiret] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [brandName, setBrandName] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [haccpManager, setHaccpManager] = useState("");
  const [temperatureSchedule, setTemperatureSchedule] = useState("");
  const [cleaningTasks, setCleaningTasks] = useState("");
  const [unitsText, setUnitsText] = useState("");
  const [categoriesText, setCategoriesText] = useState("");
  const [storageAreasText, setStorageAreasText] = useState("");
  const [defaultReorderPoint, setDefaultReorderPoint] = useState("0");
  const [ocrMode, setOcrMode] = useState("hybrid");
  const [confidenceThreshold, setConfidenceThreshold] = useState("0.75");
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(true);
  const [priceAlertThreshold, setPriceAlertThreshold] = useState("0.05");
  const [notifyDashboard, setNotifyDashboard] = useState(true);
  const [additionEnabled, setAdditionEnabled] = useState(false);
  const [additionApiUrl, setAdditionApiUrl] = useState("");
  const [additionApiKey, setAdditionApiKey] = useState("");
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const snapshot = await apiRequest<SettingsSnapshot>("/settings/company");
        if (!mounted) return;
        setData(snapshot);
        setRestaurantName(snapshot.restaurant.name ?? "");
        setLegalName(snapshot.restaurant.legal_name ?? "");
        setAddress(snapshot.restaurant.address ?? "");
        setPhone(snapshot.restaurant.phone ?? "");
        setEmail(snapshot.restaurant.email ?? "");
        setSiret(snapshot.restaurant.siret ?? "");
        setVatNumber(snapshot.restaurant.vat_number ?? "");
        setLogoUrl(snapshot.restaurant.logo_url ?? "");
        setOpeningHours(JSON.stringify(snapshot.restaurant.opening_hours ?? {}, null, 2));
        setBrandName(snapshot.company.brand_name ?? "");
        setInvoiceEmail(snapshot.company.invoice_email ?? "");
        setHaccpManager(snapshot.company.haccp_manager ?? "");
        setTemperatureSchedule(JSON.stringify(snapshot.settings.haccp.temperature_schedule ?? [], null, 2));
        setCleaningTasks(JSON.stringify(snapshot.settings.haccp.cleaning_tasks ?? [], null, 2));
        setUnitsText((snapshot.settings.stock.units ?? []).join(", "));
        setCategoriesText((snapshot.settings.stock.categories ?? []).join(", "));
        setStorageAreasText((snapshot.settings.stock.storage_areas ?? []).join(", "));
        setDefaultReorderPoint(snapshot.settings.stock.default_reorder_point ?? "0");
        setOcrMode(snapshot.settings.invoices.ocr_mode ?? "hybrid");
        setConfidenceThreshold(String(snapshot.settings.invoices.confidence_threshold ?? 0.75));
        setPriceAlertEnabled(Boolean(snapshot.settings.price_alerts.enabled));
        setPriceAlertThreshold(snapshot.settings.price_alerts.threshold_percent ?? "0.05");
        setNotifyDashboard(Boolean(snapshot.settings.price_alerts.notify_dashboard));
        setAdditionEnabled(Boolean(snapshot.settings.integrations.ladition.enabled));
        setAdditionApiUrl(snapshot.settings.integrations.ladition.api_url ?? "");
        setAdditionApiKey(snapshot.settings.integrations.ladition.api_key ?? "");
        setPrinters(snapshot.settings.printers ?? []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : authHint());
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const printerCount = useMemo(() => printers.length, [printers]);

  function addPrinter() {
    setPrinters((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: "",
        type: "navigateur",
        address: "",
        format: "80mm",
        is_default: current.length === 0,
      },
    ]);
  }

  function updatePrinter(index: number, patch: Partial<PrinterConfig>) {
    setPrinters((current) => current.map((printer, itemIndex) => (itemIndex === index ? { ...printer, ...patch } : printer)));
  }

  function removePrinter(index: number) {
    setPrinters((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        restaurant: {
          name: restaurantName.trim() || null,
          legal_name: legalName.trim() || null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          siret: siret.trim() || null,
          vat_number: vatNumber.trim() || null,
          logo_url: logoUrl.trim() || null,
          opening_hours: parseJson(openingHours, {}),
        },
        brand_name: brandName.trim() || null,
        invoice_email: invoiceEmail.trim() || null,
        haccp_manager: haccpManager.trim() || null,
        settings: {
          haccp: {
            temperature_schedule: parseJson(temperatureSchedule, []),
            cleaning_tasks: parseJson(cleaningTasks, []),
          },
          stock: {
            units: splitCsv(unitsText),
            categories: splitCsv(categoriesText),
            default_reorder_point: defaultReorderPoint || "0",
            storage_areas: splitCsv(storageAreasText),
          },
          invoices: {
            ocr_mode: ocrMode,
            confidence_threshold: Number(confidenceThreshold || "0.75"),
          },
          price_alerts: {
            enabled: priceAlertEnabled,
            threshold_percent: priceAlertThreshold || "0.05",
            notify_dashboard: notifyDashboard,
          },
          integrations: {
            ladition: {
              enabled: additionEnabled,
              api_url: additionApiUrl.trim(),
              api_key: additionApiKey.trim(),
              status: additionEnabled ? "A TESTER" : "INACTIF",
            },
          },
          printers,
        },
      };
      const snapshot = await apiRequest<SettingsSnapshot>("/settings/company", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setData(snapshot);
      setSuccess("Paramètres enregistrés.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-foreground/55">Entreprise, OCR, HACCP, stock, alertes et imprimantes</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Paramètres</h1>
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}
        {loading ? <div className="rounded-md border border-border bg-card p-5 text-sm text-foreground/60">Chargement des paramètres...</div> : null}

        {!loading && data ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="p-5">
              <SectionTitle icon={SettingsIcon} title="Restaurant" subtitle="Coordonnées et identité du restaurant" />
              <Grid>
                <TextField label="Nom restaurant" value={restaurantName} onChange={setRestaurantName} />
                <TextField label="Nom légal" value={legalName} onChange={setLegalName} />
                <TextField label="Adresse" value={address} onChange={setAddress} className="xl:col-span-2" />
                <TextField label="Téléphone" value={phone} onChange={setPhone} />
                <TextField label="Email" value={email} onChange={setEmail} type="email" />
                <TextField label="SIRET" value={siret} onChange={setSiret} />
                <TextField label="TVA" value={vatNumber} onChange={setVatNumber} />
                <TextField label="Logo URL" value={logoUrl} onChange={setLogoUrl} className="xl:col-span-2" />
                <TextAreaField label="Horaires ouverture" value={openingHours} onChange={setOpeningHours} className="xl:col-span-2" />
              </Grid>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Shield} title="Utilisateurs / rôles" subtitle="Accès visibles par rôle" />
              <div className="mt-4 grid gap-2">
                {roleMatrix.map((row) => (
                  <div key={row.role} className="rounded-md border border-border px-3 py-3 text-sm">
                    <p className="font-medium">{row.role}</p>
                    <p className="text-xs text-foreground/55">{row.modules}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={SettingsIcon} title="HACCP" subtitle="Planning et tâches récurrentes" />
              <Grid>
                <TextAreaField label="Créneaux températures" value={temperatureSchedule} onChange={setTemperatureSchedule} className="xl:col-span-2" />
                <TextAreaField label="Tâches nettoyage" value={cleaningTasks} onChange={setCleaningTasks} className="xl:col-span-2" />
              </Grid>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={SettingsIcon} title="Stock" subtitle="Unités, catégories et zones" />
              <Grid>
                <TextField label="Unités" value={unitsText} onChange={setUnitsText} className="xl:col-span-2" />
                <TextField label="Catégories" value={categoriesText} onChange={setCategoriesText} className="xl:col-span-2" />
                <TextField label="Seuil défaut" value={defaultReorderPoint} onChange={setDefaultReorderPoint} />
                <TextField label="Zones stockage" value={storageAreasText} onChange={setStorageAreasText} className="xl:col-span-2" />
              </Grid>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={SettingsIcon} title="Factures OCR" subtitle="Réglages de traitement et de confiance" />
              <Grid>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs text-foreground/55">Mode OCR</span>
                  <select className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={ocrMode} onChange={(event) => setOcrMode(event.target.value)}>
                    <option value="local">Local</option>
                    <option value="ia">IA</option>
                    <option value="hybrid">Hybride</option>
                  </select>
                </label>
                <TextField label="Seuil confiance" value={confidenceThreshold} onChange={setConfidenceThreshold} />
                <div className="rounded-md border border-border px-3 py-3 text-sm">
                  <p className="text-xs text-foreground/55">OpenAI configuré</p>
                  <p className="mt-1 font-medium">{data.settings.invoices.openai_configured ? "Oui" : "Non"}</p>
                  <p className="mt-1 text-xs text-foreground/55">Modèle: {data.settings.invoices.model}</p>
                </div>
              </Grid>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={TrendingUp} title="Alertes prix" subtitle="Seuil et notifications dashboard" />
              <Grid>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={priceAlertEnabled} onChange={(event) => setPriceAlertEnabled(event.target.checked)} />
                  <span>Activer les alertes prix</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={notifyDashboard} onChange={(event) => setNotifyDashboard(event.target.checked)} />
                  <span>Notifier le dashboard</span>
                </label>
                <TextField label="Seuil hausse prix" value={priceAlertThreshold} onChange={setPriceAlertThreshold} />
              </Grid>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Truck} title="L'Addition" subtitle="Préparation de l'intégration caisse" />
              <Grid>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={additionEnabled} onChange={(event) => setAdditionEnabled(event.target.checked)} />
                  <span>Activer la section L'Addition</span>
                </label>
                <TextField label="URL API" value={additionApiUrl} onChange={setAdditionApiUrl} className="xl:col-span-2" />
                <TextField label="API key / token" value={additionApiKey} onChange={setAdditionApiKey} className="xl:col-span-2" />
              </Grid>
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Printer} title="Impression étiquettes" subtitle="Préparation des imprimantes restaurant" />
              <div className="mt-4 flex items-center gap-2">
                <Button variant="secondary" onClick={addPrinter}>
                  <Plus className="h-4 w-4" />
                  Ajouter une imprimante
                </Button>
                <Button variant="secondary" onClick={() => window.print()}>
                  Imprimer étiquette test
                </Button>
              </div>
              <div className="mt-4 grid gap-3">
                {printers.length === 0 ? <p className="text-sm text-foreground/55">Aucune imprimante configurée.</p> : null}
                {printers.map((printer, index) => (
                  <div key={printer.id} className="grid gap-2 rounded-md border border-border p-3 xl:grid-cols-[1fr_160px_160px_120px_auto]">
                    <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" placeholder="Nom imprimante" value={printer.name} onChange={(event) => updatePrinter(index, { name: event.target.value })} />
                    <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" placeholder="Type" value={printer.type} onChange={(event) => updatePrinter(index, { type: event.target.value })} />
                    <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" placeholder="Adresse IP" value={printer.address} onChange={(event) => updatePrinter(index, { address: event.target.value })} />
                    <input className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" placeholder="Format" value={printer.format} onChange={(event) => updatePrinter(index, { format: event.target.value })} />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={printer.is_default} onChange={(event) => updatePrinter(index, { is_default: event.target.checked })} />
                        Par défaut
                      </label>
                      <Button variant="secondary" size="icon" onClick={() => removePrinter(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-foreground/55">Imprimantes configurées: {printerCount}</p>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-foreground/55">{subtitle}</p>
      </div>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="mt-4 grid gap-3 xl:grid-cols-2">{children}</div>;
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-sm ${className ?? ""}`.trim()}>
      <span className="text-xs text-foreground/55">{label}</span>
      <input type={type} className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-sm ${className ?? ""}`.trim()}>
      <span className="text-xs text-foreground/55">{label}</span>
      <textarea className="min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
