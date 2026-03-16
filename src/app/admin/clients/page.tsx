"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Client } from "@/lib/types";
import { getClients, deleteClient } from "@/lib/store";

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setClients(getClients());
  }, []);

  function handleDelete(id: string) {
    if (confirm("Are you sure you want to remove this client?")) {
      deleteClient(id);
      setClients(getClients());
    }
  }

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.personalInfo.firstName.toLowerCase().includes(q) ||
      c.personalInfo.lastName.toLowerCase().includes(q) ||
      c.personalInfo.email.toLowerCase().includes(q) ||
      c.businessInfo.businessName.toLowerCase().includes(q)
    );
  });

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

      {/* Search */}
      <div className="card p-4">
        <input
          className="input-field"
          placeholder="Search by name, email, or business..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Client List */}
      {filtered.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Client</th>
                <th className="table-header">Business</th>
                <th className="table-header">Status</th>
                <th className="table-header">Total Funded</th>
                <th className="table-header">Pending Apps</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((client) => (
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
              ))}
            </tbody>
          </table>
        </div>
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
          <p>No clients match your search</p>
        </div>
      )}
    </div>
  );
}
