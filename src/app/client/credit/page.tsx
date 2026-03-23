"use client";

import { useState, useEffect } from "react";
import { getMyCreditProfile } from "@/lib/client-portal-actions";
import LoadingSpinner from "@/components/LoadingSpinner";

interface BureauData {
  score: number | null;
  accounts: number | null;
  creditAge: string;
  derogatoryAccounts: number | null;
  highestCreditLimit: number | null;
  inquiries: number | null;
}

function ScoreGauge({ score }: { score: number | null }) {
  if (!score) {
    return (
      <div className="flex items-center justify-center w-28 h-28 rounded-full border-8 border-gray-200">
        <span className="text-gray-400 text-sm">N/A</span>
      </div>
    );
  }
  const pct = ((score - 300) / 550) * 100;
  const color = score >= 740 ? "text-emerald-600 border-emerald-400" : score >= 670 ? "text-brand-600 border-brand-400" : score >= 580 ? "text-amber-600 border-amber-400" : "text-red-600 border-red-400";
  return (
    <div className={`flex items-center justify-center w-28 h-28 rounded-full border-8 ${color}`}>
      <div className="text-center">
        <div className={`text-2xl font-bold ${color.split(" ")[0]}`}>{score}</div>
        <div className="text-xs text-gray-500">{pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : pct >= 40 ? "Fair" : "Poor"}</div>
      </div>
    </div>
  );
}

export default function CreditPage() {
  const [creditProfile, setCreditProfile] = useState<Record<string, BureauData> | null>(null);
  const [monitoringStatus, setMonitoringStatus] = useState("");
  const [monitoringProvider, setMonitoringProvider] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getMyCreditProfile();
        setCreditProfile(data.creditProfile);
        setMonitoringStatus(data.monitoringStatus);
        setMonitoringProvider(data.monitoringProvider);
      } catch {
        // Credit profile load failed
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner message="Loading credit data..." />;

  const bureaus = [
    { key: "experian", label: "Experian" },
    { key: "equifax", label: "Equifax" },
    { key: "transUnion", label: "TransUnion" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Credit Data Points</h1>
        <p className="text-gray-500 mt-1">View your credit profile across all three bureaus</p>
      </div>

      {/* Score Overview */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-brand-900 mb-6">Credit Scores</h2>
        <div className="flex flex-wrap justify-center gap-6 sm:gap-12">
          {bureaus.map((b) => {
            const data = creditProfile?.[b.key] as BureauData | undefined;
            return (
              <div key={b.key} className="text-center">
                <ScoreGauge score={data?.score ?? null} />
                <p className="mt-2 font-medium text-gray-700">{b.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {bureaus.map((b) => {
          const data = creditProfile?.[b.key] as BureauData | undefined;
          return (
            <div key={b.key} className="card p-6">
              <h3 className="font-semibold text-brand-800 text-lg mb-4 border-b border-gray-100 pb-2">{b.label}</h3>
              <div className="space-y-3">
                <Row label="Score" value={data?.score ?? null} />
                <Row label="Total Accounts" value={data?.accounts ?? null} />
                <Row label="Credit Age" value={data?.creditAge || null} />
                <Row label="Derogatory Accounts" value={data?.derogatoryAccounts ?? null} warn={(data?.derogatoryAccounts ?? 0) > 0} />
                <Row label="Highest Credit Limit" value={data?.highestCreditLimit ? `$${data.highestCreditLimit.toLocaleString()}` : null} />
                <Row label="Inquiries" value={data?.inquiries ?? null} warn={(data?.inquiries ?? 0) > 5} />
              </div>
            </div>
          );
        })}
      </div>

      {monitoringStatus && (
        <div className="card p-4 bg-brand-50 border-brand-200">
          <p className="text-sm text-brand-700">
            <strong>Credit Monitoring:</strong> {monitoringStatus === "active" ? "Active" : "Pending"}{monitoringProvider ? ` via ${monitoringProvider}` : ""}
          </p>
        </div>
      )}

      <div className="card p-4 bg-brand-50 border-brand-200">
        <p className="text-sm text-brand-700">
          <strong>Note:</strong> Your credit data is managed by your funding team. If you see incorrect data, please contact your representative.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string | number | null; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`font-semibold ${warn ? "text-red-600" : "text-gray-900"}`}>
        {value !== null && value !== undefined ? String(value) : "—"}
      </span>
    </div>
  );
}
