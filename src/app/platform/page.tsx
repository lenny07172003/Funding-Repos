"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { getPlatformStats, getAllAgencies, searchUsersGlobal, updateAgencySubscriptionStatus, updateAgencyPlan, addAiCredits } from "@/lib/platform-actions";
import { PLANS } from "@/lib/plans";

type Agency = Awaited<ReturnType<typeof getAllAgencies>>[number];

export default function PlatformDashboard() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getPlatformStats>> | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [s, a] = await Promise.all([getPlatformStats(), getAllAgencies()]);
      setStats(s);
      setAgencies(a);
    } catch {}
  }

  async function handleSearch() {
    if (!searchQuery.trim() || searchQuery.length < 2) return;
    setSearching(true);
    try {
      const results = await searchUsersGlobal(searchQuery);
      setSearchResults(results);
    } catch {}
    setSearching(false);
  }

  async function handleStatusChange(agencyId: string, status: string) {
    try {
      await updateAgencySubscriptionStatus(agencyId, status);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handlePlanChange(agencyId: string, plan: string) {
    try {
      await updateAgencyPlan(agencyId, plan);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleAddCredits(agencyId: string) {
    const amount = prompt("How many AI credits to add?");
    if (!amount) return;
    try {
      await addAiCredits(agencyId, parseInt(amount));
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const statusColors: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    trialing: "bg-blue-100 text-blue-800",
    past_due: "bg-amber-100 text-amber-800",
    canceled: "bg-red-100 text-red-800",
    suspended: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <nav className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-lg font-bold">Platform Admin</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <StatCard label="MRR" value={`$${stats.mrr.toLocaleString()}`} accent />
            <StatCard label="Total Agencies" value={String(stats.totalAgencies)} />
            <StatCard label="Active" value={String(stats.activeAgencies)} />
            <StatCard label="Total Users" value={String(stats.totalUsers)} />
            <StatCard label="Total Clients" value={String(stats.totalClients)} />
          </div>
        )}

        {/* Search */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-8">
          <div className="flex gap-3">
            <input
              className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-brand-500 placeholder-gray-500"
              placeholder="Search users by email or name (support lookup)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button onClick={handleSearch} disabled={searching} className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-colors disabled:opacity-50">
              {searching ? "..." : "Search"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              {searchResults.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                  <div>
                    <span className="font-medium text-white">{u.name}</span>
                    <span className="text-gray-400 ml-2">{u.email}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{u.agency?.name || "No agency"}</span>
                    <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{u.role}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agency List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold">All Agencies</h2>
            <span className="text-sm text-gray-400">{agencies.length} total</span>
          </div>

          <div className="divide-y divide-gray-800">
            {agencies.map((agency) => {
              const plan = PLANS[agency.plan as keyof typeof PLANS];
              const owner = agency.users[0];
              const isExpanded = selectedAgency?.id === agency.id;

              return (
                <div key={agency.id}>
                  <div
                    className="px-6 py-4 hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedAgency(isExpanded ? null : agency)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-white">{agency.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[agency.subscriptionStatus]}`}>
                            {agency.subscriptionStatus}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {owner?.email || "No owner"} &middot; {plan?.name || agency.plan} &middot; ${plan?.price || "?"}/mo
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <div className="font-bold text-white">{agency._count.subAccounts}</div>
                          <div className="text-xs text-gray-500">Accounts</div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-white">{agency._count.users}</div>
                          <div className="text-xs text-gray-500">Users</div>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-white">{agency.aiCreditsBalance}</div>
                          <div className="text-xs text-gray-500">AI Credits</div>
                        </div>
                        <svg className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-6 py-4 bg-gray-800/30 border-t border-gray-800 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Plan</label>
                          <select
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                            value={agency.plan}
                            onChange={(e) => handlePlanChange(agency.id, e.target.value)}
                          >
                            <option value="tier_1">Starter ($97.95)</option>
                            <option value="tier_2">Professional ($297)</option>
                            <option value="tier_3">Enterprise ($457)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Status</label>
                          <select
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                            value={agency.subscriptionStatus}
                            onChange={(e) => handleStatusChange(agency.id, e.target.value)}
                          >
                            <option value="trialing">Trialing</option>
                            <option value="active">Active</option>
                            <option value="past_due">Past Due</option>
                            <option value="canceled">Canceled</option>
                            <option value="suspended">Suspended</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">AI Credits</label>
                          <div className="flex gap-2">
                            <span className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1">
                              {agency.aiCreditsBalance} remaining ({agency.aiCreditsUsed} used)
                            </span>
                            <button
                              onClick={() => handleAddCredits(agency.id)}
                              className="px-3 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm font-medium transition-colors"
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        Created: {new Date(agency.createdAt).toLocaleDateString()} &middot;
                        Slug: {agency.slug} &middot;
                        Limits: {agency.maxSubAccounts === -1 ? "Unlimited" : agency.maxSubAccounts} accounts, {agency.maxClients === -1 ? "Unlimited" : agency.maxClients} clients
                        {agency.currentPeriodEnd && ` · Billing period ends: ${new Date(agency.currentPeriodEnd).toLocaleDateString()}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {agencies.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500">
              No agencies yet. Share your signup page to get your first customer.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "bg-brand-600 border-brand-500" : "bg-gray-900 border-gray-800"}`}>
      <div className={`text-xs font-medium mb-1 ${accent ? "text-brand-200" : "text-gray-500"}`}>{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-white" : "text-white"}`}>{value}</div>
    </div>
  );
}
