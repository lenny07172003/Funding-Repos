"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { getAgreementForSigning, submitAgreementSignature } from "@/lib/agreement-actions";

export default function SignAgreementPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [agreement, setAgreement] = useState<Awaited<ReturnType<typeof getAgreementForSigning>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"review" | "sign" | "done">("review");

  // Signature fields
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [dateSigned, setDateSigned] = useState(new Date().toISOString().split("T")[0]);
  const [hasRead, setHasRead] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Canvas signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAgreementForSigning(clientId);
        setAgreement(data);
        setFullName(data.clientName);
        setBusinessName(data.businessName);
        if (data.alreadySigned) setStep("done");
      } catch {
        setAgreement(null);
      }
      setLoading(false);
    }
    load();
  }, [clientId]);

  useEffect(() => {
    if (step !== "sign" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1a365d";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [step]);

  function getCoords(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDraw() { setIsDrawing(false); }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSubmit() {
    if (!fullName.trim() || !hasSignature || !hasRead) return;
    setSubmitting(true);
    try {
      await submitAgreementSignature(clientId, {
        fullName: fullName.trim(),
        businessName: businessName.trim(),
        signatureData: canvasRef.current?.toDataURL("image/png") || "",
        dateSigned,
      });
      setStep("done");
    } catch (err: any) {
      alert(err.message || "Failed to submit signature");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-8 h-8 text-brand-600 animate-spin mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-500">Loading agreement...</p>
        </div>
      </div>
    );
  }

  if (!agreement || !agreement.agreementContent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Agreement Not Found</h1>
          <p className="text-gray-500">This agreement link may be expired or invalid.</p>
        </div>
      </div>
    );
  }

  // Already signed
  if (step === "done") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Agreement Signed</h1>
          <p className="text-gray-500 mb-1">
            Thank you, <strong>{agreement.clientName || fullName}</strong>.
          </p>
          <p className="text-gray-500">
            Your agreement with <strong>{agreement.companyName}</strong> has been signed and recorded.
          </p>
          {agreement.signedAt && (
            <p className="text-xs text-gray-400 mt-4">
              Signed on {new Date(agreement.signedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{agreement.companyName}</h1>
            <p className="text-sm text-gray-500">{agreement.agreementTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              step === "review" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
            }`}>
              Step {step === "review" ? "1" : "2"} of 2: {step === "review" ? "Review" : "Sign"}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Step 1: Review */}
        {step === "review" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 text-center mb-6">{agreement.agreementTitle}</h2>
              <div
                className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: agreement.agreementContent }}
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={hasRead}
                  onChange={(e) => setHasRead(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">
                  I, <strong>{agreement.clientName}</strong>, have carefully read and understand the terms of this
                  {" "}<strong>{agreement.agreementTitle}</strong> with <strong>{agreement.companyName}</strong>.
                </span>
              </label>
            </div>

            <button
              onClick={() => setStep("sign")}
              disabled={!hasRead}
              className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Proceed to Sign
            </button>
          </div>
        )}

        {/* Step 2: Sign */}
        {step === "sign" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Sign Agreement</h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Legal Name *</label>
                  <input
                    className="input-field"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full legal name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name *</label>
                  <input
                    className="input-field"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Enter your business name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Date *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={dateSigned}
                    onChange={(e) => setDateSigned(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Signature *</label>
                    <button
                      onClick={clearSignature}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={150}
                      className="w-full cursor-crosshair touch-none"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Draw your signature above using your mouse or finger</p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              <strong>By signing below, I confirm:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>I have read and agree to the {agreement.agreementTitle}</li>
                <li>My full legal name is <strong>{fullName || "___"}</strong></li>
                <li>I represent <strong>{businessName || "___"}</strong></li>
                <li>Today&apos;s date is <strong>{dateSigned}</strong></li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("review")}
                className="btn-secondary flex-1"
              >
                Back to Review
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !fullName.trim() || !hasSignature}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  "Sign Agreement"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
