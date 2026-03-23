"use client";

import { useState, useEffect } from "react";
import { getMyProfile } from "@/lib/client-portal-actions";
import LoadingSpinner from "@/components/LoadingSpinner";

type ProfileData = Awaited<ReturnType<typeof getMyProfile>>;

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getMyProfile();
        setProfile(data);
      } catch {
        // Profile load failed — will show error state
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner message="Loading profile..." />;
  if (!profile) return <div className="p-8 text-center text-gray-400">Unable to load profile.</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">Your personal and business information</p>
      </div>

      {/* Personal Information */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-brand-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Personal Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="First Name" value={profile.firstName} />
          <Field label="Last Name" value={profile.lastName} />
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone} />
          <Field label="Date of Birth" value={profile.dateOfBirth} />
          <Field label="Address" value={profile.address} />
          <Field label="City" value={profile.city} />
          <Field label="State" value={profile.state} />
          <Field label="ZIP Code" value={profile.zip} />
        </div>
      </div>

      {/* Business Information */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-brand-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Business Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Business Name" value={profile.businessName} />
          <Field label="Business Age" value={profile.businessAge} />
          <Field label="EIN" value={profile.ein} />
          <Field label="Entity Type" value={profile.entityType} />
          <Field label="Annual Revenue" value={profile.annualRevenue} />
        </div>
      </div>

      <div className="card p-4 bg-brand-50 border-brand-200">
        <p className="text-sm text-brand-700">
          <strong>Need to update your information?</strong> Contact your funding representative to make changes to your profile.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
      <p className="mt-1 text-gray-900 font-medium">{value || "—"}</p>
    </div>
  );
}
