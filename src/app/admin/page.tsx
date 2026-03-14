"use client";

import { useState, useEffect, useRef } from "react";
import { getClients } from "@/lib/store";
import { Client, FundingApplication } from "@/lib/types";

type TimeFilter = "all" | "year" | "quarter" | "month" | "week" | "day";

const TIME_LABELS: Record<TimeFilter, string> = {
  all: "All Time",
  year: "Last Year",
  quarter: "Quarter",
  month: "Month",
  week: "Last 7 Days",
  day: "Today",
};

const TYPE_LABELS: Record<string, string> = {
  credit_card: "Credit Card Stacking",
  line_of_credit: "Business Lines of Credit",
  term_loan: "Term Loans",
  mca: "MCA",
  equipment_financing: "Equipment Financing",
};

function getFilterDate(filter: TimeFilter, customDate?: string): Date | null {
  if (filter === "all") return null;
  const now = customDate ? new Date(customDate) : new Date();
  const d = new Date(now);
  switch (filter) {
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "quarter":
      d.setMonth(d.getMonth() - 3);
      break;
    case "month":
      d.setMonth(d.getMonth() - 1);
      break;
    case "week":
      d.setDate(d.getDate() - 7);
      break;
    case "day":
      d.setHours(0, 0, 0, 0);
      break;
  }
  return d;
}

function filterApplications(
  apps: FundingApplication[],
  filter: TimeFilter,
  customDate?: string
): FundingApplication[] {
  const cutoff = getFilterDate(filter, customDate);
  if (!cutoff) return apps;
  return apps.filter((a) => {
    if (!a.fundedDate) return false;
    return new Date(a.fundedDate) >= cutoff;
  });
}

function getFundedApps(clients: Client[]): FundingApplication[] {
  return clients.flatMap((c) =>
    c.fundingApplications.filter((a) => a.status === "funded")
  );
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function avgDaysToFund(apps: FundingApplication[]): number | null {
  const valid = apps.filter((a) => a.fundedDate && a.appliedDate);
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, a) => {
    const applied = new Date(a.appliedDate).getTime();
    const funded = new Date(a.fundedDate!).getTime();
    return sum + (funded - applied) / (1000 * 60 * 60 * 24);
  }, 0);
  return Math.round(total / valid.length);
}

export default function AdminDashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [customDate, setCustomDate] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClients(getClients());
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const allFunded = getFundedApps(clients);
  const filtered = filterApplications(allFunded, timeFilter, customDate || undefined);
  const totalFunded = filtered.reduce((s, a) => s + (a.amount || 0), 0);

  // All applications across all clients
  const allApps = clients.flatMap((c) => c.fundingApplications);

  // --- Metrics ---
  const totalClients = clients.length;
  const fundedClients = clients.filter((c) =>
    c.fundingApplications.some((a) => a.status === "funded")
  ).length;
  const inFundingClients = clients.filter(
    (c) =>
      c.fundingApplications.some(
        (a) => a.status === "pending" || a.status === "applied" || a.status === "approved"
      ) && !c.fundingApplications.some((a) => a.status === "funded")
  ).length;

  // Pipeline breakdown by stage
  const pipelinePending = allApps.filter((a) => a.status === "pending").length;
  const pipelineApplied = allApps.filter((a) => a.status === "applied").length;
  const pipelineApproved = allApps.filter((a) => a.status === "approved").length;

  // Approval rate
  const decidedApps = allApps.filter(
    (a) => a.status === "approved" || a.status === "funded" || a.status === "denied"
  );
  const approvedApps = decidedApps.filter(
    (a) => a.status === "approved" || a.status === "funded"
  );
  const approvalRate =
    decidedApps.length > 0
      ? Math.round((approvedApps.length / decidedApps.length) * 100)
      : null;

  // Average deal size (funded only)
  const avgDeal =
    filtered.length > 0 ? totalFunded / filtered.length : null;

  // Average time to fund
  const avgDays = avgDaysToFund(filtered);

  // Funding by type
  const byType = Object.keys(TYPE_LABELS).map((type) => {
    const apps = filtered.filter((a) => a.type === type);
    const total = apps.reduce((s, a) => s + (a.amount || 0), 0);
    return { type, label: TYPE_LABELS[type], count: apps.length, total };
  });

  // Funding by lender + product
  const lenderMap = new Map<string, { lender: string; product: string; count: number; total: number }>();
  filtered.forEach((a) => {
    const key = `${a.lender}|||${a.product}`;
    const existing = lenderMap.get(key);
    if (existing) {
      existing.count++;
      existing.total += a.amount || 0;
    } else {
      lenderMap.set(key, {
        lender: a.lender,
        product: a.product,
        count: 1,
        total: a.amount || 0,
      });
    }
  });
  const byLender = Array.from(lenderMap.values()).sort((a, b) => b.total - a.total);

  // Bar chart max for type breakdown
  const maxTypeTotal = Math.max(...byType.map((t) => t.total), 1);

  return (
    <div className="space-y-6">
      {/* Header + Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Funding overview &amp; metrics</p>
        </div>
        <div className="flex items-center gap-2 relative" ref={calRef}>
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-xs">
            {(Object.keys(TIME_LABELS) as TimeFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setTimeFilter(f);
                  setCustomDate("");
                }}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  timeFilter === f && !customDate
                    ? "bg-brand-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {TIME_LABELS[f]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            title="Pick a custom start date"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          {showCalendar && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
              <label className="text-xs text-gray-500 block mb-1">Show funded since:</label>
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setTimeFilter("all");
                  setShowCalendar(false);
                }}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Funded" value={formatCurrency(totalFunded)} sub={`${filtered.length} deals`} accent />
        <StatCard label="Avg Deal Size" value={avgDeal !== null ? formatCurrency(avgDeal) : "—"} />
        <StatCard label="Approval Rate" value={approvalRate !== null ? `${approvalRate}%` : "—"} sub={`${approvedApps.length}/${decidedApps.length} decided`} />
        <StatCard label="Avg Time to Fund" value={avgDays !== null ? `${avgDays}d` : "—"} />
      </div>

      {/* Client Counts + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Client Counts */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Clients</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalClients}</div>
              <div className="text-xs text-gray-500">Total in CRM</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{fundedClients}</div>
              <div className="text-xs text-gray-500">Funded</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{inFundingClients}</div>
              <div className="text-xs text-gray-500">In Funding</div>
            </div>
          </div>
        </div>

        {/* Pipeline Breakdown */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Pipeline</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-500">{pipelinePending}</div>
              <div className="text-xs text-gray-500">Pending</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{pipelineApplied}</div>
              <div className="text-xs text-gray-500">Applied</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{pipelineApproved}</div>
              <div className="text-xs text-gray-500">Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Funding by Type */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Funding by Type</h2>
        <div className="space-y-3">
          {byType.map((t) => (
            <div key={t.type} className="flex items-center gap-3">
              <div className="w-44 text-xs text-gray-600 shrink-0">{t.label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-brand-600 h-full rounded-full transition-all"
                  style={{ width: `${(t.total / maxTypeTotal) * 100}%` }}
                />
              </div>
              <div className="w-28 text-right text-xs font-medium text-gray-700 shrink-0">
                {formatCurrency(t.total)} ({t.count})
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Funded by Lender + Product */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Funded by Lender &amp; Product</h2>
        {byLender.length === 0 ? (
          <p className="text-xs text-gray-400">No funded applications to display.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Lender</th>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium text-right">Deals</th>
                  <th className="pb-2 font-medium text-right">Total Funded</th>
                </tr>
              </thead>
              <tbody>
                {byLender.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800">{row.lender || "—"}</td>
                    <td className="py-2 text-gray-600">{row.product || "—"}</td>
                    <td className="py-2 text-right text-gray-700">{row.count}</td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "bg-brand-600 border-brand-600" : "bg-white border-gray-200"}`}>
      <div className={`text-xs font-medium mb-1 ${accent ? "text-brand-100" : "text-gray-500"}`}>
        {label}
      </div>
      <div className={`text-xl font-bold ${accent ? "text-white" : "text-gray-900"}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-xs mt-0.5 ${accent ? "text-brand-200" : "text-gray-400"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}
