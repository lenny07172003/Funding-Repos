"use client";

import { useState, useEffect } from "react";

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  businessName: string;
  businessAge: string;
  naicsCode: string;
  sicCode: string;
  ein: string;
  businessAddress: string;
  businessPhone: string;
  annualRevenue: string;
  entityType: string;
  stateOfIncorporation: string;
}

const STORAGE_KEY = "funding_crm_client_profile";

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zip: "",
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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setProfile(JSON.parse(raw));
      } catch {}
    }
  }, []);

  function handleChange(field: keyof ProfileData, value: string) {
    setProfile((p) => ({ ...p, [field]: value }));
    setSaved(false);
  }

  function handleSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 mt-1">Update your personal and business information</p>
        </div>
        <button onClick={handleSave} className="btn-primary self-start sm:self-auto">
          {saved ? "Saved!" : "Save Changes"}
        </button>
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
          <div>
            <label className="label">First Name</label>
            <input className="input-field" value={profile.firstName} onChange={(e) => handleChange("firstName", e.target.value)} />
          </div>
          <div>
            <label className="label">Last Name</label>
            <input className="input-field" value={profile.lastName} onChange={(e) => handleChange("lastName", e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input-field" type="email" value={profile.email} onChange={(e) => handleChange("email", e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input-field" type="tel" value={profile.phone} onChange={(e) => handleChange("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input className="input-field" type="date" value={profile.dateOfBirth} onChange={(e) => handleChange("dateOfBirth", e.target.value)} />
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <label className="label">Address</label>
            <input className="input-field" value={profile.address} onChange={(e) => handleChange("address", e.target.value)} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input-field" value={profile.city} onChange={(e) => handleChange("city", e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input-field" value={profile.state} onChange={(e) => handleChange("state", e.target.value)} />
          </div>
          <div>
            <label className="label">ZIP Code</label>
            <input className="input-field" value={profile.zip} onChange={(e) => handleChange("zip", e.target.value)} />
          </div>
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
          <div>
            <label className="label">Business Name</label>
            <input className="input-field" value={profile.businessName} onChange={(e) => handleChange("businessName", e.target.value)} />
          </div>
          <div>
            <label className="label">Business Age</label>
            <input className="input-field" placeholder="e.g. 2 years" value={profile.businessAge} onChange={(e) => handleChange("businessAge", e.target.value)} />
          </div>
          <div>
            <label className="label">EIN</label>
            <input className="input-field" value={profile.ein} onChange={(e) => handleChange("ein", e.target.value)} />
          </div>
          <div>
            <label className="label">NAICS Code</label>
            <input className="input-field" value={profile.naicsCode} onChange={(e) => handleChange("naicsCode", e.target.value)} />
          </div>
          <div>
            <label className="label">SIC Code</label>
            <input className="input-field" value={profile.sicCode} onChange={(e) => handleChange("sicCode", e.target.value)} />
          </div>
          <div>
            <label className="label">Entity Type</label>
            <select className="input-field" value={profile.entityType} onChange={(e) => handleChange("entityType", e.target.value)}>
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
            <input className="input-field" value={profile.stateOfIncorporation} onChange={(e) => handleChange("stateOfIncorporation", e.target.value)} />
          </div>
          <div>
            <label className="label">Annual Revenue</label>
            <input className="input-field" placeholder="e.g. $150,000" value={profile.annualRevenue} onChange={(e) => handleChange("annualRevenue", e.target.value)} />
          </div>
          <div>
            <label className="label">Business Phone</label>
            <input className="input-field" type="tel" value={profile.businessPhone} onChange={(e) => handleChange("businessPhone", e.target.value)} />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className="label">Business Address</label>
            <input className="input-field" value={profile.businessAddress} onChange={(e) => handleChange("businessAddress", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
