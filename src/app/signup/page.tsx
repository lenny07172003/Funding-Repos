"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { signupAgency } from "@/lib/platform-actions";
import { PLANS } from "@/lib/plans";
import Link from "next/link";

type Step = "plans" | "register" | "success";

const planOrder = ["tier_1", "tier_2", "tier_3"] as const;

const planHighlights: Record<string, { tag: string; popular: boolean }> = {
  tier_1: { tag: "", popular: false },
  tier_2: { tag: "Most Popular", popular: true },
  tier_3: { tag: "Best Value", popular: false },
};

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("plans");
  const [selectedPlan, setSelectedPlan] = useState<string>("tier_2");
  const [form, setForm] = useState({ agencyName: "", ownerName: "", ownerEmail: "", ownerPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.ownerPassword !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.ownerPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await signupAgency({
        agencyName: form.agencyName,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        ownerPassword: form.ownerPassword,
        plan: selectedPlan,
      });
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  async function handleLogin() {
    setLoading(true);
    await signIn("credentials", {
      email: form.ownerEmail,
      password: form.ownerPassword,
      redirect: false,
    });
    router.push("/admin");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/80 via-gray-950 to-gray-950" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
          <nav className="flex items-center justify-between mb-16 sm:mb-24">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xl font-bold">Funding CRM</span>
            </Link>
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
              Already have an account? <span className="font-semibold text-white underline">Sign in</span>
            </Link>
          </nav>

          {step === "plans" && (
            <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium mb-6">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                14-day free trial on all plans
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6 bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
                Scale Your Funding Business
              </h1>
              <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                AI-powered credit analysis. Automated stacking blueprints. White-label CRM.
                Everything you need to fund more clients, faster.
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {/* Step 1: Plan Selection */}
        {step === "plans" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-12">
              {planOrder.map((planId) => {
                const plan = PLANS[planId];
                const highlight = planHighlights[planId];
                const isSelected = selectedPlan === planId;

                return (
                  <div
                    key={planId}
                    onClick={() => setSelectedPlan(planId)}
                    className={`relative rounded-2xl cursor-pointer transition-all duration-300 ${
                      isSelected
                        ? "bg-gray-800/80 border-2 border-brand-500 shadow-lg shadow-brand-500/10 scale-[1.02]"
                        : "bg-gray-900/50 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/40"
                    }`}
                  >
                    {highlight.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="px-4 py-1 bg-brand-600 text-white text-xs font-bold rounded-full uppercase tracking-wider">
                          {highlight.tag}
                        </span>
                      </div>
                    )}
                    {highlight.tag && !highlight.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="px-4 py-1 bg-gray-700 text-gray-200 text-xs font-bold rounded-full uppercase tracking-wider">
                          {highlight.tag}
                        </span>
                      </div>
                    )}

                    <div className="p-6 sm:p-8">
                      {/* Plan Header */}
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl sm:text-5xl font-bold text-white">${Math.floor(plan.price)}</span>
                          <span className="text-gray-400 text-lg">
                            .{String(Math.round((plan.price % 1) * 100)).padStart(2, "0")}
                          </span>
                          <span className="text-gray-500 text-sm">/month</span>
                        </div>
                      </div>

                      {/* Selection indicator */}
                      <div className={`w-full py-3 rounded-xl text-sm font-semibold text-center mb-6 transition-colors ${
                        isSelected
                          ? "bg-brand-600 text-white"
                          : "bg-gray-800 text-gray-400"
                      }`}>
                        {isSelected ? "Selected" : "Select Plan"}
                      </div>

                      {/* Features */}
                      <ul className="space-y-3">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <svg className={`w-5 h-5 shrink-0 mt-0.5 ${isSelected ? "text-brand-400" : "text-gray-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-sm text-gray-300">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CTA Button */}
            <div className="text-center">
              <button
                onClick={() => setStep("register")}
                className="inline-flex items-center gap-3 px-10 py-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-lg transition-all shadow-lg shadow-brand-600/25 hover:shadow-brand-500/30 hover:scale-[1.02]"
              >
                Start Your Free Trial
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
              <p className="text-sm text-gray-500 mt-4">No credit card required. 14-day free trial.</p>
            </div>

            {/* Feature Grid */}
            <div className="mt-24 sm:mt-32">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Everything You Need to Fund Clients</h2>
              <p className="text-gray-400 text-center mb-12 sm:mb-16 max-w-2xl mx-auto">
                Built for credit repair specialists, funding consultants, and agencies who want to scale.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", title: "AI Credit Stacking", desc: "Analyze credit reports and generate bureau-specific stacking blueprints with real card data and sweet numbers." },
                  { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", title: "Revenue-Based Lending", desc: "Match clients to MCAs, term loans, SBA, equipment financing, and more based on their business revenue." },
                  { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", title: "Client Portal", desc: "Branded portal where your clients track their credit, documents, and funding status in real time." },
                  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: "White-Label Branding", desc: "Your logo, your colors, your brand. Clients never see our name — it's 100% your business." },
                  { icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", title: "Lender Marketplace", desc: "Build and manage your lender network with API connections, deal tracking, and performance metrics." },
                  { icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", title: "Bank-Level Security", desc: "AES-256 encryption for sensitive data, role-based access, rate limiting, and audit logging." },
                ].map((feature) => (
                  <div key={feature.title} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
                    <div className="w-10 h-10 bg-brand-500/10 rounded-lg flex items-center justify-center mb-4">
                      <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feature.icon} />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Step 2: Registration Form */}
        {step === "register" && (
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setStep("plans")}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to plans
            </button>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 sm:p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Create Your Account</h2>
                <p className="text-gray-400">
                  {PLANS[selectedPlan as keyof typeof PLANS].name} plan — ${PLANS[selectedPlan as keyof typeof PLANS].price}/mo
                </p>
                <p className="text-sm text-brand-400 mt-1">14-day free trial, cancel anytime</p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Company / Agency Name</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
                    placeholder="Your funding company name"
                    value={form.agencyName}
                    onChange={(e) => setForm({ ...form, agencyName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Your Full Name</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
                    placeholder="John Smith"
                    value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
                    placeholder="you@company.com"
                    value={form.ownerEmail}
                    onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
                    placeholder="Min 8 characters"
                    value={form.ownerPassword}
                    onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
                    placeholder="Re-enter password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating your account...
                    </>
                  ) : (
                    "Start Free Trial"
                  )}
                </button>

                <p className="text-xs text-gray-500 text-center">
                  By creating an account, you agree to our Terms of Service and Privacy Policy.
                </p>
              </form>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === "success" && (
          <div className="max-w-lg mx-auto text-center">
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 sm:p-12">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold mb-3">You&apos;re All Set!</h2>
              <p className="text-gray-400 mb-2">
                Your 14-day free trial has started.
              </p>
              <p className="text-gray-400 mb-8">
                <strong className="text-white">{form.agencyName}</strong> is ready to go.
              </p>

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? "Signing in..." : "Go to Your Dashboard"}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>

              <div className="mt-8 pt-6 border-t border-gray-800">
                <h3 className="font-semibold text-white mb-3">What&apos;s next?</h3>
                <div className="space-y-3 text-left">
                  {[
                    "Set up your branding (logo, colors) in Settings",
                    "Onboard your first client",
                    "Run your first AI credit analysis",
                    "Invite your team members",
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-brand-500/20 rounded-full flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">
                        {i + 1}
                      </div>
                      <span className="text-sm text-gray-300">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
