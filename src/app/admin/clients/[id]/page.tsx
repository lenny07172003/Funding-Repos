"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getClientWithDecryptedFields,
  updateClient,
  createFundingApplication,
  updateFundingApplication,
  deleteFundingApplication,
  reorderFundingApplications,
  createDocument,
  deleteDocument as deleteDocAction,
  addActivityEntry,
  getReferralPartners,
  getLenders,
  ensureLenderByName,
  createClientLogin,
  updateDocumentStatus,
} from "@/lib/client-actions";
import { runStackingAnalysis, runRevenueLendingAnalysis, getClientAnalyses, sendBlueprintToClient } from "@/lib/funding-analysis";
import { parseManualCreditData } from "@/lib/credit-report-parser";
import { parseCreditReportPDF } from "@/lib/pdf-credit-parser";
import { sendCreditAnalysisEmail } from "@/lib/credit-analysis-email";
import { onboardClientFull } from "@/lib/onboard-client-action";
import { sendAgreementToClient } from "@/lib/agreement-actions";

type CreditBureauData = {
  score: number | null;
  accounts: number | null;
  creditAge: string;
  derogatoryAccounts: number | null;
  highestCreditLimit: number | null;
  inquiries: number | null;
};

type CreditProfile = {
  experian: CreditBureauData;
  equifax: CreditBureauData;
  transUnion: CreditBureauData;
  apiKeyConfigured: boolean;
  lastPulled: string | null;
};

type AgreementSignature = {
  fullName: string;
  businessName?: string;
  signatureData: string;
  dateSigned: string;
  timeSigned?: string;
  completedAt?: string;
  ipAddress: string;
  agreementVersion?: number;
  agreementTitle?: string;
  agreementContent?: string;
  companyName?: string;
} | null;

type OnboardingSteps = {
  agreement: boolean;
  businessForm: boolean;
  creditMonitoring: boolean;
};

/** Wrapper type that parses JSON fields from Prisma flat model */
type ClientDetail = Awaited<ReturnType<typeof getClientWithDecryptedFields>> & {
  _creditProfile: CreditProfile;
  _agreementSignature: AgreementSignature;
  _onboardingSteps: OnboardingSteps;
};

const emptyCreditProfile: CreditProfile = {
  experian: { score: null, accounts: null, creditAge: "", derogatoryAccounts: null, highestCreditLimit: null, inquiries: null },
  equifax: { score: null, accounts: null, creditAge: "", derogatoryAccounts: null, highestCreditLimit: null, inquiries: null },
  transUnion: { score: null, accounts: null, creditAge: "", derogatoryAccounts: null, highestCreditLimit: null, inquiries: null },
  apiKeyConfigured: false,
  lastPulled: null,
};

function parseClientDetail(raw: Awaited<ReturnType<typeof getClientWithDecryptedFields>>): ClientDetail {
  let cp: CreditProfile;
  try { cp = JSON.parse(raw.creditProfile || "{}"); } catch { cp = emptyCreditProfile; }
  if (!cp.experian) cp = emptyCreditProfile;
  let sig: AgreementSignature = null;
  try { sig = raw.agreementSignature ? JSON.parse(raw.agreementSignature) : null; } catch { sig = null; }
  let steps: OnboardingSteps;
  try { steps = JSON.parse(raw.onboardingCompletedSteps || "{}"); } catch { steps = { agreement: false, businessForm: false, creditMonitoring: false }; }
  return { ...raw, _creditProfile: cp, _agreementSignature: sig, _onboardingSteps: steps };
}

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
  const [client, setClient] = useState<ClientDetail | null>(null);
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

  async function loadClient() {
    try {
      const raw = await getClientWithDecryptedFields(params.id as string);
      setClient(parseClientDetail(raw));
    } catch {
      router.push("/admin/clients");
    }
  }

  useEffect(() => {
    async function load() {
      await loadClient();
      const [partners, lenders] = await Promise.all([getReferralPartners(), getLenders()]);
      setSavedPartners(partners);
      setLenderNames(lenders.map((l) => l.name).filter(Boolean).sort());
    }
    load();
  }, [params.id]);

  function showSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveField(data: Record<string, unknown>) {
    if (!client) return;
    await updateClient(client.id, data as any);
    await loadClient();
    showSaved();
  }

  async function saveCreditProfile(updated: CreditProfile) {
    if (!client) return;
    await updateClient(client.id, { creditProfile: JSON.stringify(updated) });
    await loadClient();
    showSaved();
  }

  async function updateBureau(bureau: typeof bureauNames[number], field: keyof CreditBureauData, value: string) {
    if (!client) return;
    const cp = { ...client._creditProfile };
    const numFields: (keyof CreditBureauData)[] = ["score", "accounts", "derogatoryAccounts", "highestCreditLimit", "inquiries"];
    if (numFields.includes(field)) {
      (cp[bureau] as any)[field] = value === "" ? null : Number(value);
    } else {
      (cp[bureau] as any)[field] = value;
    }
    await saveCreditProfile(cp);
  }

  async function updateBusiness(field: string, value: string) {
    if (!client) return;
    await saveField({ [field]: value });
  }

  async function updatePersonal(field: string, value: string) {
    if (!client) return;
    await saveField({ [field]: value });
  }

  async function addApplication() {
    if (!client) return;
    await createFundingApplication(client.id, { type: "credit_card" });
    await addActivityEntry(client.id, { type: "application", message: "Added a new funding application" });
    await loadClient();
    showSaved();
  }

  async function handleUpdateApplication(id: string, field: string, value: string) {
    if (!client) return;
    const app = client.fundingApplications.find((a) => a.id === id);
    if (!app) return;
    const oldValue = (app as any)[field];
    const updateData: Record<string, unknown> = {};
    if (field === "amount") {
      updateData.amount = value === "" ? null : Number(value);
    } else {
      updateData[field] = value;
    }
    await updateFundingApplication(id, updateData as any);
    // Auto-add lender to marketplace when name is set
    if (field === "lender" && value.trim()) {
      await ensureLenderByName(value);
      const lenders = await getLenders();
      setLenderNames(lenders.map((l) => l.name).filter(Boolean).sort());
    }
    // Log status changes
    if (field === "status" && value !== oldValue) {
      const lenderLabel = app.lender || "Unknown lender";
      await addActivityEntry(client.id, {
        type: "status_change",
        message: `Application status changed to "${value}"`,
        details: `${lenderLabel} — ${app.product || "No product"}`,
      });
    }
    await loadClient();
    showSaved();
  }

  async function removeApplication(id: string) {
    if (!client) return;
    if (!confirm("Remove this application? This cannot be undone.")) return;
    const removed = client.fundingApplications.find((a) => a.id === id);
    if (removed) {
      await addActivityEntry(client.id, {
        type: "application",
        message: "Removed application",
        details: `${removed.lender || "Unknown lender"} — ${removed.product || "No product"}`,
      });
    }
    await deleteFundingApplication(id);
    await loadClient();
    showSaved();
  }

  async function reorderApplications(fromIndex: number, toIndex: number) {
    if (!client || fromIndex === toIndex) return;
    const apps = [...client.fundingApplications];
    const [moved] = apps.splice(fromIndex, 1);
    apps.splice(toIndex, 0, moved);
    await reorderFundingApplications(client.id, apps.map((a) => a.id));
    await loadClient();
  }

  function saveApiSettings() {
    // API keys are now stored per-agency/sub-account, not in localStorage
    // This is a placeholder for future API key management
    showSaved();
  }

  async function updateOnboardingStatus(status: string) {
    if (!client) return;
    const data: Record<string, unknown> = { onboardingStatus: status };
    if (status === "active" && !client.onboardedAt) {
      data.onboardedAt = new Date().toISOString();
    }
    const labels: Record<string, string> = { not_started: "Not Started", agreement_sent: "Agreement Sent", agreement_signed: "Agreement Signed", active: "Active" };
    await addActivityEntry(client.id, { type: "onboarding", message: `Onboarding status changed to "${labels[status] || status}"` });
    await updateClient(client.id, data as any);
    await loadClient();
    showSaved();
  }

  async function sendOnboardingEmail() {
    if (!client || !client.email) {
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
          clientName: `${client.firstName} ${client.lastName}`.trim() || "Client",
          clientEmail: client.email,
          onboardingLink: link,
          businessName: client.businessName || "",
        }),
      });

      const respData = await res.json();

      if (!res.ok) {
        alert(`Failed to send email: ${respData.error || "Unknown error"}. Make sure RESEND_API_KEY is set in your .env.local file.`);
        setEmailSending(false);
        return;
      }

      const newStatus = client.onboardingStatus === "not_started" ? "agreement_sent" : client.onboardingStatus;
      await updateClient(client.id, {
        onboardingStatus: newStatus,
        onboardingEmailSentAt: new Date().toISOString(),
      });
      await addActivityEntry(client.id, { type: "email", message: "Sent onboarding email", details: client.email });
      await loadClient();
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
  const steps = client._onboardingSteps;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/admin/clients" className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {client.firstName} {client.lastName || "New Client"}
            </h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
              <span className="text-sm text-gray-500 break-all">{client.email || "No email"}</span>
              <span className={statusBadge[client.onboardingStatus]}>
                {statusLabel[client.onboardingStatus]}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-9 sm:ml-0">
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 hidden sm:inline">Status:</span>
            <select
              className="input-field w-auto text-sm"
              value={client.onboardingStatus}
              onChange={(e) => updateOnboardingStatus(e.target.value as string)}
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
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
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
            disabled={emailSending || !client.email}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 mb-1">Client Onboarding Link</p>
              <p className="text-sm font-mono text-brand-700 break-all">{onboardingLink}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(onboardingLink);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
              className="btn-secondary text-xs px-3 py-1.5 shrink-0 self-start sm:self-auto"
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
                ? `Signed ${client._agreementSignature?.dateSigned ? new Date(client._agreementSignature.dateSigned).toLocaleDateString() : ""}`
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
            Last sent: {new Date(client.onboardingEmailSentAt).toLocaleString()} to {client.email}
          </p>
        )}
      </div>

      {/* Client Login & AI Analysis Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Client Portal Login */}
        <ClientLoginPanel clientId={client.id} clientEmail={client.email} onCreated={loadClient} />
        {/* AI Funding Analysis */}
        <StackingAnalysisPanel clientId={client.id} />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
              const data = client._creditProfile[bureau];
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
              onChange={async (e) => {
                await saveField({ referralPartner: e.target.value });
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
                <input className="input-field" value={client.firstName} onChange={(e) => updatePersonal("firstName", e.target.value)} />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input className="input-field" value={client.lastName} onChange={(e) => updatePersonal("lastName", e.target.value)} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input-field" type="email" value={client.email} onChange={(e) => updatePersonal("email", e.target.value)} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input-field" type="tel" value={client.phone} onChange={(e) => updatePersonal("phone", e.target.value)} />
              </div>
              <div>
                <label className="label">Date of Birth</label>
                <input className="input-field" type="date" value={client.dateOfBirth} onChange={(e) => updatePersonal("dateOfBirth", e.target.value)} />
              </div>
              <div>
                <label className="label">SSN (Last 4)</label>
                <input className="input-field" maxLength={4} placeholder="XXXX" value={client.ssn} onChange={(e) => updatePersonal("ssn", e.target.value)} />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input-field" value={client.address} onChange={(e) => updatePersonal("address", e.target.value)} />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input-field" value={client.city} onChange={(e) => updatePersonal("city", e.target.value)} />
              </div>
              <div>
                <label className="label">State</label>
                <input className="input-field" value={client.state} onChange={(e) => updatePersonal("state", e.target.value)} />
              </div>
              <div>
                <label className="label">ZIP</label>
                <input className="input-field" value={client.zip} onChange={(e) => updatePersonal("zip", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-lg text-brand-800 mb-4">Business Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Business Name *</label>
                <input className="input-field" value={client.businessName} onChange={(e) => updateBusiness("businessName", e.target.value)} />
              </div>
              <div>
                <label className="label">Business Structure *</label>
                <select className="input-field" value={client.businessStructure || client.entityType} onChange={(e) => { updateBusiness("businessStructure", e.target.value); updateBusiness("entityType", e.target.value); }}>
                  <option value="">Select...</option>
                  <option value="llc">LLC</option>
                  <option value="s_corp">S-Corp</option>
                  <option value="c_corp">C-Corp</option>
                  <option value="sole_prop">Sole Proprietorship</option>
                  <option value="partnership">Partnership</option>
                </select>
              </div>
              <div>
                <label className="label">EIN *</label>
                <input className="input-field" value={client.ein} onChange={(e) => updateBusiness("ein", e.target.value)} placeholder="XX-XXXXXXX" />
              </div>
              <div>
                <label className="label">Years in Business *</label>
                <input className="input-field" type="number" min="0" value={client.yearsInBusiness || ""} onChange={(e) => saveField({ yearsInBusiness: parseInt(e.target.value) || 0 })} placeholder="0" />
              </div>
              <div>
                <label className="label">Annual Revenue *</label>
                <input className="input-field" placeholder="$250,000" value={client.annualRevenue} onChange={(e) => updateBusiness("annualRevenue", e.target.value)} />
              </div>
              <div>
                <label className="label">Monthly Revenue *</label>
                <input className="input-field" placeholder="$20,000" value={client.monthlyRevenue} onChange={(e) => updateBusiness("monthlyRevenue", e.target.value)} />
              </div>
              <div>
                <label className="label">Industry / NAICS *</label>
                <input className="input-field" value={client.naicsCode} onChange={(e) => updateBusiness("naicsCode", e.target.value)} placeholder="e.g. 541511 — IT Services" />
              </div>
              <div>
                <label className="label">Industry Description</label>
                <input className="input-field" value={client.industry} onChange={(e) => updateBusiness("industry", e.target.value)} placeholder="e.g. Professional Services" />
              </div>
              <div>
                <label className="label">State of Incorporation</label>
                <input className="input-field" value={client.stateOfIncorporation} onChange={(e) => updateBusiness("stateOfIncorporation", e.target.value)} />
              </div>
              <div>
                <label className="label">Business Phone</label>
                <input className="input-field" type="tel" value={client.businessPhone} onChange={(e) => updateBusiness("businessPhone", e.target.value)} />
              </div>
              <div>
                <label className="label">SIC Code</label>
                <input className="input-field" value={client.sicCode} onChange={(e) => updateBusiness("sicCode", e.target.value)} />
              </div>
              <div className="md:col-span-3">
                <label className="label">Business Address</label>
                <input className="input-field" value={client.businessAddress} onChange={(e) => updateBusiness("businessAddress", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Primary Banking */}
          <div className="card p-6 border-brand-200">
            <h3 className="font-semibold text-lg text-brand-800 mb-4">Primary Banking Relationship</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Primary Bank *</label>
                <select className="input-field" value={client.primaryBank} onChange={(e) => saveField({ primaryBank: e.target.value })}>
                  <option value="">Select Bank...</option>
                  <option value="Chase">Chase</option>
                  <option value="Bank of America">Bank of America</option>
                  <option value="Wells Fargo">Wells Fargo</option>
                  <option value="Citibank">Citibank</option>
                  <option value="US Bank">US Bank</option>
                  <option value="PNC Bank">PNC Bank</option>
                  <option value="TD Bank">TD Bank</option>
                  <option value="Capital One">Capital One</option>
                  <option value="Truist">Truist</option>
                  <option value="Citizens Bank">Citizens Bank</option>
                  <option value="KeyBank">KeyBank</option>
                  <option value="M&T Bank">M&T Bank</option>
                  <option value="Valley National Bank">Valley National Bank</option>
                  <option value="Navy Federal">Navy Federal</option>
                  <option value="USAA">USAA</option>
                  <option value="Regions Bank">Regions Bank</option>
                  <option value="Fifth Third Bank">Fifth Third Bank</option>
                  <option value="Huntington Bank">Huntington Bank</option>
                  <option value="BMO">BMO</option>
                  <option value="Santander">Santander</option>
                  <option value="First National Bank">First National Bank</option>
                  <option value="Webster Bank">Webster Bank</option>
                  <option value="Ameris Bank">Ameris Bank</option>
                  <option value="Columbia Bank">Columbia Bank</option>
                  <option value="Mercury">Mercury</option>
                  <option value="Relay">Relay</option>
                  <option value="Novo">Novo</option>
                  <option value="Bluevine">Bluevine</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Banking Relationship Length *</label>
                <select className="input-field" value={client.bankRelationshipLength} onChange={(e) => saveField({ bankRelationshipLength: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="less_than_6mo">Less than 6 months</option>
                  <option value="6mo_to_1yr">6 months — 1 year</option>
                  <option value="1_to_2yr">1 — 2 years</option>
                  <option value="2_to_3yr">2 — 3 years</option>
                  <option value="3_to_5yr">3 — 5 years</option>
                  <option value="5_plus">5+ years</option>
                </select>
              </div>
              <div>
                <label className="label">Estimated Bank Balance *</label>
                <input
                  className="input-field"
                  type="number"
                  placeholder="$"
                  value={client.estimatedBankBalance || ""}
                  onChange={async (e) => {
                    const balance = parseFloat(e.target.value) || 0;
                    const rating = getBankRating(balance);
                    await saveField({ estimatedBankBalance: balance, bankRating: rating.key });
                  }}
                />
              </div>
            </div>

            {/* Bank Rating Display */}
            {client.estimatedBankBalance > 0 && (() => {
              const rating = getBankRating(client.estimatedBankBalance);
              return (
                <div className={`mt-4 p-4 rounded-lg border ${rating.bgColor}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-gray-500 block">Bank Balance Rating</span>
                      <span className={`text-lg font-bold ${rating.textColor}`}>{rating.label}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500 block">Balance</span>
                      <span className="text-lg font-bold text-gray-900">${client.estimatedBankBalance.toLocaleString()}</span>
                    </div>
                    <div className={`px-4 py-2 rounded-lg font-bold text-sm ${rating.badgeColor}`}>
                      {rating.tier}
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${rating.barColor}`} style={{ width: `${rating.percent}%` }} />
                    </div>
                  </div>
                </div>
              );
            })()}
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
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
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
                        onChange={(e) => handleUpdateApplication(app.id, "type", e.target.value)}
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
                        onChange={(e) => handleUpdateApplication(app.id, "lender", e.target.value)}
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
                        onChange={(e) => handleUpdateApplication(app.id, "product", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Amount</label>
                      <input
                        className="input-field"
                        type="number"
                        placeholder="$"
                        value={app.amount ?? ""}
                        onChange={(e) => handleUpdateApplication(app.id, "amount", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Status</label>
                      <select
                        className="input-field"
                        value={app.status}
                        onChange={(e) => handleUpdateApplication(app.id, "status", e.target.value)}
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
                        onChange={(e) => handleUpdateApplication(app.id, "appliedDate", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Approved Date</label>
                      <input
                        className="input-field"
                        type="date"
                        value={app.approvedDate ?? ""}
                        onChange={(e) => handleUpdateApplication(app.id, "approvedDate", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Funded Date</label>
                      <input
                        className="input-field"
                        type="date"
                        value={app.fundedDate ?? ""}
                        onChange={(e) => handleUpdateApplication(app.id, "fundedDate", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="label">Notes</label>
                      <input
                        className="input-field"
                        placeholder="Additional notes..."
                        value={app.notes}
                        onChange={(e) => handleUpdateApplication(app.id, "notes", e.target.value)}
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
            reader.onload = async () => {
              const base64 = reader.result as string;
              // Delete old and recreate with file data
              const doc = client.documents.find((d) => d.id === docId);
              if (doc) {
                await deleteDocAction(docId);
                await createDocument(client.id, {
                  name: doc.name,
                  type: doc.type,
                  fileName: file.name,
                  fileData: base64,
                  fileSize: file.size,
                  source: "admin",
                });
              }
              await loadClient();
              showSaved();
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

        async function confirmUpload() {
          if (!client) return;
          const docType = uploadDocType;
          const docLabel = docType === "other" && uploadCustomName.trim()
            ? uploadCustomName.trim()
            : DOC_TYPE_LABELS[docType] || docType;

          for (const pf of pendingFiles) {
            await createDocument(client.id, {
              name: docLabel,
              type: docType === "other" && uploadCustomName.trim() ? "other" : docType,
              fileName: pf.file.name,
              fileData: pf.base64,
              fileSize: pf.file.size,
              source: "admin",
            });
          }

          await addActivityEntry(client.id, {
            type: "document",
            message: `Uploaded ${pendingFiles.length} document${pendingFiles.length > 1 ? "s" : ""}`,
            details: docLabel,
          });
          await loadClient();
          showSaved();
          setShowUploadModal(false);
          setPendingFiles([]);
        }

        async function requestAllDocuments() {
          if (!client) return;
          const existing = client.documents.map((d) => d.name);
          const toRequest = REQUIRED_DOCS.filter((r) => !existing.includes(r.name));
          if (toRequest.length === 0) {
            alert("All standard documents have already been requested.");
            return;
          }
          for (const r of toRequest) {
            await createDocument(client.id, {
              name: r.name,
              type: r.type,
              fileName: "",
              fileData: "",
              fileSize: 0,
              source: "requested",
            });
          }
          await addActivityEntry(client.id, {
            type: "document",
            message: `Requested ${toRequest.length} standard documents`,
          });
          await loadClient();
          showSaved();
        }

        return (
        <div className="space-y-4">
          {/* Signed Funding Agreement */}
          {client._agreementSignature ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-emerald-900">Funding Agreement — Signed</h3>
                    <p className="text-sm text-emerald-700 mt-0.5">
                      Signed by <strong>{client._agreementSignature.fullName}</strong>
                      {client._agreementSignature.businessName && <> for <strong>{client._agreementSignature.businessName}</strong></>}
                    </p>
                  </div>
                </div>
                <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">SIGNED</span>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-emerald-600 text-xs font-medium block mb-0.5">Full Name</span>
                  <span className="text-emerald-900 font-medium">{client._agreementSignature.fullName}</span>
                </div>
                {client._agreementSignature.businessName && (
                  <div>
                    <span className="text-emerald-600 text-xs font-medium block mb-0.5">Business</span>
                    <span className="text-emerald-900 font-medium">{client._agreementSignature.businessName}</span>
                  </div>
                )}
                <div>
                  <span className="text-emerald-600 text-xs font-medium block mb-0.5">Date Signed</span>
                  <span className="text-emerald-900 font-medium">
                    {client._agreementSignature.dateSigned
                      ? new Date(client._agreementSignature.dateSigned).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-600 text-xs font-medium block mb-0.5">Timestamp</span>
                  <span className="text-emerald-900 font-medium">
                    {client._agreementSignature.timeSigned
                      ? new Date(client._agreementSignature.timeSigned).toLocaleString()
                      : client.agreementSignedAt
                      ? new Date(client.agreementSignedAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Signature image */}
              {client._agreementSignature.signatureData && (
                <div className="mt-4 bg-white rounded-lg border border-emerald-200 p-3">
                  <span className="text-xs text-emerald-600 font-medium block mb-2">Signature</span>
                  <img
                    src={client._agreementSignature.signatureData}
                    alt="Client signature"
                    className="max-h-20 border border-gray-100 rounded"
                  />
                </div>
              )}

              {/* View Full Signed Agreement */}
              <AgreementViewer agreement={client._agreementSignature} />
            </div>
          ) : client.agreementSentAt ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800">Funding Agreement — Sent, Awaiting Signature</p>
                  <p className="text-xs text-amber-600">
                    Sent on {new Date(client.agreementSentAt).toLocaleString()}
                    {client.agreementViewedAt && <> · Viewed {new Date(client.agreementViewedAt).toLocaleString()}</>}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-gray-500">Funding Agreement — Not sent yet. Use the onboarding panel above to send.</p>
              </div>
            </div>
          )}

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
                      onChange={async (e) => {
                        await updateDocumentStatus(doc.id, e.target.value);
                        await loadClient();
                        showSaved();
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
                      onClick={async () => {
                        if (!confirm("Remove this document? This cannot be undone.")) return;
                        await deleteDocAction(doc.id);
                        await loadClient();
                        showSaved();
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
        async function submitNote() {
          if (!client || !newNote.trim()) return;
          await addActivityEntry(client.id, { type: "note", message: newNote.trim() });
          await loadClient();
          setNewNote("");
          showSaved();
        }

        const activityLog = client.activityLog || [];

        const iconMap: Record<string, { bg: string; icon: JSX.Element }> = {
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

        const typeLabels: Record<string, string> = {
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
        const grouped = new Map<string, typeof client.activityLog>();
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
                    onClick={async () => {
                      await addActivityEntry(client.id, { type: "note", message: client.notes, details: "Migrated from legacy notes" });
                      await updateClient(client.id, { notes: "" });
                      await loadClient();
                      showSaved();
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

// ─── Client Login Panel ───

function ClientLoginPanel({ clientId, clientEmail, onCreated }: { clientId: string; clientEmail: string; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleFullOnboard(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await onboardClientFull(clientId, password);
      setMessage({
        type: "success",
        text: `Onboarding email sent to ${result.sentTo}! Includes: portal login, funding agreement, business profile form, and document checklist.`,
      });
      setShowForm(false);
      setPassword("");
      onCreated();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to onboard client" });
    }
    setLoading(false);
  }

  async function handleSendAgreementOnly() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await sendAgreementToClient(clientId);
      setMessage({ type: "success", text: `Agreement sent to ${result.sentTo}` });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Client Onboarding</h3>
          <p className="text-xs text-gray-500">Send portal login, agreement, business form, and document checklist in one email</p>
        </div>
      </div>

      {message && (
        <div className={`mb-3 p-3 rounded-lg text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      {!showForm ? (
        <div className="space-y-2">
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm w-full">
            Send Full Onboarding Package
          </button>
          <button onClick={handleSendAgreementOnly} disabled={loading} className="btn-secondary text-sm w-full disabled:opacity-50">
            {loading ? "Sending..." : "Resend Agreement Only"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleFullOnboard} className="space-y-3">
          <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            This will send the client an email with: <strong>portal login credentials</strong>, <strong>funding agreement to sign</strong>,
            <strong> business profile form</strong>, and a <strong>document checklist</strong> (Articles of Org, EIN, 3mo statements).
          </p>
          <div>
            <label className="label">Set Temporary Password for Client</label>
            <input
              className="input-field"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Min 8 characters — client will change after first login"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="btn-primary text-sm flex-1 disabled:opacity-50">
              {loading ? "Sending..." : "Send Onboarding Email"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setMessage(null); }} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Full Signed Agreement Viewer ───

// ─── Bank Rating Calculator ───

function getBankRating(balance: number): {
  key: string;
  tier: string;
  label: string;
  textColor: string;
  bgColor: string;
  badgeColor: string;
  barColor: string;
  percent: number;
} {
  if (balance >= 70000) return { key: "high_5", tier: "HIGH 5", label: "Super Amazing", textColor: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-200", badgeColor: "bg-emerald-600 text-white", barColor: "bg-emerald-600", percent: 100 };
  if (balance >= 40000) return { key: "mid_5", tier: "MID 5", label: "Amazing", textColor: "text-emerald-600", bgColor: "bg-emerald-50 border-emerald-200", badgeColor: "bg-emerald-500 text-white", barColor: "bg-emerald-500", percent: 88 };
  if (balance >= 10000) return { key: "low_5", tier: "LOW 5", label: "Recommended", textColor: "text-blue-700", bgColor: "bg-blue-50 border-blue-200", badgeColor: "bg-blue-600 text-white", barColor: "bg-blue-600", percent: 72 };
  if (balance >= 7000) return { key: "high_4", tier: "HIGH 4", label: "Good", textColor: "text-brand-700", bgColor: "bg-brand-50 border-brand-200", badgeColor: "bg-brand-600 text-white", barColor: "bg-brand-500", percent: 55 };
  if (balance >= 4000) return { key: "mid_4", tier: "MID 4", label: "Ok", textColor: "text-amber-700", bgColor: "bg-amber-50 border-amber-200", badgeColor: "bg-amber-500 text-white", barColor: "bg-amber-500", percent: 38 };
  return { key: "low_4", tier: "LOW 4", label: "Poor", textColor: "text-red-700", bgColor: "bg-red-50 border-red-200", badgeColor: "bg-red-500 text-white", barColor: "bg-red-500", percent: 18 };
}

// ─── Full Signed Agreement Viewer ───

function AgreementViewer({ agreement }: { agreement: AgreementSignature }) {
  const [expanded, setExpanded] = useState(false);

  if (!agreement) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
      >
        <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {expanded ? "Hide Full Signed Agreement" : "View Full Signed Agreement"}
      </button>

      {expanded && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Agreement Header */}
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{agreement.agreementTitle || "Funding Agreement"}</h3>
                {agreement.companyName && (
                  <p className="text-sm text-gray-500">{agreement.companyName}</p>
                )}
              </div>
              <div className="text-right">
                <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">EXECUTED</span>
                {agreement.agreementVersion && (
                  <p className="text-xs text-gray-400 mt-1">Version {agreement.agreementVersion}</p>
                )}
              </div>
            </div>
          </div>

          {/* Agreement Content */}
          {agreement.agreementContent ? (
            <div className="px-6 py-6">
              <div
                className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: agreement.agreementContent }}
              />
            </div>
          ) : (
            <div className="px-6 py-6 text-sm text-gray-400 italic">
              Agreement content was not captured at signing time. This applies to agreements signed before this feature was added.
            </div>
          )}

          {/* Signature Block */}
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-6">
            <h4 className="font-semibold text-gray-900 mb-4">Execution Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-gray-500 block">Full Legal Name</span>
                    <span className="text-sm font-semibold text-gray-900">{agreement.fullName}</span>
                  </div>
                  {agreement.businessName && (
                    <div>
                      <span className="text-xs text-gray-500 block">Business Name</span>
                      <span className="text-sm font-semibold text-gray-900">{agreement.businessName}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-gray-500 block">Date of Signature</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {agreement.dateSigned ? new Date(agreement.dateSigned).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Signed At (Timestamp)</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {agreement.timeSigned ? new Date(agreement.timeSigned).toLocaleString() : "—"}
                    </span>
                  </div>
                  {agreement.completedAt && (
                    <div>
                      <span className="text-xs text-gray-500 block">Document Completed</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {new Date(agreement.completedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                {agreement.signatureData && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-2">Electronic Signature</span>
                    <div className="bg-white border border-gray-200 rounded-lg p-3 inline-block">
                      <img
                        src={agreement.signatureData}
                        alt="Electronic signature"
                        className="max-h-24"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Legal footer */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400 leading-relaxed">
                This document was electronically signed and is legally binding. The signatory confirmed they read and agreed to the terms above.
                Signed electronically on {agreement.dateSigned ? new Date(agreement.dateSigned).toLocaleDateString() : "—"} at{" "}
                {agreement.timeSigned ? new Date(agreement.timeSigned).toLocaleTimeString() : "—"}.
                {agreement.agreementVersion && ` Agreement version ${agreement.agreementVersion}.`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stacking Analysis Panel ───

function StackingAnalysisPanel({ clientId }: { clientId: string }) {
  const [running, setRunning] = useState(false);
  const [analysisType, setAnalysisType] = useState<"stacking" | "revenue">("stacking");
  const [inputMode, setInputMode] = useState<"pdf" | "manual">("pdf");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);

  // PDF upload state
  const [uploading, setUploading] = useState(false);
  const [pdfParsed, setPdfParsed] = useState(false);
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfRawPreview, setPdfRawPreview] = useState("");

  // Credit data inputs (populated from PDF or manual entry)
  const [scores, setScores] = useState({ experian: "", equifax: "", transUnion: "" });
  const [inquiries, setInquiries] = useState({ experian: "0", equifax: "0", transUnion: "0" });
  const [creditAge, setCreditAge] = useState("3");
  const [existingBanks, setExistingBanks] = useState("");
  const [personalLimits, setPersonalLimits] = useState("");

  // Revenue inputs
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [timeInBusiness, setTimeInBusiness] = useState("12");
  const [hasBankStatements, setHasBankStatements] = useState(true);
  const [hasTaxReturns, setHasTaxReturns] = useState(false);

  async function handlePDFUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(true);
    setError("");
    setPdfParsed(false);
    setPdfRawPreview("");

    try {
      const formData = new FormData();
      formData.append("creditReport", file);
      const result = await parseCreditReportPDF(formData);

      setPdfFileName(file.name);

      if (result.success && result.data) {
        // Auto-fill all fields from parsed PDF
        setScores({
          experian: result.data.scores.experian?.toString() || "",
          equifax: result.data.scores.equifax?.toString() || "",
          transUnion: result.data.scores.transUnion?.toString() || "",
        });
        setInquiries({
          experian: result.data.inquiries.experian.toString(),
          equifax: result.data.inquiries.equifax.toString(),
          transUnion: result.data.inquiries.transUnion.toString(),
        });
        setCreditAge(result.data.creditAgeYears.toString());
        setExistingBanks(result.data.existingBanks.join(", "));
        setPersonalLimits(result.data.personalCardLimits.join(", "));
        setPdfParsed(true);
        if (result.rawText) setPdfRawPreview(result.rawText.substring(0, 500));
      } else {
        // Partial parse — show what we got and let admin fix
        if (result.data) {
          setScores({
            experian: result.data.scores.experian?.toString() || "",
            equifax: result.data.scores.equifax?.toString() || "",
            transUnion: result.data.scores.transUnion?.toString() || "",
          });
          setExistingBanks(result.data.existingBanks.join(", "));
        }
        if (result.rawText) setPdfRawPreview(result.rawText);
        setError(result.error || "Partial extraction — please review and fill in missing fields.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to parse PDF");
    }
    setUploading(false);
  }

  async function runAnalysis() {
    setRunning(true);
    setError("");
    setResult(null);

    try {
      if (analysisType === "stacking") {
        // Parse personal limits from comma-separated string
        const limits = personalLimits
          .split(",")
          .map((l) => parseFloat(l.replace(/[^0-9.]/g, "")))
          .filter((l) => l > 0);

        const creditData = await parseManualCreditData({
          experianScore: scores.experian ? parseInt(scores.experian) : null,
          equifaxScore: scores.equifax ? parseInt(scores.equifax) : null,
          transUnionScore: scores.transUnion ? parseInt(scores.transUnion) : null,
          experianInquiries: parseInt(inquiries.experian) || 0,
          equifaxInquiries: parseInt(inquiries.equifax) || 0,
          transUnionInquiries: parseInt(inquiries.transUnion) || 0,
          creditAgeYears: parseFloat(creditAge) || 0,
          existingBanks: existingBanks.split(",").map((b) => b.trim()).filter(Boolean),
          personalCardLimits: limits,
          derogatoryAccounts: 0,
          totalAccounts: 0,
        });
        const res = await runStackingAnalysis(clientId, creditData);
        setResult(res);
      } else {
        const res = await runRevenueLendingAnalysis(clientId, {
          creditScore: scores.experian ? parseInt(scores.experian) : null,
          monthlyRevenue: parseFloat(monthlyRevenue) || 0,
          annualRevenue: (parseFloat(monthlyRevenue) || 0) * 12,
          timeInBusinessMonths: parseInt(timeInBusiness) || 0,
          hasCollateral: false,
          hasBankStatements,
          bankStatementMonths: hasBankStatements ? 3 : 0,
          hasTaxReturns,
          hasPnL: false,
          hasInvoices: false,
          fundingPurpose: "",
          fundingAmountNeeded: 0,
          industry: "",
        });
        setResult(res);
      }
    } catch (err: any) {
      setError(err.message || "Analysis failed");
    }
    setRunning(false);
  }

  async function handleSendToClient() {
    if (!result?.analysis?.id) return;
    setSending(true);
    try {
      await sendBlueprintToClient(result.analysis.id);
      setShowConfirmSend(false);
      alert("Blueprint sent to client successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to send");
    }
    setSending(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">AI Funding Analysis</h3>
          <p className="text-xs text-gray-500">Generate credit stacking blueprint or revenue-based lending matches</p>
        </div>
      </div>

      {/* Type selector */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
        <button
          onClick={() => setAnalysisType("stacking")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${analysisType === "stacking" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
        >
          Credit Card Stacking
        </button>
        <button
          onClick={() => setAnalysisType("revenue")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${analysisType === "revenue" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
        >
          Revenue-Based Lending
        </button>
      </div>

      {/* Inputs */}
      {analysisType === "stacking" ? (
        <div className="space-y-3 mb-4">
          {/* Input mode toggle */}
          <div className="flex bg-gray-50 rounded-lg p-0.5 mb-2">
            <button
              onClick={() => setInputMode("pdf")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${inputMode === "pdf" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Credit Report
            </button>
            <button
              onClick={() => setInputMode("manual")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${inputMode === "manual" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Manual Entry
            </button>
          </div>

          {/* PDF Upload */}
          {inputMode === "pdf" && (
            <div className="space-y-3">
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  pdfParsed ? "border-emerald-300 bg-emerald-50" : "border-gray-300 hover:border-brand-400"
                }`}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <svg className="w-5 h-5 text-brand-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm text-brand-700 font-medium">AI is reading the credit report...</span>
                  </div>
                ) : pdfParsed ? (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm font-medium text-emerald-700">Credit report parsed successfully</span>
                    </div>
                    <p className="text-xs text-emerald-600">{pdfFileName} — data extracted and populated below</p>
                    <label className="inline-block mt-2 text-xs text-brand-600 hover:text-brand-800 cursor-pointer font-medium">
                      Upload different report
                      <input type="file" accept=".pdf" className="hidden" onChange={(e) => handlePDFUpload(e.target.files)} />
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer block py-2">
                    <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600 font-medium">Upload Credit Report PDF</p>
                    <p className="text-xs text-gray-400 mt-0.5">SmartCredit, Array, or any credit report PDF</p>
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => handlePDFUpload(e.target.files)} />
                  </label>
                )}
              </div>

              {/* Raw text preview if partial parse */}
              {pdfRawPreview && !pdfParsed && (
                <details className="text-xs">
                  <summary className="text-gray-500 cursor-pointer hover:text-gray-700">View extracted text</summary>
                  <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] text-gray-500 max-h-32 overflow-auto whitespace-pre-wrap">{pdfRawPreview}</pre>
                </details>
              )}
            </div>
          )}

          {/* Score fields — shown for both PDF (auto-filled) and manual */}
          {(inputMode === "manual" || pdfParsed || (inputMode === "pdf" && scores.experian)) && (
            <>
              {pdfParsed && <p className="text-xs text-emerald-600 font-medium">Extracted data — review and adjust if needed:</p>}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Experian</label>
                  <input className="input-field text-sm" type="number" placeholder="Score" value={scores.experian} onChange={(e) => setScores({ ...scores, experian: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Equifax</label>
                  <input className="input-field text-sm" type="number" placeholder="Score" value={scores.equifax} onChange={(e) => setScores({ ...scores, equifax: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">TransUnion</label>
                  <input className="input-field text-sm" type="number" placeholder="Score" value={scores.transUnion} onChange={(e) => setScores({ ...scores, transUnion: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">EX Inquiries</label>
                  <input className="input-field text-sm" type="number" value={inquiries.experian} onChange={(e) => setInquiries({ ...inquiries, experian: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">EQ Inquiries</label>
                  <input className="input-field text-sm" type="number" value={inquiries.equifax} onChange={(e) => setInquiries({ ...inquiries, equifax: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">TU Inquiries</label>
                  <input className="input-field text-sm" type="number" value={inquiries.transUnion} onChange={(e) => setInquiries({ ...inquiries, transUnion: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Credit Age (years)</label>
                  <input className="input-field text-sm" type="number" value={creditAge} onChange={(e) => setCreditAge(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Existing Banks</label>
                  <input className="input-field text-sm" placeholder="Chase, Amex, BOA..." value={existingBanks} onChange={(e) => setExistingBanks(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Personal Card Limits</label>
                  <input className="input-field text-sm" placeholder="10000, 15000, 8000" value={personalLimits} onChange={(e) => setPersonalLimits(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Monthly Revenue</label>
              <input className="input-field text-sm" type="number" placeholder="$" value={monthlyRevenue} onChange={(e) => setMonthlyRevenue(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Time in Business (months)</label>
              <input className="input-field text-sm" type="number" value={timeInBusiness} onChange={(e) => setTimeInBusiness(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Credit Score (optional)</label>
              <input className="input-field text-sm" type="number" placeholder="Any bureau" value={scores.experian} onChange={(e) => setScores({ ...scores, experian: e.target.value })} />
            </div>
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={hasBankStatements} onChange={(e) => setHasBankStatements(e.target.checked)} className="rounded" />
                Bank Statements
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={hasTaxReturns} onChange={(e) => setHasTaxReturns(e.target.checked)} className="rounded" />
                Tax Returns
              </label>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-3 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{error}</div>}

      <button
        onClick={runAnalysis}
        disabled={running}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {running ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analyzing...
          </>
        ) : (
          <>Run {analysisType === "stacking" ? "Stacking" : "Lending"} Analysis</>
        )}
      </button>

      {/* Results */}
      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-700 mb-3">{result.analysis?.summary || result.blueprint?.summary}</p>
          {result.analysis?.totalProjected > 0 && (
            <p className="text-lg font-bold text-emerald-600 mb-3">
              Projected: ${result.analysis.totalProjected.toLocaleString()}
            </p>
          )}

          {/* Cross-sell credit repair */}
          {result.crossSellCreditRepair && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <strong>Credit Repair Recommended:</strong> {result.creditRepairMessage}
            </div>
          )}

          {/* Send to client buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirmSend(true)}
              className="btn-secondary text-sm flex-1"
            >
              Send Blueprint to Client
            </button>
            <button
              onClick={async () => {
                try {
                  const creditData = await parseManualCreditData({
                    experianScore: scores.experian ? parseInt(scores.experian) : null,
                    equifaxScore: scores.equifax ? parseInt(scores.equifax) : null,
                    transUnionScore: scores.transUnion ? parseInt(scores.transUnion) : null,
                    experianInquiries: parseInt(inquiries.experian) || 0,
                    equifaxInquiries: parseInt(inquiries.equifax) || 0,
                    transUnionInquiries: parseInt(inquiries.transUnion) || 0,
                    creditAgeYears: parseFloat(creditAge) || 0,
                    existingBanks: existingBanks.split(",").map((b) => b.trim()).filter(Boolean),
                    personalCardLimits: personalLimits.split(",").map((l) => parseFloat(l.replace(/[^0-9.]/g, ""))).filter((l) => l > 0),
                    derogatoryAccounts: 0,
                    totalAccounts: 0,
                  });
                  await sendCreditAnalysisEmail(clientId, creditData);
                  alert("Credit analysis report sent to client!");
                } catch (err: any) {
                  alert(err.message);
                }
              }}
              className="btn-primary text-sm flex-1"
            >
              Send Credit Analysis Report
            </button>
          </div>
        </div>
      )}

      {/* Confirmation popup */}
      {showConfirmSend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Send</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              If you are running the applications on behalf of the client, are you sure you want to send the funding blueprint to the client?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSendToClient}
                disabled={sending}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Yes, Send to Client"}
              </button>
              <button
                onClick={() => setShowConfirmSend(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
