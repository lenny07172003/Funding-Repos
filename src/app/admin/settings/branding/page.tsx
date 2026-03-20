"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { updateSubAccountBranding, getSubAccountForUser } from "@/lib/actions";

function BrandingPageInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const user = session?.user as any;
  const accountIdParam = searchParams.get("accountId");
  const subAccountId = accountIdParam || user?.subAccountId;

  const [branding, setBranding] = useState({
    brandName: "",
    brandLogo: "",
    brandFavicon: "",
    primaryColor: "#3b82f6",
    customDomain: "",
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBranding();
  }, [subAccountId]);

  async function loadBranding() {
    try {
      const account = await getSubAccountForUser();
      if (account) {
        setBranding({
          brandName: account.brandName || "",
          brandLogo: account.brandLogo || "",
          brandFavicon: account.brandFavicon || "",
          primaryColor: account.primaryColor || "#3b82f6",
          customDomain: account.customDomain || "",
        });
      }
    } catch {}
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!subAccountId) return;
    setLoading(true);
    try {
      await updateSubAccountBranding(subAccountId, branding);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  }

  if (!subAccountId) {
    return (
      <div className="card p-12 text-center text-gray-400">
        <p>No account context. Contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">White-Label Branding</h1>
          <p className="text-gray-500 mt-1">Customize the look and feel for your account</p>
        </div>
        {saved && <span className="text-emerald-600 font-medium text-sm">Saved!</span>}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Brand Identity */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Brand Name</label>
              <input
                className="input-field"
                placeholder="Your Company Name"
                value={branding.brandName}
                onChange={(e) => setBranding({ ...branding, brandName: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">Shown in the navbar and page titles</p>
            </div>
            <div>
              <label className="label">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                />
                <input
                  className="input-field flex-1"
                  placeholder="#3b82f6"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Logo URL</label>
              <input
                className="input-field"
                placeholder="https://yoursite.com/logo.png"
                value={branding.brandLogo}
                onChange={(e) => setBranding({ ...branding, brandLogo: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">Direct URL to your logo image (PNG, SVG preferred)</p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Favicon URL</label>
              <input
                className="input-field"
                placeholder="https://yoursite.com/favicon.ico"
                value={branding.brandFavicon}
                onChange={(e) => setBranding({ ...branding, brandFavicon: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Custom Domain */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Domain</h2>
          <div>
            <label className="label">Domain</label>
            <input
              className="input-field"
              placeholder="app.yourcompany.com"
              value={branding.customDomain}
              onChange={(e) => setBranding({ ...branding, customDomain: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">
              Point your domain&apos;s DNS to this platform. Your clients will access the portal through your domain.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <div className="h-14 flex items-center px-4 gap-3" style={{ backgroundColor: branding.primaryColor }}>
              {branding.brandLogo ? (
                <img src={branding.brandLogo} alt="Logo" className="h-8 w-8 rounded object-contain bg-white" />
              ) : (
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-sm font-bold" style={{ color: branding.primaryColor }}>
                  {branding.brandName?.charAt(0)?.toUpperCase() || "F"}
                </div>
              )}
              <span className="text-white font-bold">{branding.brandName || "Your Brand"}</span>
            </div>
            <div className="p-4 bg-gray-50 text-sm text-gray-500">
              This is how your navigation bar will look to your team and clients.
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Saving..." : "Save Branding"}
        </button>
      </form>
    </div>
  );
}

export default function BrandingPage() {
  return (
    <Suspense>
      <BrandingPageInner />
    </Suspense>
  );
}
