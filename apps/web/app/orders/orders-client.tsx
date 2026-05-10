"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Loader2, PackageCheck, Plus, Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest, authHint } from "@/lib/api";
import { cn } from "@/lib/utils";

type SuggestionGroup = {
  supplier_id: string;
  supplier_name: string;
  lines: Array<{
    inventory_item_id: string;
    item_name: string;
    unit: string;
    quantity_on_hand: string;
    reorder_point: string;
    recommended_quantity: string;
    average_cost: string;
  }>;
};

type Order = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  number: string;
  status: "DRAFT" | "SENT" | "RECEIVED" | "ARCHIVED";
  ordered_at: string;
  sent_at: string | null;
  received_at: string | null;
  notes: string | null;
  total_amount: string;
  is_archived: boolean;
  lines: Array<{
    id: string;
    inventory_item_id: string;
    item_name: string;
    unit: string;
    quantity_ordered: string;
    quantity_received: string;
    unit_cost: string | null;
    line_total: string;
    current_stock: string;
    reorder_point: string;
  }>;
};

type InventoryItem = {
  id: string;
  name: string;
  unit: string;
  quantity_on_hand: string;
  reorder_point: string;
  average_cost: string;
  is_active: boolean;
  supplier_name: string | null;
};

export function OrdersClient() {
  const [suggestions, setSuggestions] = useState<SuggestionGroup[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockItems, setStockItems] = useState<InventoryItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSuggestionSupplier, setSelectedSuggestionSupplier] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? orders[0] ?? null;
  const selectedSuggestion = suggestions.find((group) => group.supplier_id === selectedSuggestionSupplier) ?? suggestions[0] ?? null;
  const activeDraft = selectedOrder?.status === "DRAFT" ? selectedOrder : null;
  const urgentCount = suggestions.reduce((count, group) => count + group.lines.length, 0);

  useEffect(() => {
    void loadData();
  }, [showArchived]);

  async function loadData(nextSelectedId?: string) {
    setLoading(true);
    setError("");
    try {
      const [suggestionData, orderData, stockData] = await Promise.all([
        apiRequest<SuggestionGroup[]>("/orders/suggestions"),
        apiRequest<Order[]>(`/orders${showArchived ? "?include_archived=true" : ""}`),
        apiRequest<InventoryItem[]>("/inventory"),
      ]);
      setSuggestions(suggestionData);
      setOrders(orderData);
      setStockItems(stockData.filter((item) => item.is_active));
      setSelectedSuggestionSupplier((current) => current || suggestionData[0]?.supplier_id || "");
      setSelectedId(nextSelectedId ?? orderData[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : authHint());
    } finally {
      setLoading(false);
    }
  }

  async function createOrderFromSuggestion(group: SuggestionGroup) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await apiRequest<Order>("/orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: group.supplier_id,
          lines: group.lines.map((line) => ({
            inventory_item_id: line.inventory_item_id,
            quantity_ordered: line.recommended_quantity,
            unit_cost: line.average_cost,
          })),
        }),
      });
      setSuccess("Commande fournisseur générée.");
      await loadData(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération commande impossible");
    } finally {
      setSaving(false);
    }
  }

  async function updateLine(order: Order, lineId: string, quantity: string) {
    if (Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
      setError("La quantité commandée doit être positive.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<Order>(`/orders/${order.id}/lines/${lineId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity_ordered: quantity }),
      });
      setOrders((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess("Quantité mise à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible");
    } finally {
      setSaving(false);
    }
  }

  async function addLine(order: Order, inventoryItemId: string) {
    const item = stockItems.find((entry) => entry.id === inventoryItemId);
    if (!item) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<Order>(`/orders/${order.id}/lines`, {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: item.id,
          quantity_ordered: "1",
          unit_cost: item.average_cost,
        }),
      });
      setOrders((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess("Ligne ajoutée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout ligne impossible");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLine(order: Order, lineId: string) {
    if (!window.confirm("Supprimer cette ligne de commande ?")) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<Order>(`/orders/${order.id}/lines/${lineId}`, { method: "DELETE" });
      setOrders((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess("Ligne supprimée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression ligne impossible");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(order: Order, status: Order["status"]) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<Order>(`/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setOrders((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess(status === "SENT" ? "Commande envoyée." : "Commande mise à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Changement de statut impossible");
    } finally {
      setSaving(false);
    }
  }

  async function receiveOrder(order: Order) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<Order>(`/orders/${order.id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          lines: order.lines.map((line) => ({
            line_id: line.id,
            quantity_received: line.quantity_ordered,
          })),
        }),
      });
      setOrders((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setSelectedId(updated.id);
      setSuccess("Commande reçue. Le stock a été mis à jour.");
      await loadData(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Réception impossible");
    } finally {
      setSaving(false);
    }
  }

  async function archiveOrder(order: Order) {
    if (!window.confirm(`Archiver la commande ${order.number} ?`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await apiRequest<Order>(`/orders/${order.id}`, { method: "DELETE" });
      setOrders((current) => {
        const next = current.map((entry) => entry.id === updated.id ? updated : entry);
        return showArchived ? next : next.filter((entry) => !entry.is_archived);
      });
      setSelectedId((current) => current === updated.id ? "" : current);
      setSuccess("Commande archivée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archivage impossible");
    } finally {
      setSaving(false);
    }
  }

  const addableItems = useMemo(() => {
    if (!activeDraft) return [];
    const lineIds = new Set(activeDraft.lines.map((line) => line.inventory_item_id));
    return stockItems.filter((item) => !lineIds.has(item.id));
  }, [activeDraft, stockItems]);

  return (
    <AppShell>
      <Topbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:px-8 lg:py-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-foreground/55">Réapprovisionnement intelligent, commandes fournisseurs et réception stock</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal lg:text-5xl">Commandes fournisseurs</h1>
          </div>
        </section>

        {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{error}</p> : null}
        {success ? <p className="rounded-md bg-foreground px-3 py-2 text-sm text-background">{success}</p> : null}

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Articles sous seuil" value={String(urgentCount)} />
          <Metric label="Commandes brouillon" value={String(orders.filter((order) => order.status === "DRAFT" && !order.is_archived).length)} />
          <Metric label="Commandes envoyées" value={String(orders.filter((order) => order.status === "SENT" && !order.is_archived).length)} />
          <Metric label="Commandes reçues" value={String(orders.filter((order) => order.status === "RECEIVED" && !order.is_archived).length)} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-3">
              <h2 className="text-base font-semibold">Réapprovisionnement intelligent</h2>
              <p className="text-xs text-foreground/55">Les suggestions regroupent les articles sous seuil par fournisseur.</p>
            </div>
            <div className="divide-y divide-border">
              {loading ? <StateLine text="Analyse des seuils de réapprovisionnement" /> : null}
              {!loading && suggestions.length === 0 ? <StateLine text="Aucun article sous seuil actuellement." loading={false} /> : null}
              {suggestions.map((group) => (
                <div key={group.supplier_id} className={cn("px-4 py-4", selectedSuggestion?.supplier_id === group.supplier_id && "bg-muted")}>
                  <div className="flex items-center justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setSelectedSuggestionSupplier(group.supplier_id)}>
                      <p className="truncate text-sm font-medium">{group.supplier_name}</p>
                      <p className="text-xs text-foreground/55">{group.lines.length} article(s) sous seuil</p>
                    </button>
                    <Button size="sm" onClick={() => createOrderFromSuggestion(group)} disabled={saving}>
                      <Plus className="h-4 w-4" />
                      Générer
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.lines.map((line) => (
                      <div key={line.inventory_item_id} className="rounded-md bg-background px-3 py-2 text-sm">
                        <p className="font-medium">{line.item_name}</p>
                        <p className="text-xs text-foreground/55">Stock {line.quantity_on_hand} / seuil {line.reorder_point} / conseillé {line.recommended_quantity} {line.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div>
                <h2 className="text-base font-semibold">Commandes</h2>
                <p className="text-xs text-foreground/55">Brouillon, envoi, réception et archivage.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                Archivées
              </label>
            </div>
            <div className="divide-y divide-border">
              {!loading && orders.length === 0 ? <StateLine text="Aucune commande fournisseur." loading={false} /> : null}
              {orders.map((order) => (
                <button key={order.id} className={cn("grid w-full gap-2 px-4 py-4 text-left sm:grid-cols-[1fr_110px_140px] sm:items-center", selectedOrder?.id === order.id && "bg-muted")} onClick={() => setSelectedId(order.id)}>
                  <div>
                    <p className="text-sm font-medium">{order.number} - {order.supplier_name}</p>
                    <p className="text-xs text-foreground/55">{order.lines.length} ligne(s) - {new Date(order.ordered_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <span className="rounded-md bg-background px-2 py-1 text-xs">{labelStatus(order.status)}</span>
                  <span className="text-sm font-medium">{Number(order.total_amount).toFixed(2)} €</span>
                </button>
              ))}
            </div>
          </Card>
        </section>

        <Card className="p-5">
          {selectedOrder ? (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">{selectedOrder.number}</h2>
                  <p className="mt-1 text-sm text-foreground/55">{selectedOrder.supplier_name} - {labelStatus(selectedOrder.status)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status === "DRAFT" ? <Button variant="secondary" onClick={() => changeStatus(selectedOrder, "SENT")} disabled={saving}><Send className="h-4 w-4" />Envoyer</Button> : null}
                  {selectedOrder.status !== "RECEIVED" && selectedOrder.status !== "ARCHIVED" ? <Button onClick={() => receiveOrder(selectedOrder)} disabled={saving}><PackageCheck className="h-4 w-4" />Réceptionner</Button> : null}
                  {selectedOrder.status !== "ARCHIVED" ? <Button variant="secondary" onClick={() => archiveOrder(selectedOrder)} disabled={saving}><Archive className="h-4 w-4" />Archiver</Button> : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <Metric label="Statut" value={labelStatus(selectedOrder.status)} />
                <Metric label="Total" value={`${Number(selectedOrder.total_amount).toFixed(2)} €`} />
                <Metric label="Commandée" value={new Date(selectedOrder.ordered_at).toLocaleDateString("fr-FR")} />
                <Metric label="Réception" value={selectedOrder.received_at ? new Date(selectedOrder.received_at).toLocaleDateString("fr-FR") : "En attente"} />
              </div>

              {activeDraft ? (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs text-foreground/55">Ajouter un article</span>
                    <select id="order-add-item" className="h-10 rounded-md border border-border bg-background px-3">
                      {addableItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <Button variant="secondary" onClick={() => {
                    const select = document.getElementById("order-add-item") as HTMLSelectElement | null;
                    if (select?.value) void addLine(activeDraft, select.value);
                  }} disabled={saving || addableItems.length === 0}>
                    <Plus className="h-4 w-4" />
                    Ajouter ligne
                  </Button>
                </div>
              ) : null}

              <div className="mt-5 space-y-2">
                {selectedOrder.lines.map((line) => (
                  <div key={line.id} className="grid gap-3 rounded-md bg-muted px-3 py-3 sm:grid-cols-[1fr_120px_120px_160px] sm:items-center">
                    <div>
                      <p className="font-medium">{line.item_name}</p>
                      <p className="text-xs text-foreground/55">Stock actuel {line.current_stock} / seuil {line.reorder_point}</p>
                    </div>
                    {selectedOrder.status === "DRAFT" ? (
                      <label className="grid gap-1 text-sm">
                        <span className="text-xs text-foreground/55">Quantité</span>
                        <input className="h-10 rounded-md border border-border bg-background px-3 outline-none" defaultValue={line.quantity_ordered} onBlur={(event) => {
                          if (event.target.value !== line.quantity_ordered) void updateLine(selectedOrder, line.id, event.target.value);
                        }} />
                      </label>
                    ) : (
                      <div className="text-sm">
                        <p className="font-medium">{line.quantity_ordered} {line.unit}</p>
                        <p className="text-xs text-foreground/55">Reçue {line.quantity_received}</p>
                      </div>
                    )}
                    <div className="text-sm">
                      <p className="font-medium">{line.unit_cost ? `${Number(line.unit_cost).toFixed(2)} €` : "-"}</p>
                      <p className="text-xs text-foreground/55">Coût unitaire</p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{Number(line.line_total).toFixed(2)} €</span>
                      {selectedOrder.status === "DRAFT" ? (
                        <div className="flex gap-2">
                          <Button size="icon" variant="secondary" aria-label="Supprimer" onClick={() => deleteLine(selectedOrder, line.id)} disabled={saving}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-foreground/55">Sélectionnez une commande fournisseur pour afficher les lignes et la réception.</p>}
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted px-3 py-3"><p className="text-xs text-foreground/55">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>;
}

function StateLine({ text, loading = true }: { text: string; loading?: boolean }) {
  return <div className="flex items-center gap-3 px-4 py-4 text-sm text-foreground/55">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{text}</div>;
}

function labelStatus(status: Order["status"]) {
  if (status === "DRAFT") return "Brouillon";
  if (status === "SENT") return "Envoyée";
  if (status === "RECEIVED") return "Reçue";
  return "Archivée";
}
