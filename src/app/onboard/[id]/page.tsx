"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Client } from "@/lib/types";
import { getClient, upsertClient } from "@/lib/store";

type Step = "agreement" | "business" | "credit" | "complete";

const CREDIT_PROVIDERS = [
  { value: "identityiq", label: "IdentityIQ" },
  { value: "smartcredit", label: "SmartCredit" },
  { value: "myfico", label: "MyFICO" },
  { value: "creditkarma", label: "Credit Karma" },
  { value: "experian", label: "Experian CreditWorks" },
  { value: "nav", label: "Nav.com" },
  { value: "other", label: "Other" },
];

export default function ClientOnboardingPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [step, setStep] = useState<Step>("agreement");
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Agreement form
  const [agreementName, setAgreementName] = useState("");
  const [agreementDate, setAgreementDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  // Business form
  const [personal, setPersonal] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    ssn: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });
  const [business, setBusiness] = useState({
    businessName: "",
    businessAge: "",
    naicsCode: "",
    sicCode: "",
    ein: "",
    businessAddress: "",
    businessPhone: "",
    annualRevenue: "",
    entityType: "",
    stateOfIncorporation: "",
  });

  // Credit monitoring
  const [creditProvider, setCreditProvider] = useState("");
  const [creditUsername, setCreditUsername] = useState("");
  const [creditPassword, setCreditPassword] = useState("");
  const [creditActive, setCreditActive] = useState(false);

  useEffect(() => {
    const c = getClient(params.id as string);
    if (!c) {
      setLoading(false);
      return;
    }
    setClient(c);

    // Pre-fill from existing client data
    setPersonal({
      firstName: c.personalInfo.firstName || "",
      lastName: c.personalInfo.lastName || "",
      email: c.personalInfo.email || "",
      phone: c.personalInfo.phone || "",
      ssn: c.personalInfo.ssn || "",
      dateOfBirth: c.personalInfo.dateOfBirth || "",
      address: c.personalInfo.address || "",
      city: c.personalInfo.city || "",
      state: c.personalInfo.state || "",
      zip: c.personalInfo.zip || "",
    });
    setBusiness({
      businessName: c.businessInfo.businessName || "",
      businessAge: c.businessInfo.businessAge || "",
      naicsCode: c.businessInfo.naicsCode || "",
      sicCode: c.businessInfo.sicCode || "",
      ein: c.businessInfo.ein || "",
      businessAddress: c.businessInfo.businessAddress || "",
      businessPhone: c.businessInfo.businessPhone || "",
      annualRevenue: c.businessInfo.annualRevenue || "",
      entityType: c.businessInfo.entityType || "",
      stateOfIncorporation: c.businessInfo.stateOfIncorporation || "",
    });
    setAgreementName(
      `${c.personalInfo.firstName} ${c.personalInfo.lastName}`.trim()
    );

    // Pre-fill credit monitoring
    if (c.creditMonitoringProvider) setCreditProvider(c.creditMonitoringProvider);
    if (c.creditMonitoringUsername) setCreditUsername(c.creditMonitoringUsername);
    if (c.creditMonitoringStatus === "active") setCreditActive(true);

    // Jump to the right step based on progress
    const steps = c.onboardingCompletedSteps || {
      agreement: false,
      businessForm: false,
      creditMonitoring: false,
    };
    if (steps.agreement && steps.businessForm && steps.creditMonitoring) {
      setStep("complete");
    } else if (steps.agreement && steps.businessForm) {
      setStep("credit");
    } else if (steps.agreement) {
      setStep("business");
    }

    setLoading(false);
  }, [params.id]);

  // Canvas signature drawing
  useEffect(() => {
    if (step !== "agreement" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1a365d";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [step]);

  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDraw() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  function getSignatureData(): string {
    if (!canvasRef.current) return "";
    return canvasRef.current.toDataURL("image/png");
  }

  function submitAgreement() {
    if (!client) return;
    if (!agreementName.trim()) {
      alert("Please enter your full legal name.");
      return;
    }
    if (!agreementAccepted) {
      alert("Please accept the terms of the agreement.");
      return;
    }
    if (!hasSignature) {
      alert("Please provide your signature.");
      return;
    }

    const updated: Client = {
      ...client,
      agreementSignature: {
        fullName: agreementName,
        signatureData: getSignatureData(),
        dateSigned: new Date().toISOString(),
        ipAddress: "client-local",
      },
      onboardingStatus: "agreement_signed",
      onboardingCompletedSteps: {
        ...(client.onboardingCompletedSteps || {
          agreement: false,
          businessForm: false,
          creditMonitoring: false,
        }),
        agreement: true,
      },
    };
    upsertClient(updated);
    setClient(updated);
    setStep("business");
  }

  function submitBusinessForm() {
    if (!client) return;
    if (!personal.firstName || !personal.lastName || !personal.email) {
      alert("Please fill in at least your first name, last name, and email.");
      return;
    }

    const updated: Client = {
      ...client,
      personalInfo: {
        ...client.personalInfo,
        firstName: personal.firstName,
        lastName: personal.lastName,
        email: personal.email,
        phone: personal.phone,
        ssn: personal.ssn,
        dateOfBirth: personal.dateOfBirth,
        address: personal.address,
        city: personal.city,
        state: personal.state,
        zip: personal.zip,
      },
      businessInfo: {
        businessName: business.businessName,
        businessAge: business.businessAge,
        naicsCode: business.naicsCode,
        sicCode: business.sicCode,
        ein: business.ein,
        businessAddress: business.businessAddress,
        businessPhone: business.businessPhone,
        annualRevenue: business.annualRevenue,
        entityType: business.entityType,
        stateOfIncorporation: business.stateOfIncorporation,
      },
      onboardingCompletedSteps: {
        ...(client.onboardingCompletedSteps || {
          agreement: false,
          businessForm: false,
          creditMonitoring: false,
        }),
        businessForm: true,
      },
    };
    upsertClient(updated);
    setClient(updated);
    setStep("credit");
  }

  function submitCreditMonitoring() {
    if (!client) return;
    if (!creditProvider) {
      alert("Please select a credit monitoring provider.");
      return;
    }

    const updated: Client = {
      ...client,
      creditMonitoringStatus: creditActive ? "active" : "pending",
      creditMonitoringProvider: creditProvider,
      creditMonitoringUsername: creditUsername,
      creditMonitoringPassword: creditPassword,
      onboardingStatus: "active",
      onboardedAt: client.onboardedAt || new Date().toISOString(),
      onboardingCompletedSteps: {
        ...(client.onboardingCompletedSteps || {
          agreement: false,
          businessForm: false,
          creditMonitoring: false,
        }),
        creditMonitoring: true,
      },
    };
    upsertClient(updated);
    setClient(updated);
    setStep("complete");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-500">
            This onboarding link is invalid or has expired. Please contact your funding representative.
          </p>
        </div>
      </div>
    );
  }

  const stepConfig = [
    { key: "agreement", label: "Funding Agreement" },
    { key: "business", label: "Business Funding Form" },
    { key: "credit", label: "Credit Monitoring" },
  ];
  const currentStepIdx = step === "complete" ? 3 : stepConfig.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
        {/* Welcome Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {client.personalInfo.firstName || "Client"}!
          </h1>
          <p className="text-gray-500 mt-1">
            Complete the steps below to get started with your funding process
          </p>
        </div>

        {/* Step Progress */}
        {step !== "complete" && (
          <div className="flex items-center justify-center gap-4">
            {stepConfig.map((s, i) => {
              const isActive = s.key === step;
              const isCompleted = i < currentStepIdx;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isCompleted
                        ? "bg-emerald-500 text-white"
                        : isActive
                        ? "bg-brand-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-sm font-medium hidden sm:inline ${isActive ? "text-brand-700" : "text-gray-500"}`}>
                    {s.label}
                  </span>
                  {i < 2 && <div className="w-8 sm:w-16 h-0.5 bg-gray-200 mx-1" />}
                </div>
              );
            })}
          </div>
        )}

        {/* STEP 1: FUNDING AGREEMENT */}
        {step === "agreement" && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-brand-50 border-b border-brand-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-brand-900">Business Funding Services Agreement</h2>
              <p className="text-sm text-brand-700">Please review and sign the agreement below to proceed</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Contract Text */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 max-h-80 overflow-y-auto text-sm text-gray-700 leading-relaxed">
                <h3 className="font-bold text-gray-900 mb-4 text-base text-center uppercase tracking-wide">
                  Business Funding Services Agreement
                </h3>

                <p className="mb-3">
                  This Business Funding Services Agreement (&quot;Agreement&quot;) is entered into as of the date signed below,
                  by and between the undersigned Client (&quot;Client&quot;) and the Funding Company (&quot;Company&quot;).
                </p>

                <h4 className="font-semibold text-gray-900 mt-4 mb-2">1. SCOPE OF SERVICES</h4>
                <p className="mb-3">
                  The Company agrees to provide the following services: (a) Credit profile analysis and optimization consulting;
                  (b) Business credit building guidance and strategy; (c) Business funding application preparation, review, and
                  submission on behalf of the Client; (d) Lender matching and relationship management; (e) Ongoing support and
                  communication throughout the entire funding process; (f) Post-funding account management guidance.
                </p>

                <h4 className="font-semibold text-gray-900 mt-4 mb-2">2. CLIENT RESPONSIBILITIES</h4>
                <p className="mb-3">
                  Client agrees to: (a) Provide accurate, complete, and truthful information including personal identification,
                  business documentation, financial records, tax returns, and any other materials reasonably requested;
                  (b) Respond to Company communications within 48 hours; (c) Not apply for additional credit or funding without
                  prior consultation with the Company during the active funding period; (d) Maintain all existing credit accounts
                  in good standing during the funding process.
                </p>

                <h4 className="font-semibold text-gray-900 mt-4 mb-2">3. AUTHORIZATION &amp; CONSENT</h4>
                <p className="mb-3">
                  Client hereby authorizes the Company to: (a) Pull and review credit reports from Experian, Equifax, and TransUnion;
                  (b) Submit business funding applications to lenders and financial institutions on Client&apos;s behalf;
                  (c) Communicate directly with lenders regarding Client&apos;s applications and funding status;
                  (d) Access and store Client&apos;s personal and business information in the Company&apos;s secure CRM system;
                  (e) Share Client&apos;s information with lending partners as necessary to facilitate funding.
                </p>

                <h4 className="font-semibold text-gray-900 mt-4 mb-2">4. FEES &amp; PAYMENT</h4>
                <p className="mb-3">
                  Service fees will be disclosed separately in a Fee Schedule and agreed upon prior to commencement of services.
                  Payment terms include: (a) All fees are due as specified in the Fee Schedule; (b) Services rendered are non-refundable;
                  (c) Success fees, if applicable, are due within 10 business days of funding disbursement.
                </p>

                <h4 className="font-semibold text-gray-900 mt-4 mb-2">5. CONFIDENTIALITY</h4>
                <p className="mb-3">
                  The Company agrees to maintain the strict confidentiality of all Client information. Client data will only be
                  disclosed to: (a) Lending partners as necessary to process applications; (b) Third parties required by law or regulation;
                  (c) Company employees and contractors on a need-to-know basis.
                </p>

                <h4 className="font-semibold text-gray-900 mt-4 mb-2">6. DISCLAIMER &amp; LIMITATIONS</h4>
                <p className="mb-3">
                  The Company does not guarantee: (a) Approval for any specific funding amount, product, or interest rate;
                  (b) A specific credit score improvement; (c) Approval by any particular lender. Results vary based on
                  Client&apos;s credit profile, business qualifications, market conditions, and lender criteria.
                </p>

                <h4 className="font-semibold text-gray-900 mt-4 mb-2">7. TERM &amp; TERMINATION</h4>
                <p>
                  This Agreement is effective from the date of signature and remains in effect for 12 months or until all funded
                  accounts have been fully disbursed, whichever comes later. Either party may terminate with 30 days written notice.
                </p>
              </div>

              {/* Agreement Checkbox */}
              <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-lg border border-brand-200">
                <input
                  type="checkbox"
                  id="agree"
                  checked={agreementAccepted}
                  onChange={(e) => setAgreementAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                />
                <label htmlFor="agree" className="text-sm text-brand-800">
                  I have read, understood, and agree to all the terms and conditions outlined in this Business Funding Services Agreement.
                  I understand that this is a legally binding contract.
                </label>
              </div>

              {/* Signature Section */}
              <div className="border border-gray-200 rounded-lg p-5 space-y-4">
                <h3 className="font-semibold text-gray-900">Sign Below</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Full Legal Name *</label>
                    <input
                      className="input-field"
                      placeholder="Enter your full legal name"
                      value={agreementName}
                      onChange={(e) => setAgreementName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Date *</label>
                    <input
                      className="input-field"
                      type="date"
                      value={agreementDate}
                      onChange={(e) => setAgreementDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Signature *</label>
                    <button onClick={clearSignature} className="text-xs text-red-500 hover:text-red-700">
                      Clear
                    </button>
                  </div>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={150}
                      className="w-full cursor-crosshair"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Draw your signature using your mouse or trackpad</p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={submitAgreement}
                  disabled={!agreementAccepted || !agreementName || !hasSignature}
                  className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sign &amp; Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: BUSINESS FUNDING FORM */}
        {step === "business" && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-brand-50 border-b border-brand-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-brand-900">Business Funding Application Form</h2>
              <p className="text-sm text-brand-700">
                Fill out your personal and business details so we can match you with the best funding options
              </p>
            </div>

            <div className="p-6 space-y-8">
              {/* Personal Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="label">First Name *</label>
                    <input className="input-field" value={personal.firstName} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Last Name *</label>
                    <input className="input-field" value={personal.lastName} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Email *</label>
                    <input className="input-field" type="email" value={personal.email} onChange={(e) => setPersonal({ ...personal, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input-field" type="tel" value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Date of Birth</label>
                    <input className="input-field" type="date" value={personal.dateOfBirth} onChange={(e) => setPersonal({ ...personal, dateOfBirth: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">SSN (Last 4)</label>
                    <input className="input-field" maxLength={4} placeholder="XXXX" value={personal.ssn} onChange={(e) => setPersonal({ ...personal, ssn: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Address</label>
                    <input className="input-field" value={personal.address} onChange={(e) => setPersonal({ ...personal, address: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">City</label>
                    <input className="input-field" value={personal.city} onChange={(e) => setPersonal({ ...personal, city: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">State</label>
                    <input className="input-field" value={personal.state} onChange={(e) => setPersonal({ ...personal, state: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">ZIP Code</label>
                    <input className="input-field" value={personal.zip} onChange={(e) => setPersonal({ ...personal, zip: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Business Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Business Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Business Name</label>
                    <input className="input-field" value={business.businessName} onChange={(e) => setBusiness({ ...business, businessName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Business Age</label>
                    <input className="input-field" placeholder="e.g. 2 years" value={business.businessAge} onChange={(e) => setBusiness({ ...business, businessAge: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">EIN</label>
                    <input className="input-field" placeholder="XX-XXXXXXX" value={business.ein} onChange={(e) => setBusiness({ ...business, ein: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Entity Type</label>
                    <select className="input-field" value={business.entityType} onChange={(e) => setBusiness({ ...business, entityType: e.target.value })}>
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
                    <input className="input-field" value={business.stateOfIncorporation} onChange={(e) => setBusiness({ ...business, stateOfIncorporation: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Annual Revenue</label>
                    <input className="input-field" placeholder="e.g. $150,000" value={business.annualRevenue} onChange={(e) => setBusiness({ ...business, annualRevenue: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">NAICS Code</label>
                    <input className="input-field" value={business.naicsCode} onChange={(e) => setBusiness({ ...business, naicsCode: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">SIC Code</label>
                    <input className="input-field" value={business.sicCode} onChange={(e) => setBusiness({ ...business, sicCode: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Business Phone</label>
                    <input className="input-field" type="tel" value={business.businessPhone} onChange={(e) => setBusiness({ ...business, businessPhone: e.target.value })} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="label">Business Address</label>
                    <input className="input-field" value={business.businessAddress} onChange={(e) => setBusiness({ ...business, businessAddress: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={submitBusinessForm} className="btn-primary px-8">
                  Save &amp; Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: CREDIT MONITORING */}
        {step === "credit" && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-brand-50 border-b border-brand-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-brand-900">Credit Monitoring Setup</h2>
              <p className="text-sm text-brand-700">
                We need access to your credit monitoring to track your credit profile and find the best funding options
              </p>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">Why do we need credit monitoring access?</p>
                    <p>
                      Active credit monitoring allows us to: review your credit profile across all 3 bureaus,
                      identify the best funding products for your score range, track score changes during the
                      funding process, and ensure timely application stacking.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Credit Monitoring Provider *</label>
                <select className="input-field" value={creditProvider} onChange={(e) => setCreditProvider(e.target.value)}>
                  <option value="">Select your provider...</option>
                  {CREDIT_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Login Username / Email</label>
                  <input className="input-field" placeholder="Your credit monitoring login" value={creditUsername} onChange={(e) => setCreditUsername(e.target.value)} />
                </div>
                <div>
                  <label className="label">Login Password</label>
                  <input className="input-field" type="password" placeholder="Your credit monitoring password" value={creditPassword} onChange={(e) => setCreditPassword(e.target.value)} />
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <input
                  type="checkbox"
                  id="credit-active"
                  checked={creditActive}
                  onChange={(e) => setCreditActive(e.target.checked)}
                  className="mt-1 w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                />
                <label htmlFor="credit-active" className="text-sm text-gray-700">
                  I confirm that my credit monitoring subscription is currently active and I have access to view my
                  credit reports from all 3 bureaus (Experian, Equifax, TransUnion).
                </label>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Don&apos;t have credit monitoring yet?</p>
                <p>
                  We recommend signing up with <strong>IdentityIQ</strong> or <strong>SmartCredit</strong> as they provide
                  the most comprehensive 3-bureau reports. Your funding representative can help you get set up.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={submitCreditMonitoring}
                  disabled={!creditProvider}
                  className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Complete Onboarding
                </button>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETE */}
        {step === "complete" && (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Onboarding Complete!</h2>
              <p className="text-gray-500 mt-2 max-w-md mx-auto">
                Thank you, <strong>{client.personalInfo.firstName}</strong>! Your information has been submitted
                successfully. Your funding team will review your details and begin working on your funding strategy.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <svg className="w-5 h-5 text-emerald-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                </svg>
                <p className="text-xs font-medium text-emerald-800">Agreement Signed</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <svg className="w-5 h-5 text-emerald-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                </svg>
                <p className="text-xs font-medium text-emerald-800">Info Submitted</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <svg className="w-5 h-5 text-emerald-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                </svg>
                <p className="text-xs font-medium text-emerald-800">Credit Active</p>
              </div>
            </div>

            <div className="pt-4">
              <button onClick={() => router.push("/client/profile")} className="btn-primary px-8">
                Go to My Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
