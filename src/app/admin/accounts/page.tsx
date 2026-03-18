"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getSubAccounts, createSubAccount, deleteSubAccount, getAgencyForUser } from "@/lib/actions";

function AccountsPageInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const user = session?.user as any;
  const agencyIdParam = searchParams.get("agencyId");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [agencyName, setAgencyName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const agencyId = agencyIdParam || user?.agencyId;

  useEffect(() => {
    if (agencyId) loadAccounts();
  }, [agencyId]);

  async function loadAccounts() {
    if (!agencyId) return;
    try {
      const data = await getSubAccounts(agencyId);
      setAccounts(data);
      const agency = await getAgencyForUser();
      if (agency) setAgencyName(agency.name);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !agencyId) return;
    setLoading(true);
    try {
      await createSubAccount(agencyId, { name, slug: slug || undefined });
      setName("");
      setSlug("");
      setShowCreate(false);
      await loadAccounts();
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  }

  async function handleDelete(id: string, accountName: string) {
    if (!confirm(`Delete sub-account "${accountName}"? This removes ALL clients, lenders, and data.`)) return;
    try {
      await deleteSubAccount(id);
      await loadAccounts();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!agencyId) {
    return (
      <div className="card p-12 text-center text-gray-400">
        <p>No agency context found. Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sub-Accounts</h1>
          <p className="text-gray-500 mt-1">
            {agencyName ? `Manage accounts for ${agencyName}` : "Manage sub-accounts"}
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          + New Sub-Account
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Create New Sub-Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Account Name *</label>
              <input
                className="input-field"
                placeholder="e.g. Client Team A"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }}
                required
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                className="input-field"
                placeholder="client-team-a"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creating..." : "Create Account"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {accounts.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <p className="mb-4">No sub-accounts yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">Create First Sub-Account</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{account.name}</h3>
                  <p className="text-xs text-gray-400">/{account.slug}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{account._count.users}</div>
                  <div className="text-xs text-gray-500">Users</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{account._count.clients}</div>
                  <div className="text-xs text-gray-500">Clients</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                <button onClick={() => handleDelete(account.id, account.name)} className="text-red-500 hover:text-red-700 text-sm">
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

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsPageInner />
    </Suspense>
  );
}
