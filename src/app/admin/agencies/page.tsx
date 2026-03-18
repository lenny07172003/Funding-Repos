"use client";

import { useState, useEffect } from "react";
import { getAgencies, createAgency, deleteAgency } from "@/lib/actions";
import Link from "next/link";

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAgencies();
  }, []);

  async function loadAgencies() {
    try {
      const data = await getAgencies();
      setAgencies(data);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createAgency({ name, slug: slug || undefined });
      setName("");
      setSlug("");
      setShowCreate(false);
      await loadAgencies();
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  }

  async function handleDelete(id: string, agencyName: string) {
    if (!confirm(`Delete agency "${agencyName}"? This will remove ALL sub-accounts, users, and data.`)) return;
    try {
      await deleteAgency(id);
      await loadAgencies();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agencies</h1>
          <p className="text-gray-500 mt-1">Manage white-label agencies and their sub-accounts</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          + New Agency
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Create New Agency</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Agency Name *</label>
              <input
                className="input-field"
                placeholder="e.g. Premium Funding Group"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }}
                required
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                className="input-field"
                placeholder="premium-funding-group"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              />
              <p className="text-xs text-gray-400 mt-1">Used in URLs. Auto-generated from name.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creating..." : "Create Agency"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {agencies.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="mb-4">No agencies yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">Create Your First Agency</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agencies.map((agency) => (
            <div key={agency.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                    style={{ backgroundColor: agency.primaryColor + "20", color: agency.primaryColor }}
                  >
                    {agency.brandName?.charAt(0)?.toUpperCase() || agency.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{agency.name}</h3>
                    <p className="text-xs text-gray-400">/{agency.slug}</p>
                  </div>
                </div>
              </div>
              {agency.customDomain && (
                <p className="text-xs text-brand-600 mb-2">{agency.customDomain}</p>
              )}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{agency._count.subAccounts}</div>
                  <div className="text-xs text-gray-500">Sub-Accounts</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{agency._count.users}</div>
                  <div className="text-xs text-gray-500">Users</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                <Link href={`/admin/accounts?agencyId=${agency.id}`} className="text-brand-600 hover:text-brand-800 text-sm font-medium">
                  Manage Accounts
                </Link>
                <span className="text-gray-300">|</span>
                <Link href={`/admin/settings/branding?agencyId=${agency.id}`} className="text-brand-600 hover:text-brand-800 text-sm font-medium">
                  Branding
                </Link>
                <span className="text-gray-300">|</span>
                <button onClick={() => handleDelete(agency.id, agency.name)} className="text-red-500 hover:text-red-700 text-sm">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
