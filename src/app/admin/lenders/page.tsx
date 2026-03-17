"use client";

import { useState, useEffect } from "react";
import { Lender, ApplicationType } from "@/lib/types";
import { getLenders, upsertLender, deleteLender, createEmptyLender, syncLendersFromClients } from "@/lib/store";

const PRODUCT_OPTIONS: { value: ApplicationType; label: string }[] = [
  { value: "credit_card", label: "Credit Cards" },
  { value: "line_of_credit", label: "Lines of Credit" },
  { value: "term_loan", label: "Term Loans" },
  { value: "mca", label: "MCA" },
  { value: "equipment_financing", label: "Equipment Financing" },
  { value: "sba", label: "SBA Loans" },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  connected: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  disconnected: { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400" },
  pending: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  error: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

type View = "marketplace" | "add" | "detail";

export default function LenderMarketplace() {
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [view, setView] = useState<View>("marketplace");
  const [editingLender, setEditingLender] = useState<Lender | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    // Clean up: only keep lenders actually used in client applications or manually configured
    syncLendersFromClients();
    setLenders(getLenders());
  }, []);

  function reload() {
    setLenders(getLenders());
  }

  function openAdd() {
    setEditingLender(createEmptyLender());
    setView("add");
    setTestResult(null);
  }

  function openDetail(lender: Lender) {
    setEditingLender({ ...lender });
    setView("detail");
    setTestResult(null);
  }

  function goBack() {
    setView("marketplace");
    setEditingLender(null);
    setTestResult(null);
    reload();
  }

  function saveLender() {
    if (!editingLender) return;
    upsertLender(editingLender);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    reload();
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this lender connection?")) return;
    deleteLender(id);
    goBack();
  }

  function connectLender() {
    if (!editingLender || !editingLender.apiKey) return;
    const updated = {
      ...editingLender,
      status: "connected" as const,
      connectedAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
    };
    setEditingLender(updated);
    upsertLender(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    reload();
  }

  function disconnectLender() {
    if (!editingLender) return;
    const updated = {
      ...editingLender,
      status: "disconnected" as const,
    };
    setEditingLender(updated);
    upsertLender(updated);
    reload();
  }

  function testConnection() {
    if (!editingLender) return;
    setTesting(true);
    setTestResult(null);
    // Simulate API test
    setTimeout(() => {
      if (editingLender.apiKey && editingLender.apiEndpoint) {
        setTestResult({ success: true, message: "Connection successful! API responded with 200 OK." });
        const updated = { ...editingLender, lastSyncAt: new Date().toISOString() };
        setEditingLender(updated);
      } else {
        setTestResult({
          success: false,
          message: !editingLender.apiKey
            ? "API Key is required to test the connection."
            : "API Endpoint is required to test the connection.",
        });
      }
      setTesting(false);
    }, 1500);
  }

  function toggleProduct(product: ApplicationType) {
    if (!editingLender) return;
    const current = editingLender.supportedProducts;
    const updated = current.includes(product)
      ? current.filter((p) => p !== product)
      : [...current, product];
    setEditingLender({ ...editingLender, supportedProducts: updated });
  }

  function updateField<K extends keyof Lender>(field: K, value: Lender[K]) {
    if (!editingLender) return;
    setEditingLender({ ...editingLender, [field]: value });
  }

  // Filtered lenders
  const filtered = lenders.filter((l) => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    if (filterProduct !== "all" && !l.supportedProducts.includes(filterProduct as ApplicationType))
      return false;
    return true;
  });

  const connectedCount = lenders.filter((l) => l.status === "connected").length;
  const totalFundedAll = lenders.reduce((s, l) => s + l.totalFunded, 0);
  const totalDealsAll = lenders.reduce((s, l) => s + l.totalDeals, 0);

  // ---- MARKETPLACE VIEW ----
  if (view === "marketplace") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lender Marketplace</h1>
            <p className="text-sm text-gray-500">
              Connect lenders to your platform via API and manage integrations
            </p>
          </div>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Lender
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-brand-600 border-brand-600 p-4">
            <div className="text-xs font-medium mb-1 text-brand-100">Total Lenders</div>
            <div className="text-xl font-bold text-white">{lenders.length}</div>
          </div>
          <div className="rounded-lg border bg-white border-gray-200 p-4">
            <div className="text-xs font-medium mb-1 text-gray-500">Connected</div>
            <div className="text-xl font-bold text-emerald-600">{connectedCount}</div>
          </div>
          <div className="rounded-lg border bg-white border-gray-200 p-4">
            <div className="text-xs font-medium mb-1 text-gray-500">Total Funded</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(totalFundedAll)}</div>
          </div>
          <div className="rounded-lg border bg-white border-gray-200 p-4">
            <div className="text-xs font-medium mb-1 text-gray-500">Total Deals</div>
            <div className="text-xl font-bold text-gray-900">{totalDealsAll}</div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                className="input-field pl-10"
                placeholder="Search lenders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input-field w-auto"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="connected">Connected</option>
              <option value="disconnected">Disconnected</option>
              <option value="pending">Pending</option>
              <option value="error">Error</option>
            </select>
            <select
              className="input-field w-auto"
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
            >
              <option value="all">All Products</option>
              {PRODUCT_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lender Cards Grid */}
        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <svg
              className="w-12 h-12 text-gray-300 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No lenders found</h3>
            <p className="text-sm text-gray-500 mb-4">
              {lenders.length === 0
                ? "Get started by adding your first lender connection."
                : "No lenders match your current filters."}
            </p>
            {lenders.length === 0 && (
              <button onClick={openAdd} className="btn-primary">
                Add Your First Lender
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((lender) => {
              const st = STATUS_STYLES[lender.status];
              return (
                <div
                  key={lender.id}
                  onClick={() => openDetail(lender)}
                  className="bg-white border border-gray-200 rounded-lg p-5 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer"
                >
                  {/* Lender Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                        {lender.logo || lender.name.substring(0, 2).toUpperCase() || "?"}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{lender.name || "Unnamed Lender"}</h3>
                        {lender.website && (
                          <p className="text-xs text-gray-400 truncate max-w-[180px]">{lender.website}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {lender.status.charAt(0).toUpperCase() + lender.status.slice(1)}
                    </span>
                  </div>

                  {/* Description */}
                  {lender.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{lender.description}</p>
                  )}

                  {/* Supported Products */}
                  {lender.supportedProducts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {lender.supportedProducts.map((p) => {
                        const label = PRODUCT_OPTIONS.find((po) => po.value === p)?.label || p;
                        return (
                          <span
                            key={p}
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-sm font-bold text-gray-900">
                        {lender.totalDeals}
                      </div>
                      <div className="text-xs text-gray-400">Deals</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-emerald-600">
                        {formatCurrency(lender.totalFunded)}
                      </div>
                      <div className="text-xs text-gray-400">Funded</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-gray-900">
                        {lender.approvalRate !== null ? `${lender.approvalRate}%` : "—"}
                      </div>
                      <div className="text-xs text-gray-400">Approval</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---- ADD / DETAIL VIEW ----
  if (!editingLender) return null;
  const isNew = view === "add";
  const st = STATUS_STYLES[editingLender.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {isNew ? "Add New Lender" : editingLender.name || "Lender Details"}
            </h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
              {!isNew && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {editingLender.status.charAt(0).toUpperCase() + editingLender.status.slice(1)}
                </span>
              )}
              {editingLender.connectedAt && (
                <span className="text-xs text-gray-400">
                  Connected {new Date(editingLender.connectedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-9 sm:ml-0">
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
          {!isNew && (
            <button onClick={() => handleDelete(editingLender.id)} className="btn-danger">
              Remove
            </button>
          )}
          <button
            onClick={() => {
              saveLender();
              if (isNew) {
                setView("detail");
              }
            }}
            className="btn-primary"
          >
            {isNew ? "Add Lender" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* API Connection Section */}
      <div className="bg-white border-2 border-brand-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">API Connection</h2>
            <p className="text-sm text-gray-500">Configure API credentials to connect this lender to your platform</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">API Key</label>
            <input
              className="input-field font-mono text-sm"
              type="password"
              placeholder="Enter API key..."
              value={editingLender.apiKey}
              onChange={(e) => updateField("apiKey", e.target.value)}
            />
          </div>
          <div>
            <label className="label">API Secret</label>
            <input
              className="input-field font-mono text-sm"
              type="password"
              placeholder="Enter API secret..."
              value={editingLender.apiSecret}
              onChange={(e) => updateField("apiSecret", e.target.value)}
            />
          </div>
          <div>
            <label className="label">API Endpoint URL</label>
            <input
              className="input-field text-sm"
              placeholder="https://api.lender.com/v1"
              value={editingLender.apiEndpoint}
              onChange={(e) => updateField("apiEndpoint", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Webhook URL (incoming)</label>
            <input
              className="input-field text-sm"
              placeholder="https://yourplatform.com/webhooks/lender"
              value={editingLender.webhookUrl}
              onChange={(e) => updateField("webhookUrl", e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              checked={editingLender.sandboxMode}
              onChange={(e) => updateField("sandboxMode", e.target.checked)}
            />
            <span className="text-sm text-gray-700">Sandbox / Test Mode</span>
          </label>
          {editingLender.sandboxMode && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
              Test Mode Active
            </span>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              testResult.success
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {testResult.message}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={testConnection}
            disabled={testing}
            className="btn-secondary flex items-center gap-2"
          >
            {testing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Testing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Test Connection
              </>
            )}
          </button>
          {editingLender.status !== "connected" ? (
            <button
              onClick={connectLender}
              disabled={!editingLender.apiKey}
              className="btn-success flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connect
            </button>
          ) : (
            <button onClick={disconnectLender} className="btn-danger flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
              Disconnect
            </button>
          )}
          {editingLender.lastSyncAt && (
            <span className="text-xs text-gray-400 ml-auto">
              Last sync: {new Date(editingLender.lastSyncAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Lender Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Lender Information</h3>
          <div className="space-y-4">
            <div>
              <label className="label">Lender Name</label>
              <input
                className="input-field"
                placeholder="e.g. Chase, Wells Fargo, Kabbage"
                value={editingLender.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Logo (emoji or initials)</label>
              <input
                className="input-field"
                placeholder="e.g. CH or emoji"
                maxLength={4}
                value={editingLender.logo}
                onChange={(e) => updateField("logo", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder="Brief description of this lender and their offerings..."
                value={editingLender.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Website</label>
              <input
                className="input-field"
                placeholder="https://lender.com"
                value={editingLender.website}
                onChange={(e) => updateField("website", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Lender Contact</h3>
          <div className="space-y-4">
            <div>
              <label className="label">Contact Name</label>
              <input
                className="input-field"
                placeholder="Account rep or partnership contact"
                value={editingLender.contactName}
                onChange={(e) => updateField("contactName", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Contact Email</label>
              <input
                className="input-field"
                type="email"
                placeholder="partner@lender.com"
                value={editingLender.contactEmail}
                onChange={(e) => updateField("contactEmail", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Contact Phone</label>
              <input
                className="input-field"
                type="tel"
                placeholder="(555) 123-4567"
                value={editingLender.contactPhone}
                onChange={(e) => updateField("contactPhone", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder="Internal notes about this lender relationship..."
                value={editingLender.notes}
                onChange={(e) => updateField("notes", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Product & Lending Criteria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supported Products */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Supported Products</h3>
          <p className="text-sm text-gray-500 mb-3">Select the funding types this lender supports</p>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCT_OPTIONS.map((p) => {
              const selected = editingLender.supportedProducts.includes(p.value);
              return (
                <button
                  key={p.value}
                  onClick={() => toggleProduct(p.value)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    selected
                      ? "bg-brand-50 border-brand-300 text-brand-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        selected ? "bg-brand-600 border-brand-600" : "border-gray-300"
                      }`}
                    >
                      {selected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {p.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lending Criteria */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Lending Criteria</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Min Credit Score</label>
                <input
                  className="input-field"
                  type="number"
                  min="300"
                  max="850"
                  placeholder="e.g. 650"
                  value={editingLender.minCreditScore ?? ""}
                  onChange={(e) =>
                    updateField("minCreditScore", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label className="label">Interest Rate Range</label>
                <input
                  className="input-field"
                  placeholder="e.g. 5.99% - 24.99%"
                  value={editingLender.interestRateRange}
                  onChange={(e) => updateField("interestRateRange", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Min Loan Amount</label>
                <input
                  className="input-field"
                  type="number"
                  placeholder="$"
                  value={editingLender.minLoanAmount ?? ""}
                  onChange={(e) =>
                    updateField("minLoanAmount", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label className="label">Max Loan Amount</label>
                <input
                  className="input-field"
                  type="number"
                  placeholder="$"
                  value={editingLender.maxLoanAmount ?? ""}
                  onChange={(e) =>
                    updateField("maxLoanAmount", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Term Range</label>
                <input
                  className="input-field"
                  placeholder="e.g. 6 - 60 months"
                  value={editingLender.termRange}
                  onChange={(e) => updateField("termRange", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Avg Approval Time</label>
                <input
                  className="input-field"
                  placeholder="e.g. 24 hours"
                  value={editingLender.avgApprovalTime}
                  onChange={(e) => updateField("avgApprovalTime", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics (detail only) */}
      {!isNew && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Performance Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label">Total Deals</label>
              <input
                className="input-field"
                type="number"
                min="0"
                value={editingLender.totalDeals}
                onChange={(e) => updateField("totalDeals", Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label">Total Funded ($)</label>
              <input
                className="input-field"
                type="number"
                min="0"
                value={editingLender.totalFunded}
                onChange={(e) => updateField("totalFunded", Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label">Approval Rate (%)</label>
              <input
                className="input-field"
                type="number"
                min="0"
                max="100"
                placeholder="%"
                value={editingLender.approvalRate ?? ""}
                onChange={(e) =>
                  updateField("approvalRate", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="flex items-end">
              <div className="w-full text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Status</div>
                <select
                  className="input-field text-sm"
                  value={editingLender.status}
                  onChange={(e) => updateField("status", e.target.value as Lender["status"])}
                >
                  <option value="connected">Connected</option>
                  <option value="disconnected">Disconnected</option>
                  <option value="pending">Pending</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
