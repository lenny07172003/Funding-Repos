"use client";

import { useState, useEffect } from "react";
import { getAgreementTemplate, updateAgreementTemplate } from "@/lib/agreement-actions";

export default function AgreementEditorPage() {
  const [title, setTitle] = useState("BUSINESS FUNDING SERVICES AGREEMENT");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState(1);
  const [lastUpdated, setLastUpdated] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const tmpl = await getAgreementTemplate();
        if (tmpl) {
          setTitle(tmpl.fundingAgreementTitle || "BUSINESS FUNDING SERVICES AGREEMENT");
          setContent(tmpl.fundingAgreementContent || "");
          setVersion(tmpl.fundingAgreementVersion || 1);
          setLastUpdated(tmpl.fundingAgreementUpdatedAt || "");
        }
      } catch {}
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await updateAgreementTemplate({ title, content });
      setSaved(true);
      setVersion((v) => v + 1);
      setLastUpdated(new Date().toISOString());
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Funding Agreement</h1>
          <p className="text-gray-500 mt-1">
            Customize the agreement your clients will review and sign.
            {lastUpdated && (
              <span className="text-xs text-gray-400 ml-2">
                v{version} — last updated {new Date(lastUpdated).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setPreview(!preview)}
            className="btn-secondary"
          >
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Agreement"}
          </button>
        </div>
      </div>

      {!content && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>No agreement configured yet.</strong> Write your funding agreement below. This is what your clients will see when they review and sign. You can use the template below as a starting point.
          <button
            onClick={() => setContent(DEFAULT_AGREEMENT)}
            className="ml-2 underline font-medium"
          >
            Load default template
          </button>
        </div>
      )}

      {/* Title */}
      <div className="card p-6">
        <label className="label">Agreement Title</label>
        <input
          className="input-field text-lg font-semibold"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="BUSINESS FUNDING SERVICES AGREEMENT"
        />
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div className="card p-8">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-6">{title}</h2>
          <div
            className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: content || "<p>No content yet.</p>" }}
          />
        </div>
      ) : (
        <div className="card p-6">
          <label className="label mb-2">Agreement Content (HTML supported)</label>
          <p className="text-xs text-gray-400 mb-3">
            Write your agreement text below. You can use HTML for formatting:
            &lt;h4&gt; for section headers, &lt;p&gt; for paragraphs, &lt;strong&gt; for bold, &lt;ul&gt;&lt;li&gt; for lists.
          </p>
          <textarea
            className="input-field font-mono text-sm min-h-[500px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter your funding agreement content here..."
          />
        </div>
      )}

      {/* Help */}
      <div className="card p-4 bg-brand-50 border-brand-200">
        <h3 className="font-semibold text-brand-900 mb-2">How it works</h3>
        <ol className="text-sm text-brand-700 space-y-1.5 list-decimal list-inside">
          <li>Write or paste your funding agreement above and save</li>
          <li>When onboarding a client, click &quot;Send Agreement&quot; on their profile</li>
          <li>Client receives an email with a link to review and sign</li>
          <li>Client enters their <strong>full name</strong>, <strong>business name</strong>, <strong>date</strong>, and <strong>signature</strong></li>
          <li>Signed agreement is stored with a timestamp — viewable on the client&apos;s profile</li>
        </ol>
      </div>
    </div>
  );
}

const DEFAULT_AGREEMENT = `<h4>1. SERVICES</h4>
<p>The Company agrees to provide credit repair consulting, business funding preparation, and application assistance services. Services include but are not limited to: credit profile analysis, business credit building guidance, funding application preparation and submission, and ongoing support throughout the funding process.</p>

<h4>2. CLIENT RESPONSIBILITIES</h4>
<p>Client agrees to provide accurate and complete information including personal identification, business documentation, financial records, and any other materials reasonably requested. Client authorizes the Company to access credit reports and related financial data necessary to perform the services.</p>

<h4>3. AUTHORIZATION</h4>
<p>Client hereby authorizes the Company to: (a) pull credit reports from all three major bureaus, (b) submit business funding applications on Client's behalf, (c) communicate with lenders and financial institutions regarding Client's applications, and (d) store and manage Client's personal and business information in the Company's secure CRM system.</p>

<h4>4. FEES & PAYMENT</h4>
<p>Fees for services will be disclosed separately and agreed upon prior to commencement of services. All fees are non-refundable once services have been rendered unless otherwise stated in writing.</p>

<h4>5. CONFIDENTIALITY</h4>
<p>The Company agrees to maintain the confidentiality of all Client information and will not disclose such information to any third party except as necessary to perform the agreed-upon services or as required by law.</p>

<h4>6. DISCLAIMER</h4>
<p>The Company does not guarantee approval for any specific funding amount or product. Results may vary based on Client's credit profile, business qualifications, and lender criteria.</p>

<h4>7. TERM AND TERMINATION</h4>
<p>This Agreement is effective upon execution and remains in effect until services are completed or either party provides written notice of termination. Termination does not relieve Client of payment obligations for services already rendered.</p>`;
