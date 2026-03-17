"use client";

import { useState, useEffect } from "react";

interface FundingItem {
  id: string;
  type: string;
  lender: string;
  product: string;
  amount: number | null;
  status: "pending" | "applied" | "approved" | "funded" | "denied";
  appliedDate: string;
  fundedDate: string | null;
}

const STORAGE_KEY = "funding_crm_client_funded";

export default function FundedPage() {
  const [items, setItems] = useState<FundingItem[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setItems(JSON.parse(raw));
      } catch {}
    }
  }, []);

  const totalApproved = items.filter((i) => i.status === "approved" || i.status === "funded").reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalFunded = items.filter((i) => i.status === "funded").reduce((sum, i) => sum + (i.amount || 0), 0);
  const pendingCount = items.filter((i) => i.status === "pending" || i.status === "applied").length;

  const statusColors: Record<string, string> = {
    pending: "badge-yellow",
    applied: "badge-blue",
    approved: "badge-green",
    funded: "bg-emerald-600 text-white badge",
    denied: "badge-red",
  };

  const typeLabels: Record<string, string> = {
    credit_card: "Business Credit Card",
    line_of_credit: "Line of Credit",
    term_loan: "Term Loan",
    mca: "MCA",
    equipment_financing: "Equipment Financing",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Funding Overview</h1>
        <p className="text-gray-500 mt-1">Track your approved and funded amounts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card">
          <p className="text-sm text-gray-500 mb-1">Total Approved</p>
          <p className="text-3xl font-bold text-brand-700">${totalApproved.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-gray-500 mb-1">Total Funded</p>
          <p className="text-3xl font-bold text-emerald-600">${totalFunded.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-gray-500 mb-1">Pending Applications</p>
          <p className="text-3xl font-bold text-amber-600">{pendingCount}</p>
        </div>
      </div>

      {/* Funding Table */}
      {items.length > 0 ? (
        <>
          {/* Mobile card view */}
          <div className="mobile-card-list">
            {items.map((item) => (
              <div key={item.id} className="mobile-card-item">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{typeLabels[item.type] || item.type}</div>
                    <div className="text-xs text-gray-500">{item.lender} {item.product ? `- ${item.product}` : ""}</div>
                  </div>
                  <span className={statusColors[item.status]}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="font-semibold text-gray-900">
                    {item.amount ? `$${item.amount.toLocaleString()}` : "—"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {item.fundedDate
                      ? new Date(item.fundedDate).toLocaleDateString()
                      : new Date(item.appliedDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="card overflow-hidden table-responsive">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Type</th>
                  <th className="table-header">Lender</th>
                  <th className="table-header">Product</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{typeLabels[item.type] || item.type}</td>
                    <td className="table-cell">{item.lender}</td>
                    <td className="table-cell">{item.product}</td>
                    <td className="table-cell font-semibold">
                      {item.amount ? `$${item.amount.toLocaleString()}` : "—"}
                    </td>
                    <td className="table-cell">
                      <span className={statusColors[item.status]}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </span>
                    </td>
                    <td className="table-cell text-gray-500">
                      {item.fundedDate
                        ? new Date(item.fundedDate).toLocaleDateString()
                        : new Date(item.appliedDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card p-12 text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>No funding applications yet. Your team will update this as you progress.</p>
        </div>
      )}
    </div>
  );
}
