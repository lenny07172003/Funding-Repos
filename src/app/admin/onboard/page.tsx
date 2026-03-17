"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEmptyClient, upsertClient } from "@/lib/store";

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "agreement" | "complete">("form");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    businessName: "",
  });
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [clientId, setClientId] = useState("");

  function handleNext() {
    if (!form.firstName || !form.lastName || !form.email) {
      alert("Please fill in at least the first name, last name, and email.");
      return;
    }
    setStep("agreement");
  }

  function handleComplete() {
    const client = createEmptyClient();
    client.personalInfo.firstName = form.firstName;
    client.personalInfo.lastName = form.lastName;
    client.personalInfo.email = form.email;
    client.personalInfo.phone = form.phone;
    client.businessInfo.businessName = form.businessName;
    client.onboardingStatus = agreementAccepted ? "agreement_signed" : "agreement_sent";
    client.onboardedAt = new Date().toISOString();
    upsertClient(client);
    setClientId(client.id);
    setStep("complete");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Onboard New Client</h1>
        <p className="text-gray-500 mt-1">Create a client profile and send the funding agreement</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 sm:gap-4">
        {["Client Info", "Agreement", "Complete"].map((label, i) => {
          const stepNum = i === 0 ? "form" : i === 1 ? "agreement" : "complete";
          const active = step === stepNum;
          const completed = (step === "agreement" && i === 0) || (step === "complete" && i < 2);
          return (
            <div key={label} className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${
                  completed
                    ? "bg-emerald-500 text-white"
                    : active
                    ? "bg-brand-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {completed ? (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs sm:text-sm font-medium ${active ? "text-brand-700" : "text-gray-500"}`}>
                {label}
              </span>
              {i < 2 && <div className="w-6 sm:w-12 h-0.5 bg-gray-200 mx-1 sm:mx-2" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Client Info */}
      {step === "form" && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-brand-800">Client Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input
                className="input-field"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input
                className="input-field"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                className="input-field"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input-field"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Business Name</label>
              <input
                className="input-field"
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleNext} className="btn-primary">
              Next: Funding Agreement →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Funding Agreement */}
      {step === "agreement" && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-brand-800">Funding Agreement</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 max-h-96 overflow-y-auto text-sm text-gray-700 leading-relaxed">
            <h3 className="font-bold text-gray-900 mb-4 text-base">BUSINESS FUNDING SERVICES AGREEMENT</h3>

            <p className="mb-3">
              This Business Funding Services Agreement (&quot;Agreement&quot;) is entered into by and between
              the Client identified below and the Funding Company (&quot;Company&quot;).
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">1. SERVICES</h4>
            <p className="mb-3">
              The Company agrees to provide credit repair consulting, business funding preparation,
              and application assistance services. Services include but are not limited to: credit profile
              analysis, business credit building guidance, funding application preparation and submission,
              and ongoing support throughout the funding process.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">2. CLIENT RESPONSIBILITIES</h4>
            <p className="mb-3">
              Client agrees to provide accurate and complete information including personal identification,
              business documentation, financial records, and any other materials reasonably requested.
              Client authorizes the Company to access credit reports and related financial data necessary
              to perform the services.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">3. AUTHORIZATION</h4>
            <p className="mb-3">
              Client hereby authorizes the Company to: (a) pull credit reports from all three major bureaus,
              (b) submit business funding applications on Client&apos;s behalf, (c) communicate with lenders
              and financial institutions regarding Client&apos;s applications, and (d) store and manage Client&apos;s
              personal and business information in the Company&apos;s secure CRM system.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">4. FEES & PAYMENT</h4>
            <p className="mb-3">
              Fees for services will be disclosed separately and agreed upon prior to commencement of services.
              All fees are non-refundable once services have been rendered unless otherwise stated in writing.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">5. CONFIDENTIALITY</h4>
            <p className="mb-3">
              The Company agrees to maintain the confidentiality of all Client information and will not
              disclose such information to any third party except as necessary to perform the agreed-upon
              services or as required by law.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">6. DISCLAIMER</h4>
            <p>
              The Company does not guarantee approval for any specific funding amount or product.
              Results may vary based on Client&apos;s credit profile, business qualifications, and lender criteria.
            </p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-lg border border-brand-200">
            <input
              type="checkbox"
              id="agree"
              checked={agreementAccepted}
              onChange={(e) => setAgreementAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
            />
            <label htmlFor="agree" className="text-sm text-brand-800">
              I confirm that the client has reviewed and agreed to the terms of this Funding Agreement.
              The agreement has been presented and accepted either in person, via email, or through the
              client portal.
            </label>
          </div>

          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <button onClick={() => setStep("form")} className="btn-secondary order-2 sm:order-1">
              ← Back
            </button>
            <div className="flex flex-col sm:flex-row gap-3 order-1 sm:order-2">
              <button
                onClick={() => {
                  setAgreementAccepted(false);
                  handleComplete();
                }}
                className="btn-secondary"
              >
                Send Agreement Later
              </button>
              <button
                onClick={handleComplete}
                disabled={!agreementAccepted}
                className="btn-success"
              >
                Complete Onboarding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Complete */}
      {step === "complete" && (
        <div className="card p-12 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Client Onboarded Successfully!</h2>
            <p className="text-gray-500 mt-2">
              <strong>{form.firstName} {form.lastName}</strong> has been added to the CRM.
              {agreementAccepted
                ? " The funding agreement has been marked as signed."
                : " The funding agreement has been sent for review."}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <button
              onClick={() => router.push(`/admin/clients/${clientId}`)}
              className="btn-primary"
            >
              Go to Client Profile
            </button>
            <button
              onClick={() => {
                setStep("form");
                setForm({ firstName: "", lastName: "", email: "", phone: "", businessName: "" });
                setAgreementAccepted(false);
                setClientId("");
              }}
              className="btn-secondary"
            >
              Onboard Another Client
            </button>
            <button
              onClick={() => router.push("/admin/clients")}
              className="btn-secondary"
            >
              Back to All Clients
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
