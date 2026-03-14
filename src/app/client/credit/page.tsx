"use client";

import { useState, useEffect } from "react";

interface BureauScore {
  bureau: string;
  score: number | null;
  accounts: number | null;
  creditAge: string;
  derogatory: number | null;
  highestLimit: number | null;
  inquiries: number | null;
}

const STORAGE_KEY = "funding_crm_client_credit";

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
  const [bureaus, setBureaus] = useState<BureauScore[]>([
    { bureau: "Experian", score: null, accounts: null, creditAge: "", derogatory: null, highestLimit: null, inquiries: null },
    { bureau: "Equifax", score: null, accounts: null, creditAge: "", derogatory: null, highestLimit: null, inquiries: null },
    { bureau: "TransUnion", score: null, accounts: null, creditAge: "", derogatory: null, highestLimit: null, inquiries: null },
  ]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setBureaus(JSON.parse(raw));
      } catch {}
    }
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Credit Data Points</h1>
        <p className="text-gray-500 mt-1">View your credit profile across all three bureaus</p>
      </div>

      {/* Score Overview */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-brand-900 mb-6">Credit Scores</h2>
        <div className="flex flex-wrap justify-center gap-12">
          {bureaus.map((b) => (
            <div key={b.bureau} className="text-center">
              <ScoreGauge score={b.score} />
              <p className="mt-2 font-medium text-gray-700">{b.bureau}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {bureaus.map((b) => (
          <div key={b.bureau} className="card p-6">
            <h3 className="font-semibold text-brand-800 text-lg mb-4 border-b border-gray-100 pb-2">{b.bureau}</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Score</span>
                <span className="font-semibold text-gray-900">{b.score ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Total Accounts</span>
                <span className="font-semibold text-gray-900">{b.accounts ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Credit Age</span>
                <span className="font-semibold text-gray-900">{b.creditAge || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Derogatory Accounts</span>
                <span className={`font-semibold ${(b.derogatory ?? 0) > 0 ? "text-red-600" : "text-gray-900"}`}>
                  {b.derogatory ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Highest Credit Limit</span>
                <span className="font-semibold text-gray-900">
                  {b.highestLimit ? `$${b.highestLimit.toLocaleString()}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Inquiries</span>
                <span className={`font-semibold ${(b.inquiries ?? 0) > 5 ? "text-amber-600" : "text-gray-900"}`}>
                  {b.inquiries ?? "—"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4 bg-brand-50 border-brand-200">
        <p className="text-sm text-brand-700">
          <strong>Note:</strong> Your credit data is managed by your funding team. If you see incorrect data, please contact your representative.
        </p>
      </div>
    </div>
  );
}
