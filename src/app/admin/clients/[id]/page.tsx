"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Client, FundingApplication, CreditBureauData } from "@/lib/types";
import { getClient, upsertClient, getApiKey, setApiKey, getApiProvider, setApiProvider } from "@/lib/store";

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

  useEffect(() => {
    const c = getClient(params.id as string);
    if (!c) {
      router.push("/admin/clients");
      return;
    }
    setClient(c);
    setApiKeyState(getApiKey());
    setApiProviderState(getApiProvider());
  }, [params.id, router]);

  function save(updated: Client) {
    // Recalculate totals
    updated.totalApproved = updated.fundingApplications
      .filter((a) => a.status === "approved" || a.status === "funded")
      .reduce((sum, a) => sum + (a.amount || 0), 0);
    updated.totalFunded = updated.fundingApplications
      .filter((a) => a.status === "funded")
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    upsertClient(updated);
    setClient({ ...updated });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
    save(updated);
  }

  function updateApplication(id: string, field: keyof FundingApplication, value: string) {
    if (!client) return;
    const updated = { ...client };
    const app = updated.fundingApplications.find((a) => a.id === id);
    if (!app) return;
    if (field === "amount") {
      app.amount = value === "" ? null : Number(value);
    } else {
      (app as any)[field] = value;
    }
    save(updated);
  }

  function removeApplication(id: string) {
    if (!client) return;
    const updated = {
      ...client,
      fundingApplications: client.fundingApplications.filter((a) => a.id !== id),
    };
    save(updated);
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
    save(updated);
  }

  function sendOnboardingEmail() {
    if (!client || !client.personalInfo.email) {
      alert("Client must have an email address to send the onboarding link.");
      return;
    }
    setEmailSending(true);
    // Simulate email sending
    setTimeout(() => {
      const updated = {
        ...client,
        onboardingStatus: (client.onboardingStatus === "not_started" ? "agreement_sent" : client.onboardingStatus) as Client["onboardingStatus"],
        onboardingEmailSentAt: new Date().toISOString(),
      };
      save(updated);
      setEmailSending(false);
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 4000);
    }, 1500);
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
    { key: "notes", label: "Notes" },
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
          {/* API Configuration */}
          <div className="card p-6 bg-brand-50 border-brand-200">
            <h3 className="font-semibold text-brand-900 mb-3">Credit Data API Configuration</h3>
            <p className="text-sm text-brand-700 mb-4">
              Connect a credit data provider API to automatically pull credit reports. Until configured, use the manual entry fields below.
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
        </div>
      )}

      {/* BUSINESS INFO TAB */}
      {activeTab === "business" && (
        <div className="space-y-6">
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
                <div key={app.id} className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-gray-500">Application #{index + 1}</span>
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
                        placeholder="e.g. Chase, Amex"
                        value={app.lender}
                        onChange={(e) => updateApplication(app.id, "lender", e.target.value)}
                      />
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
      {activeTab === "documents" && (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="font-semibold text-lg text-brand-800 mb-4">Client Documents</h3>
            {client.documents.length > 0 ? (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Document</th>
                    <th className="table-header">Uploaded</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {client.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="table-cell font-medium">{doc.name}</td>
                      <td className="table-cell">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                      <td className="table-cell">
                        <select
                          className="input-field w-auto text-sm"
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
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() => {
                            const updated = { ...client, documents: client.documents.filter((d) => d.id !== doc.id) };
                            save(updated);
                          }}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-400 text-center py-8">No documents uploaded by this client yet.</p>
            )}
          </div>
        </div>
      )}

      {/* NOTES TAB */}
      {activeTab === "notes" && (
        <div className="card p-6">
          <h3 className="font-semibold text-lg text-brand-800 mb-4">Internal Notes</h3>
          <textarea
            className="input-field min-h-[200px]"
            placeholder="Add internal notes about this client..."
            value={client.notes}
            onChange={(e) => {
              const updated = { ...client, notes: e.target.value };
              save(updated);
            }}
          />
        </div>
      )}
    </div>
  );
}
