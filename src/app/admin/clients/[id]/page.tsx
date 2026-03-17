"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Client, FundingApplication, CreditBureauData, ActivityEntry } from "@/lib/types";
import { getClient, upsertClient, getApiKey, setApiKey, getApiProvider, setApiProvider, getReferralPartners, getLenders, ensureLenderByName } from "@/lib/store";

type Tab = "credit" | "business" | "applications" | "documents" | "notes";

const bureauNames = ["experian", "equifax", "transUnion"] as const;
const bureauLabels: Record<string, string> = {
  experian: "Experian",
  equifax: "Equifax",
  transUnion: "TransUnion",
};

const appTypes = [
  { value: "credit_card", label: "Business Credit Card" },
  { value: "line_of_credit", label: "Line of Credit" },
  { value: "term_loan", label: "Term Loan" },
  { value: "mca", label: "MCA" },
  { value: "equipment_financing", label: "Equipment Financing" },
  { value: "sba", label: "SBA Loan" },
];

const appStatuses = [
  { value: "pending", label: "Pending" },
  { value: "applied", label: "Applied" },
  { value: "approved", label: "Approved" },
  { value: "funded", label: "Funded" },
  { value: "denied", label: "Denied" },
];

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("credit");
  const [saved, setSaved] = useState(false);
  const [apiKey, setApiKeyState] = useState("");
  const [apiProvider, setApiProviderState] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; base64: string }[]>([]);
  const [uploadDocType, setUploadDocType] = useState("bank_statement");
  const [uploadCustomName, setUploadCustomName] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [savedPartners, setSavedPartners] = useState<string[]>([]);
  const [lenderNames, setLenderNames] = useState<string[]>([]);
  const [newNote, setNewNote] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const c = getClient(params.id as string);
    if (!c) {
      router.push("/admin/clients");
      return;
    }
    setClient(c);
    setApiKeyState(getApiKey());
    setApiProviderState(getApiProvider());
    setSavedPartners(getReferralPartners());
    setLenderNames(getLenders().map((l) => l.name).filter(Boolean).sort());
  }, [params.id, router]);

  function save(updated: Client) {
    // Recalculate totals
    updated.totalApproved = updated.fundingApplications
      .filter((a) => a.status === "approved" || a.status === "funded")
      .reduce((sum, a) => sum + (a.amount || 0), 0);
    updated.totalFunded = updated.fundingApplications
      .filter((a) => a.status === "funded")
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    // Ensure activityLog exists for older clients
    if (!updated.activityLog) updated.activityLog = [];

    upsertClient(updated);
    setClient({ ...updated });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addActivity(updated: Client, type: ActivityEntry["type"], message: string, details?: string) {
    if (!updated.activityLog) updated.activityLog = [];
    updated.activityLog.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
    });
  }

  function updateBureau(bureau: typeof bureauNames[number], field: keyof CreditBureauData, value: string) {
    if (!client) return;
    const updated = { ...client };
    const numFields: (keyof CreditBureauData)[] = ["score", "accounts", "derogatoryAccounts", "highestCreditLimit", "inquiries"];
    if (numFields.includes(field)) {
      (updated.creditProfile[bureau] as any)[field] = value === "" ? null : Number(value);
    } else {
      (updated.creditProfile[bureau] as any)[field] = value;
    }
    save(updated);
  }

  function updateBusiness(field: string, value: string) {
    if (!client) return;
    const updated = { ...client };
    (updated.businessInfo as any)[field] = value;
    save(updated);
  }

  function updatePersonal(field: string, value: string) {
    if (!client) return;
    const updated = { ...client };
    (updated.personalInfo as any)[field] = value;
    save(updated);
  }

  function addApplication() {
    if (!client) return;
    const newApp: FundingApplication = {
      id: crypto.randomUUID(),
      type: "credit_card",
      lender: "",
      product: "",
      amount: null,
      status: "pending",
      appliedDate: new Date().toISOString().split("T")[0],
      approvedDate: null,
      fundedDate: null,
      notes: "",
    };
    const updated = { ...client, fundingApplications: [...client.fundingApplications, newApp] };
    addActivity(updated, "application", "Added a new funding application");
    save(updated);
  }

  function updateApplication(id: string, field: keyof FundingApplication, value: string) {
    if (!client) return;
    const updated = { ...client };
    const app = updated.fundingApplications.find((a) => a.id === id);
    if (!app) return;
    const oldValue = (app as any)[field];
    if (field === "amount") {
      app.amount = value === "" ? null : Number(value);
    } else {
      (app as any)[field] = value;
    }
    // Auto-add lender to marketplace when name is set
    if (field === "lender" && value.trim()) {
      ensureLenderByName(value);
      setLenderNames(getLenders().map((l) => l.name).filter(Boolean).sort());
    }
    // Log status changes
    if (field === "status" && value !== oldValue) {
      const lenderLabel = app.lender || "Unknown lender";
      addActivity(updated, "status_change", `Application status changed to "${value}"`, `${lenderLabel} — ${app.product || "No product"}`);
    }
    save(updated);
  }

  function removeApplication(id: string) {
    if (!client) return;
    const removed = client.fundingApplications.find((a) => a.id === id);
    const updated = {
      ...client,
      fundingApplications: client.fundingApplications.filter((a) => a.id !== id),
    };
    if (removed) {
      addActivity(updated, "application", `Removed application`, `${removed.lender || "Unknown lender"} — ${removed.product || "No product"}`);
    }
    save(updated);
  }

  function reorderApplications(fromIndex: number, toIndex: number) {
    if (!client || fromIndex === toIndex) return;
    const apps = [...client.fundingApplications];
    const [moved] = apps.splice(fromIndex, 1);
    apps.splice(toIndex, 0, moved);
    save({ ...client, fundingApplications: apps });
  }

  function saveApiSettings() {
    setApiKey(apiKey);
    setApiProvider(apiProvider);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateOnboardingStatus(status: Client["onboardingStatus"]) {
    if (!client) return;
    const updated = { ...client, onboardingStatus: status };
    if (status === "active" && !updated.onboardedAt) {
      updated.onboardedAt = new Date().toISOString();
    }
    const labels: Record<string, string> = { not_started: "Not Started", agreement_sent: "Agreement Sent", agreement_signed: "Agreement Signed", active: "Active" };
    addActivity(updated, "onboarding", `Onboarding status changed to "${labels[status] || status}"`);
    save(updated);
  }

  async function sendOnboardingEmail() {
    if (!client || !client.personalInfo.email) {
      alert("Client must have an email address to send the onboarding link.");
      return;
    }
    setEmailSending(true);
    const link = `${window.location.origin}/onboard/${client.id}`;

    try {
      const res = await fetch("/api/send-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: `${client.personalInfo.firstName} ${client.personalInfo.lastName}`.trim() || "Client",
          clientEmail: client.personalInfo.email,
          onboardingLink: link,
          businessName: client.businessInfo.businessName || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Failed to send email: ${data.error || "Unknown error"}. Make sure RESEND_API_KEY is set in your .env.local file.`);
        setEmailSending(false);
        return;
      }

      const updated = {
        ...client,
        onboardingStatus: (client.onboardingStatus === "not_started" ? "agreement_sent" : client.onboardingStatus) as Client["onboardingStatus"],
        onboardingEmailSentAt: new Date().toISOString(),
      };
      addActivity(updated, "email", "Sent onboarding email", client.personalInfo.email);
      save(updated);
      setEmailSending(false);
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 4000);
    } catch (err) {
      console.error("Email send error:", err);
      alert("Failed to send email. Check your network connection and RESEND_API_KEY.");
      setEmailSending(false);
    }
  }

  if (!client) return null;

  const onboardingLink = `${typeof window !== "undefined" ? window.location.origin : ""}/onboard/${client.id}`;
  const steps = client.onboardingCompletedSteps || { agreement: false, businessForm: false, creditMonitoring: false };
  const completedStepCount = [steps.agreement, steps.businessForm, steps.creditMonitoring].filter(Boolean).length;

  const tabs: { key: Tab; label: string }[] = [
    { key: "credit", label: "Credit Profile" },
    { key: "business", label: "Business Info" },
    { key: "applications", label: "Application Stacking" },
    { key: "documents", label: "Documents" },
    { key: "notes", label: "Activity" },
  ];

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/clients" className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {client.personalInfo.firstName} {client.personalInfo.lastName || "New Client"}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-500">{client.personalInfo.email || "No email"}</span>
              <span className={statusBadge[client.onboardingStatus]}>
                {statusLabel[client.onboardingStatus]}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Status:</span>
            <select
              className="input-field w-auto text-sm"
              value={client.onboardingStatus}
              onChange={(e) => updateOnboardingStatus(e.target.value as Client["onboardingStatus"])}
            >
              <option value="not_started">Not Started</option>
              <option value="agreement_sent">Agreement Sent</option>
              <option value="agreement_signed">Agreement Signed</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Funded</p>
          <p className="text-2xl font-bold text-emerald-600">${client.totalFunded.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Approved</p>
          <p className="text-2xl font-bold text-brand-600">${client.totalApproved.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Applications</p>
          <p className="text-2xl font-bold text-gray-900">{client.fundingApplications.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Documents</p>
          <p className="text-2xl font-bold text-gray-900">{client.documents.length}</p>
        </div>
      </div>

      {/* Client Onboarding Panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Client Onboarding</h3>
              <p className="text-sm text-gray-500">
                Send the client access to their dashboard to complete onboarding
              </p>
            </div>
          </div>
          <button
            onClick={sendOnboardingEmail}
            disabled={emailSending || !client.personalInfo.email}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {emailSending ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </>
            ) : emailSent ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Email Sent!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                {client.onboardingEmailSentAt ? "Resend Onboarding Email" : "Send Onboarding Email"}
              </>
            )}
          </button>
        </div>

        {/* Onboarding Link Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">Client Onboarding Link</p>
              <p className="text-sm font-mono text-brand-700 break-all">{onboardingLink}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(onboardingLink);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
              className="btn-secondary text-xs px-3 py-1.5 shrink-0 ml-3"
            >
              Copy Link
            </button>
          </div>
        </div>

        {/* Onboarding Progress */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-lg border p-3 ${steps.agreement ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-1">
              {steps.agreement ? (
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={`text-xs font-semibold ${steps.agreement ? "text-emerald-700" : "text-gray-600"}`}>
                Step 1
              </span>
            </div>
            <p className={`text-sm font-medium ${steps.agreement ? "text-emerald-800" : "text-gray-700"}`}>
              Funding Agreement
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {steps.agreement
                ? `Signed ${client.agreementSignature?.dateSigned ? new Date(client.agreementSignature.dateSigned).toLocaleDateString() : ""}`
                : "Not signed yet"}
            </p>
          </div>

          <div className={`rounded-lg border p-3 ${steps.businessForm ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-1">
              {steps.businessForm ? (
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={`text-xs font-semibold ${steps.businessForm ? "text-emerald-700" : "text-gray-600"}`}>
                Step 2
              </span>
            </div>
            <p className={`text-sm font-medium ${steps.businessForm ? "text-emerald-800" : "text-gray-700"}`}>
              Business Funding Form
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {steps.businessForm ? "Completed" : "Not submitted yet"}
            </p>
          </div>

          <div className={`rounded-lg border p-3 ${steps.creditMonitoring ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-1">
              {steps.creditMonitoring ? (
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={`text-xs font-semibold ${steps.creditMonitoring ? "text-emerald-700" : "text-gray-600"}`}>
                Step 3
              </span>
            </div>
            <p className={`text-sm font-medium ${steps.creditMonitoring ? "text-emerald-800" : "text-gray-700"}`}>
              Credit Monitoring
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {steps.creditMonitoring ? `Active — ${client.creditMonitoringProvider || "Provider set"}` : "Not activated"}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Onboarding Progress</span>
            <span>{completedStepCount}/3 completed</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: `${(completedStepCount / 3) * 100}%` }}
            />
          </div>
        </div>

        {client.onboardingEmailSentAt && (
          <p className="text-xs text-gray-400 mt-3">
            Last sent: {new Date(client.onboardingEmailSentAt).toLocaleString()} to {client.personalInfo.email}
          </p>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* CREDIT PROFILE TAB */}
      {activeTab === "credit" && (
        <div className="space-y-6">
          {/* Manual Credit Entry per Bureau */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {bureauNames.map((bureau) => {
              const data = client.creditProfile[bureau];
              return (
                <div key={bureau} className="card p-6">
                  <h3 className="font-semibold text-lg text-brand-800 mb-4 pb-2 border-b border-gray-100">
                    {bureauLabels[bureau]}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="label">Score</label>
                      <input
                        className="input-field"
                        type="number"
                        min="300"
                        max="850"
                        placeholder="300-850"
                        value={data.score ?? ""}
                        onChange={(e) => updateBureau(bureau, "score", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Number of Accounts</label>
                      <input
                        className="input-field"
                        type="number"
                        min="0"
                        value={data.accounts ?? ""}
                        onChange={(e) => updateBureau(bureau, "accounts", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Overall Credit Age</label>
                      <input
                        className="input-field"
                        placeholder="e.g. 5 years 3 months"
                        value={data.creditAge}
                        onChange={(e) => updateBureau(bureau, "creditAge", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Derogatory Accounts</label>
                      <input
                        className="input-field"
                        type="number"
                        min="0"
                        value={data.derogatoryAccounts ?? ""}
                        onChange={(e) => updateBureau(bureau, "derogatoryAccounts", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Highest Personal Credit Limit</label>
                      <input
                        className="input-field"
                        type="number"
                        min="0"
                        placeholder="$"
                        value={data.highestCreditLimit ?? ""}
                        onChange={(e) => updateBureau(bureau, "highestCreditLimit", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Number of Inquiries</label>
                      <input
                        className="input-field"
                        type="number"
                        min="0"
                        value={data.inquiries ?? ""}
                        onChange={(e) => updateBureau(bureau, "inquiries", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* API Configuration */}
          <div className="card p-6 bg-brand-50 border-brand-200">
            <h3 className="font-semibold text-brand-900 mb-3">Credit Data API Configuration</h3>
            <p className="text-sm text-brand-700 mb-4">
              Connect a credit data provider API to automatically pull credit reports. Until configured, use the manual entry fields above.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">API Provider</label>
                <select
                  className="input-field"
                  value={apiProvider}
                  onChange={(e) => setApiProviderState(e.target.value)}
                >
                  <option value="">Select Provider...</option>
                  <option value="array">Array (formerly Creditworks)</option>
                  <option value="smartcredit">SmartCredit</option>
                  <option value="creditapi">CreditAPI</option>
                  <option value="softpull">SoftPull</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">API Key</label>
                <input
                  className="input-field"
                  type="password"
                  placeholder="Enter API key..."
                  value={apiKey}
                  onChange={(e) => setApiKeyState(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <button onClick={saveApiSettings} className="btn-primary w-full">
                  Save API Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BUSINESS INFO TAB */}
      {activeTab === "business" && (
        <div className="space-y-6">
          {/* Referral Partner */}
          <div className="card p-6 bg-purple-50 border-purple-200">
            <h3 className="font-semibold text-lg text-purple-800 mb-3">Referral Partner</h3>
            <p className="text-sm text-purple-600 mb-3">Assign a referral partner who referred this client for funding.</p>
            <select
              className="input-field"
              value={client.referralPartner || ""}
              onChange={(e) => {
                const updated = { ...client, referralPartner: e.target.value };
                save(updated);
              }}
            >
              <option value="">No Referral Partner</option>
              {savedPartners.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {savedPartners.length === 0 && (
              <p className="text-xs text-purple-500 mt-2">
                No referral partners added yet. Go to <Link href="/admin/clients" className="underline font-medium">All Clients</Link> and click &quot;Manage Partners&quot; to add them.
              </p>
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-lg text-brand-800 mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">First Name</label>
                <input className="input-field" value={client.personalInfo.firstName} onChange={(e) => updatePersonal("firstName", e.target.value)} />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input className="input-field" value={client.personalInfo.lastName} onChange={(e) => updatePersonal("lastName", e.target.value)} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input-field" type="email" value={client.personalInfo.email} onChange={(e) => updatePersonal("email", e.target.value)} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input-field" type="tel" value={client.personalInfo.phone} onChange={(e) => updatePersonal("phone", e.target.value)} />
              </div>
              <div>
                <label className="label">Date of Birth</label>
                <input className="input-field" type="date" value={client.personalInfo.dateOfBirth} onChange={(e) => updatePersonal("dateOfBirth", e.target.value)} />
              </div>
              <div>
                <label className="label">SSN (Last 4)</label>
                <input className="input-field" maxLength={4} placeholder="XXXX" value={client.personalInfo.ssn} onChange={(e) => updatePersonal("ssn", e.target.value)} />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input-field" value={client.personalInfo.address} onChange={(e) => updatePersonal("address", e.target.value)} />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input-field" value={client.personalInfo.city} onChange={(e) => updatePersonal("city", e.target.value)} />
              </div>
              <div>
                <label className="label">State</label>
                <input className="input-field" value={client.personalInfo.state} onChange={(e) => updatePersonal("state", e.target.value)} />
              </div>
              <div>
                <label className="label">ZIP</label>
                <input className="input-field" value={client.personalInfo.zip} onChange={(e) => updatePersonal("zip", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-lg text-brand-800 mb-4">Business Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Business Name</label>
                <input className="input-field" value={client.businessInfo.businessName} onChange={(e) => updateBusiness("businessName", e.target.value)} />
              </div>
              <div>
                <label className="label">Business Age</label>
                <input className="input-field" placeholder="e.g. 2 years" value={client.businessInfo.businessAge} onChange={(e) => updateBusiness("businessAge", e.target.value)} />
              </div>
              <div>
                <label className="label">EIN</label>
                <input className="input-field" value={client.businessInfo.ein} onChange={(e) => updateBusiness("ein", e.target.value)} />
              </div>
              <div>
                <label className="label">NAICS Code</label>
                <input className="input-field" value={client.businessInfo.naicsCode} onChange={(e) => updateBusiness("naicsCode", e.target.value)} />
              </div>
              <div>
                <label className="label">SIC Code</label>
                <input className="input-field" value={client.businessInfo.sicCode} onChange={(e) => updateBusiness("sicCode", e.target.value)} />
              </div>
              <div>
                <label className="label">Entity Type</label>
                <select className="input-field" value={client.businessInfo.entityType} onChange={(e) => updateBusiness("entityType", e.target.value)}>
                  <option value="">Select...</option>
                  <option value="sole_proprietorship">Sole Proprietorship</option>
                  <option value="llc">LLC</option>
                  <option value="corporation">Corporation</option>
                  <option value="s_corp">S-Corp</option>
                  <option value="partnership">Partnership</option>
                </select>
              </div>
              <div>
                <label className="label">State of Incorporation</label>
                <input className="input-field" value={client.businessInfo.stateOfIncorporation} onChange={(e) => updateBusiness("stateOfIncorporation", e.target.value)} />
              </div>
              <div>
                <label className="label">Annual Revenue</label>
                <input className="input-field" placeholder="$" value={client.businessInfo.annualRevenue} onChange={(e) => updateBusiness("annualRevenue", e.target.value)} />
              </div>
              <div>
                <label className="label">Business Phone</label>
                <input className="input-field" type="tel" value={client.businessInfo.businessPhone} onChange={(e) => updateBusiness("businessPhone", e.target.value)} />
              </div>
              <div className="md:col-span-3">
                <label className="label">Business Address</label>
                <input className="input-field" value={client.businessInfo.businessAddress} onChange={(e) => updateBusiness("businessAddress", e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPLICATION STACKING TAB */}
      {activeTab === "applications" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg text-gray-900">Application Stacking & Sequences</h3>
            <button onClick={addApplication} className="btn-primary">+ Add Application</button>
          </div>

          {/* Pipeline Overview — at-a-glance status counts */}
          {client.fundingApplications.length > 0 && (() => {
            const apps = client.fundingApplications;
            const pending = apps.filter((a) => a.status === "pending");
            const applied = apps.filter((a) => a.status === "applied");
            const approved = apps.filter((a) => a.status === "approved");
            const funded = apps.filter((a) => a.status === "funded");
            const denied = apps.filter((a) => a.status === "denied");
            const totalAmt = funded.reduce((s, a) => s + (a.amount || 0), 0);
            const allDone = apps.length > 0 && apps.every((a) => a.status === "funded" || a.status === "denied");
            return (
              <>
                {/* Overall Status Banner */}
                <div className={`rounded-lg border p-4 flex items-center gap-3 ${
                  allDone && funded.length > 0
                    ? "bg-emerald-50 border-emerald-200"
                    : allDone && funded.length === 0
                    ? "bg-red-50 border-red-200"
                    : "bg-brand-50 border-brand-200"
                }`}>
                  {allDone && funded.length > 0 ? (
                    <svg className="w-6 h-6 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className={`font-semibold ${allDone && funded.length > 0 ? "text-emerald-800" : "text-brand-900"}`}>
                      {allDone && funded.length > 0
                        ? `All applications complete — $${totalAmt.toLocaleString()} funded across ${funded.length} deal${funded.length > 1 ? "s" : ""}`
                        : allDone && funded.length === 0
                        ? "All applications have been decided — none funded"
                        : `${apps.length} application${apps.length > 1 ? "s" : ""} in pipeline — ${funded.length} funded, ${pending.length + applied.length + approved.length} in progress`}
                    </p>
                  </div>
                </div>

                {/* Pipeline Stage Counts */}
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: "Pending", count: pending.length, color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-200" },
                    { label: "Applied", count: applied.length, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
                    { label: "Approved", count: approved.length, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
                    { label: "Funded", count: funded.length, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
                    { label: "Denied", count: denied.length, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
                  ].map((stage) => (
                    <div key={stage.label} className={`rounded-lg border p-3 text-center ${stage.count > 0 ? `${stage.bg} ${stage.border}` : "bg-gray-50 border-gray-100"}`}>
                      <div className={`text-2xl font-bold ${stage.count > 0 ? stage.color : "text-gray-300"}`}>
                        {stage.count}
                      </div>
                      <div className="text-xs font-medium text-gray-500">{stage.label}</div>
                    </div>
                  ))}
                </div>

                {/* Compact Application Status Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700">All Applications — Quick View</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                          <th className="px-4 py-2 font-medium">#</th>
                          <th className="px-4 py-2 font-medium">Type</th>
                          <th className="px-4 py-2 font-medium">Lender</th>
                          <th className="px-4 py-2 font-medium">Product</th>
                          <th className="px-4 py-2 font-medium text-right">Amount</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 font-medium">Applied</th>
                          <th className="px-4 py-2 font-medium">Funded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apps.map((app, i) => {
                          const statusStyles: Record<string, string> = {
                            pending: "bg-gray-100 text-gray-700",
                            applied: "bg-blue-100 text-blue-800",
                            approved: "bg-amber-100 text-amber-800",
                            funded: "bg-emerald-100 text-emerald-800",
                            denied: "bg-red-100 text-red-800",
                          };
                          const typeLabel = appTypes.find((t) => t.value === app.type)?.label || app.type;
                          return (
                            <tr key={app.id} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-400 font-medium">{i + 1}</td>
                              <td className="px-4 py-2.5 text-gray-700">{typeLabel}</td>
                              <td className="px-4 py-2.5 text-gray-800 font-medium">{app.lender || "—"}</td>
                              <td className="px-4 py-2.5 text-gray-600">{app.product || "—"}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                                {app.amount ? `$${app.amount.toLocaleString()}` : "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[app.status]}`}>
                                  {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">
                                {app.appliedDate ? new Date(app.appliedDate).toLocaleDateString() : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">
                                {app.fundedDate ? new Date(app.fundedDate).toLocaleDateString() : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Summary by Type */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {appTypes.map((type) => {
              const apps = client.fundingApplications.filter((a) => a.type === type.value);
              const funded = apps.filter((a) => a.status === "funded").reduce((s, a) => s + (a.amount || 0), 0);
              return (
                <div key={type.value} className="stat-card">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{type.label}</p>
                  <p className="text-lg font-bold text-gray-900">{apps.length} apps</p>
                  <p className="text-sm text-emerald-600">${funded.toLocaleString()} funded</p>
                </div>
              );
            })}
          </div>

          {/* Application List */}
          {client.fundingApplications.length > 0 ? (
            <div className="space-y-4">
              {client.fundingApplications.map((app, index) => (
                <div
                  key={app.id}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(index);
                    dragNodeRef.current = e.currentTarget as HTMLDivElement;
                    e.dataTransfer.effectAllowed = "move";
                    requestAnimationFrame(() => {
                      if (dragNodeRef.current) dragNodeRef.current.style.opacity = "0.4";
                    });
                  }}
                  onDragEnd={() => {
                    if (dragNodeRef.current) dragNodeRef.current.style.opacity = "1";
                    if (dragIndex !== null && dragOverIndex !== null) {
                      reorderApplications(dragIndex, dragOverIndex);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                    dragNodeRef.current = null;
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverIndex(index);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  className={`card p-5 transition-all ${
                    dragOverIndex === index && dragIndex !== null && dragIndex !== index
                      ? "border-blue-400 border-2 shadow-lg"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600" title="Drag to reorder">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                      </span>
                      <span className="text-sm font-semibold text-gray-500">Application #{index + 1}</span>
                    </div>
                    <button
                      onClick={() => removeApplication(app.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="label">Type</label>
                      <select
                        className="input-field"
                        value={app.type}
                        onChange={(e) => updateApplication(app.id, "type", e.target.value)}
                      >
                        {appTypes.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Lender</label>
                      <input
                        className="input-field"
                        placeholder="Type or select a lender..."
                        list={`lender-list-${app.id}`}
                        value={app.lender}
                        onChange={(e) => updateApplication(app.id, "lender", e.target.value)}
                      />
                      <datalist id={`lender-list-${app.id}`}>
                        {lenderNames.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="label">Product</label>
                      <input
                        className="input-field"
                        placeholder="e.g. Ink Business Preferred"
                        value={app.product}
                        onChange={(e) => updateApplication(app.id, "product", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Amount</label>
                      <input
                        className="input-field"
                        type="number"
                        placeholder="$"
                        value={app.amount ?? ""}
                        onChange={(e) => updateApplication(app.id, "amount", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Status</label>
                      <select
                        className="input-field"
                        value={app.status}
                        onChange={(e) => updateApplication(app.id, "status", e.target.value)}
                      >
                        {appStatuses.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Applied Date</label>
                      <input
                        className="input-field"
                        type="date"
                        value={app.appliedDate}
                        onChange={(e) => updateApplication(app.id, "appliedDate", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Approved Date</label>
                      <input
                        className="input-field"
                        type="date"
                        value={app.approvedDate ?? ""}
                        onChange={(e) => updateApplication(app.id, "approvedDate", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Funded Date</label>
                      <input
                        className="input-field"
                        type="date"
                        value={app.fundedDate ?? ""}
                        onChange={(e) => updateApplication(app.id, "fundedDate", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="label">Notes</label>
                      <input
                        className="input-field"
                        placeholder="Additional notes..."
                        value={app.notes}
                        onChange={(e) => updateApplication(app.id, "notes", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center text-gray-400">
              <p>No applications yet. Click &quot;Add Application&quot; to start stacking.</p>
            </div>
          )}
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {activeTab === "documents" && (() => {
        const DOC_TYPE_OPTIONS = [
          { value: "bank_statement", label: "Bank Statement" },
          { value: "tax_return", label: "Tax Return" },
          { value: "business_license", label: "Business License" },
          { value: "articles_of_incorporation", label: "Articles of Incorporation" },
          { value: "ein_letter", label: "EIN Letter" },
          { value: "drivers_license", label: "Driver's License" },
          { value: "voided_check", label: "Voided Check" },
          { value: "profit_loss", label: "P&L Statement" },
          { value: "balance_sheet", label: "Balance Sheet" },
          { value: "credit_report", label: "Credit Report" },
          { value: "funding_agreement", label: "Funding Agreement" },
          { value: "other", label: "Other (Type Name)" },
        ];

        const DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(
          DOC_TYPE_OPTIONS.map((o) => [o.value, o.label])
        );

        const REQUIRED_DOCS = [
          { name: "Bank Statements (3 months)", type: "bank_statement" },
          { name: "Tax Return - Most Recent", type: "tax_return" },
          { name: "Business License", type: "business_license" },
          { name: "Articles of Incorporation", type: "articles_of_incorporation" },
          { name: "EIN Letter (CP 575)", type: "ein_letter" },
          { name: "Driver's License", type: "drivers_license" },
          { name: "Voided Check", type: "voided_check" },
          { name: "P&L Statement", type: "profit_loss" },
        ];

        function formatFileSize(bytes: number): string {
          if (bytes === 0) return "0 B";
          const k = 1024;
          const sizes = ["B", "KB", "MB"];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
        }

        function handleFileUpload(files: FileList | null, docId?: string) {
          if (!files || files.length === 0 || !client) return;
          if (docId) {
            // Attach file to existing document (no naming needed)
            const file = files[0];
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              const updated = { ...client };
              const doc = updated.documents.find((d) => d.id === docId);
              if (doc) {
                doc.fileName = file.name;
                doc.fileData = base64;
                doc.fileSize = file.size;
                doc.uploadedAt = new Date().toISOString();
                doc.source = "admin";
              }
              save(updated);
            };
            reader.readAsDataURL(file);
          } else {
            // New upload — read files then show naming modal
            const pending: { file: File; base64: string }[] = [];
            let loaded = 0;
            const fileArr = Array.from(files);
            fileArr.forEach((file) => {
              const reader = new FileReader();
              reader.onload = () => {
                pending.push({ file, base64: reader.result as string });
                loaded++;
                if (loaded === fileArr.length) {
                  setPendingFiles(pending);
                  setUploadDocType("bank_statement");
                  setUploadCustomName("");
                  setShowUploadModal(true);
                }
              };
              reader.readAsDataURL(file);
            });
          }
        }

        function confirmUpload() {
          if (!client) return;
          const docType = uploadDocType;
          const docLabel = docType === "other" && uploadCustomName.trim()
            ? uploadCustomName.trim()
            : DOC_TYPE_LABELS[docType] || docType;

          const newDocs = pendingFiles.map((pf) => ({
            id: crypto.randomUUID(),
            name: docLabel,
            type: docType === "other" && uploadCustomName.trim() ? "other" : docType,
            uploadedAt: new Date().toISOString(),
            status: "pending" as const,
            fileName: pf.file.name,
            fileData: pf.base64,
            fileSize: pf.file.size,
            source: "admin" as const,
          }));

          const updated = { ...client, documents: [...client.documents, ...newDocs] };
          addActivity(updated, "document", `Uploaded ${newDocs.length} document${newDocs.length > 1 ? "s" : ""}`, docLabel);
          save(updated);
          setShowUploadModal(false);
          setPendingFiles([]);
        }

        function requestAllDocuments() {
          if (!client) return;
          const existing = client.documents.map((d) => d.name);
          const newDocs = REQUIRED_DOCS.filter((r) => !existing.includes(r.name)).map((r) => ({
            id: crypto.randomUUID(),
            name: r.name,
            type: r.type,
            uploadedAt: new Date().toISOString(),
            status: "pending" as const,
            fileName: "",
            fileData: "",
            fileSize: 0,
            source: "requested" as const,
          }));
          if (newDocs.length === 0) {
            alert("All standard documents have already been requested.");
            return;
          }
          const updated = { ...client, documents: [...client.documents, ...newDocs] };
          addActivity(updated, "document", `Requested ${newDocs.length} standard documents`);
          save(updated);
        }

        return (
        <div className="space-y-4">
          {/* Top Actions Bar */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg text-gray-900">Documents</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={requestAllDocuments}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Request All Documents
              </button>
              <label className="btn-primary flex items-center gap-2 text-sm cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
              </label>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-brand-400 hover:bg-brand-50 transition-all cursor-pointer"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand-400", "bg-brand-50"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand-400", "bg-brand-50"); }}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-brand-400", "bg-brand-50"); handleFileUpload(e.dataTransfer.files); }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv";
              input.onchange = () => handleFileUpload(input.files);
              input.click();
            }}
          >
            <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drag &amp; drop files here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOC, DOCX, XLS, XLSX, CSV</p>
          </div>

          {/* Upload Naming Modal */}
          {showUploadModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Name Your Document</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {pendingFiles.length} file{pendingFiles.length !== 1 ? "s" : ""} selected: {pendingFiles.map((pf) => pf.file.name).join(", ")}
                </p>

                <label className="label">Document Type</label>
                <select
                  className="input-field w-full mb-3"
                  value={uploadDocType}
                  onChange={(e) => {
                    setUploadDocType(e.target.value);
                    if (e.target.value !== "other") setUploadCustomName("");
                  }}
                >
                  {DOC_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {uploadDocType === "other" && (
                  <>
                    <label className="label">Custom Document Name</label>
                    <input
                      type="text"
                      className="input-field w-full mb-3"
                      placeholder="Enter document name..."
                      value={uploadCustomName}
                      onChange={(e) => setUploadCustomName(e.target.value)}
                      autoFocus
                    />
                  </>
                )}

                <div className="flex items-center justify-end gap-3 mt-4">
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => { setShowUploadModal(false); setPendingFiles([]); }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary text-sm"
                    disabled={uploadDocType === "other" && !uploadCustomName.trim()}
                    onClick={confirmUpload}
                  >
                    Upload {pendingFiles.length > 1 ? `${pendingFiles.length} Files` : "File"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Document Summary Counts */}
          {client.documents.length > 0 && (
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Total", count: client.documents.length, color: "text-gray-900", bg: "bg-gray-50", border: "border-gray-200" },
                { label: "Uploaded", count: client.documents.filter((d) => d.fileData).length, color: "text-brand-600", bg: "bg-brand-50", border: "border-brand-200" },
                { label: "Pending", count: client.documents.filter((d) => d.status === "pending").length, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
                { label: "Approved", count: client.documents.filter((d) => d.status === "approved").length, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
                { label: "Rejected", count: client.documents.filter((d) => d.status === "rejected").length, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg border p-3 text-center ${s.count > 0 ? `${s.bg} ${s.border}` : "bg-gray-50 border-gray-100"}`}>
                  <div className={`text-xl font-bold ${s.count > 0 ? s.color : "text-gray-300"}`}>{s.count}</div>
                  <div className="text-xs font-medium text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Documents Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700">All Documents</h4>
              <span className="text-xs text-gray-400">{client.documents.length} document{client.documents.length !== 1 ? "s" : ""}</span>
            </div>
            {client.documents.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {client.documents.map((doc) => (
                  <div key={doc.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
                    {/* File Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      doc.fileData ? "bg-brand-100" : "bg-gray-100"
                    }`}>
                      {doc.fileData ? (
                        <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>

                    {/* Doc Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{DOC_TYPE_LABELS[doc.type] || doc.type}</span>
                        {doc.fileData ? (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-500">{doc.fileName}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-500">{formatFileSize(doc.fileSize || 0)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-amber-600 font-medium">No file attached</span>
                          </>
                        )}
                        {doc.source === "requested" && !doc.fileData && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Requested</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <select
                      className="input-field w-auto text-xs py-1"
                      value={doc.status}
                      onChange={(e) => {
                        const updated = { ...client };
                        const d = updated.documents.find((dd) => dd.id === doc.id);
                        if (d) d.status = e.target.value as any;
                        save(updated);
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>

                    {/* Upload / Replace button */}
                    <label className="text-xs text-brand-600 hover:text-brand-800 font-medium cursor-pointer shrink-0">
                      {doc.fileData ? "Replace" : "Upload"}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv"
                        onChange={(e) => handleFileUpload(e.target.files, doc.id)}
                      />
                    </label>

                    {/* Remove */}
                    <button
                      onClick={() => {
                        const updated = { ...client, documents: client.documents.filter((d) => d.id !== doc.id) };
                        save(updated);
                      }}
                      className="text-xs text-red-500 hover:text-red-700 shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-gray-400">No documents yet</p>
                <p className="text-xs text-gray-400 mt-1">Upload files above or click &quot;Request All Documents&quot; to get started</p>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* NOTES & ACTIVITY TAB */}
      {activeTab === "notes" && (() => {
        function submitNote() {
          if (!client || !newNote.trim()) return;
          const updated = { ...client };
          addActivity(updated, "note", newNote.trim());
          save(updated);
          setNewNote("");
        }

        const activityLog = client.activityLog || [];

        const iconMap: Record<ActivityEntry["type"], { bg: string; icon: JSX.Element }> = {
          note: {
            bg: "bg-blue-100 text-blue-600",
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
          },
          email: {
            bg: "bg-purple-100 text-purple-600",
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
          },
          application: {
            bg: "bg-emerald-100 text-emerald-600",
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
          },
          status_change: {
            bg: "bg-amber-100 text-amber-600",
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
          },
          document: {
            bg: "bg-indigo-100 text-indigo-600",
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />,
          },
          onboarding: {
            bg: "bg-teal-100 text-teal-600",
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />,
          },
          credit: {
            bg: "bg-rose-100 text-rose-600",
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
          },
        };

        const typeLabels: Record<ActivityEntry["type"], string> = {
          note: "Note",
          email: "Email",
          application: "Application",
          status_change: "Status Change",
          document: "Document",
          onboarding: "Onboarding",
          credit: "Credit",
        };

        function formatTimestamp(iso: string) {
          const d = new Date(iso);
          const now = new Date();
          const diffMs = now.getTime() - d.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);

          let relative = "";
          if (diffMins < 1) relative = "Just now";
          else if (diffMins < 60) relative = `${diffMins}m ago`;
          else if (diffHours < 24) relative = `${diffHours}h ago`;
          else if (diffDays < 7) relative = `${diffDays}d ago`;
          else relative = d.toLocaleDateString();

          return { relative, full: d.toLocaleString() };
        }

        // Group activity entries by date
        const grouped = new Map<string, ActivityEntry[]>();
        activityLog.forEach((entry) => {
          const dateKey = new Date(entry.timestamp).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          if (!grouped.has(dateKey)) grouped.set(dateKey, []);
          grouped.get(dateKey)!.push(entry);
        });

        return (
          <div className="space-y-4">
            {/* Add Note Input */}
            <div className="card p-5">
              <h3 className="font-semibold text-lg text-gray-900 mb-3">Add a Note</h3>
              <div className="flex gap-3">
                <textarea
                  className="input-field flex-1 min-h-[80px] resize-none"
                  placeholder="Type a note about this client..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote();
                  }}
                />
                <div className="flex flex-col justify-end">
                  <button
                    onClick={submitNote}
                    disabled={!newNote.trim()}
                    className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Note
                  </button>
                  <span className="text-xs text-gray-400 mt-1.5 text-center">Ctrl+Enter</span>
                </div>
              </div>
            </div>

            {/* Legacy notes migration */}
            {client.notes && client.notes.trim() && (
              <div className="card p-4 bg-amber-50 border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-amber-800">Legacy Notes</span>
                  <button
                    onClick={() => {
                      const updated = { ...client };
                      addActivity(updated, "note", client.notes, "Migrated from legacy notes");
                      updated.notes = "";
                      save(updated);
                    }}
                    className="text-xs text-amber-700 hover:text-amber-900 underline"
                  >
                    Move to timeline
                  </button>
                </div>
                <p className="text-sm text-amber-700 whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}

            {/* Activity Timeline */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg text-gray-900">Activity Timeline</h3>
                <span className="text-sm text-gray-400">{activityLog.length} event{activityLog.length !== 1 ? "s" : ""}</span>
              </div>

              {activityLog.length > 0 ? (
                <div className="space-y-6">
                  {Array.from(grouped.entries()).map(([dateKey, entries]) => (
                    <div key={dateKey}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{dateKey}</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      <div className="space-y-3">
                        {entries.map((entry) => {
                          const { bg, icon } = iconMap[entry.type] || iconMap.note;
                          const time = formatTimestamp(entry.timestamp);
                          return (
                            <div key={entry.id} className="flex gap-3 group">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${bg}`}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  {icon}
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm text-gray-900">{entry.message}</p>
                                    {entry.details && (
                                      <p className="text-xs text-gray-500 mt-0.5">{entry.details}</p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${bg}`}>
                                      {typeLabels[entry.type]}
                                    </span>
                                    <span className="text-xs text-gray-400" title={time.full}>{time.relative}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-400">No activity yet. Actions like sending emails, adding applications, and uploading documents will appear here automatically.</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
