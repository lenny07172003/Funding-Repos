"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Client } from "@/lib/types";
import { getClients, deleteClient } from "@/lib/store";

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [referralFilter, setReferralFilter] = useState("all");
  const [groupByReferral, setGroupByReferral] = useState(false);

  useEffect(() => {
    setClients(getClients());
  }, []);

  function handleDelete(id: string) {
    if (confirm("Are you sure you want to remove this client?")) {
      deleteClient(id);
      setClients(getClients());
    }
  }

  // Get unique referral partners
  const referralPartners = Array.from(
    new Set(clients.map((c) => c.referralPartner || "").filter(Boolean))
  ).sort();

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      c.personalInfo.firstName.toLowerCase().includes(q) ||
      c.personalInfo.lastName.toLowerCase().includes(q) ||
      c.personalInfo.email.toLowerCase().includes(q) ||
      c.businessInfo.businessName.toLowerCase().includes(q) ||
      (c.referralPartner || "").toLowerCase().includes(q);
    const matchesReferral =
      referralFilter === "all" ||
      (referralFilter === "none" && !c.referralPartner) ||
      c.referralPartner === referralFilter;
    return matchesSearch && matchesReferral;
  });

  // Group clients by referral partner when toggled
  const grouped: { partner: string; clients: Client[] }[] = [];
  if (groupByReferral) {
    const partnerMap = new Map<string, Client[]>();
    filtered.forEach((c) => {
      const key = c.referralPartner || "No Referral Partner";
      if (!partnerMap.has(key)) partnerMap.set(key, []);
      partnerMap.get(key)!.push(c);
    });
    // Sort: named partners first alphabetically, then "No Referral Partner" last
    const keys = Array.from(partnerMap.keys()).sort((a, b) => {
      if (a === "No Referral Partner") return 1;
      if (b === "No Referral Partner") return -1;
      return a.localeCompare(b);
    });
    keys.forEach((k) => grouped.push({ partner: k, clients: partnerMap.get(k)! }));
  }

  const statusBadge: Record<string, string> = {
    not_started: "badge-yellow",
    agreement_sent: "badge-blue",
    agreement_signed: "bg-brand-100 text-brand-800 badge",
    active: "badge-green",
  };

  const statusLabel: Record<string, string> = {
    not_started: "Not Started",
    agreement_sent: "Agreement Sent",
    agreement_signed: "Agreement Signed",
    active: "Active",
  };

  function renderClientRow(client: Client) {
    return (
      <tr key={client.id} className="hover:bg-gray-50">
        <td className="table-cell">
          <div>
            <div className="font-medium text-gray-900">
              {client.personalInfo.firstName} {client.personalInfo.lastName}
            </div>
            <div className="text-xs text-gray-500">{client.personalInfo.email}</div>
          </div>
        </td>
        <td className="table-cell">{client.businessInfo.businessName || "—"}</td>
        <td className="table-cell">
          {client.referralPartner ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              {client.referralPartner}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="table-cell">
          <span className={statusBadge[client.onboardingStatus]}>
            {statusLabel[client.onboardingStatus]}
          </span>
        </td>
        <td className="table-cell font-semibold text-emerald-600">
          ${client.totalFunded.toLocaleString()}
        </td>
        <td className="table-cell font-semibold text-amber-600">
          {client.fundingApplications.filter((a) => a.status === "pending").length}
        </td>
        <td className="table-cell">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/clients/${client.id}`}
              className="text-brand-600 hover:text-brand-800 text-sm font-medium"
            >
              Manage
            </Link>
            <button
              onClick={() => handleDelete(client.id)}
              className="text-red-500 hover:text-red-700 text-sm"
            >
              Remove
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderTableHeader() {
    return (
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="table-header">Client</th>
          <th className="table-header">Business</th>
          <th className="table-header">Referral Partner</th>
          <th className="table-header">Status</th>
          <th className="table-header">Total Funded</th>
          <th className="table-header">Pending Apps</th>
          <th className="table-header">Actions</th>
        </tr>
      </thead>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Clients</h1>
          <p className="text-gray-500 mt-1">{clients.length} total clients</p>
        </div>
        <Link href="/admin/onboard" className="btn-primary">
          + Onboard New Client
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="card p-4 space-y-3">
        <input
          className="input-field"
          placeholder="Search by name, email, business, or referral partner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-4 flex-wrap">
          {/* Referral Partner Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Referral Partner:</label>
            <select
              className="input-field w-auto text-sm py-1.5"
              value={referralFilter}
              onChange={(e) => setReferralFilter(e.target.value)}
            >
              <option value="all">All Clients</option>
              <option value="none">No Referral Partner</option>
              {referralPartners.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Group By Toggle */}
          <button
            onClick={() => setGroupByReferral(!groupByReferral)}
            className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              groupByReferral
                ? "bg-purple-100 border-purple-300 text-purple-800"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Group by Referral Partner
          </button>

          {/* Referral partner summary chips */}
          {referralPartners.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              {referralPartners.map((p) => {
                const count = clients.filter((c) => c.referralPartner === p).length;
                return (
                  <button
                    key={p}
                    onClick={() => setReferralFilter(referralFilter === p ? "all" : p)}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      referralFilter === p
                        ? "bg-purple-100 border-purple-300 text-purple-800"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {p}
                    <span className={`font-bold ${referralFilter === p ? "text-purple-900" : "text-gray-800"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Client List */}
      {filtered.length > 0 ? (
        groupByReferral ? (
          // Grouped view
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.partner}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${
                    group.partner === "No Referral Partner"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-purple-100 text-purple-800"
                  }`}>
                    {group.partner === "No Referral Partner" ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    )}
                    {group.partner}
                  </div>
                  <span className="text-sm text-gray-400">{group.clients.length} client{group.clients.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="card overflow-hidden">
                  <table className="w-full">
                    {renderTableHeader()}
                    <tbody className="divide-y divide-gray-100">
                      {group.clients.map(renderClientRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat view
          <div className="card overflow-hidden">
            <table className="w-full">
              {renderTableHeader()}
              <tbody className="divide-y divide-gray-100">
                {filtered.map(renderClientRow)}
              </tbody>
            </table>
          </div>
        )
      ) : clients.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="mb-4">No clients yet</p>
          <Link href="/admin/onboard" className="btn-primary">Onboard Your First Client</Link>
        </div>
      ) : (
        <div className="card p-8 text-center text-gray-400">
          <p>No clients match your search or filter</p>
        </div>
      )}
    </div>
  );
}
