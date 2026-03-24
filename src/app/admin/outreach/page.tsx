"use client";

import { useState, useEffect } from "react";
import {
  getBankerProspects,
  createBankerProspect,
  updateBankerProspect,
  getOutreachStats,
  getOutreachCampaigns,
  generateOutreachMessage,
  sendOutreachMessage,
  createOutreachCampaign,
  convertProspectToLender,
} from "@/lib/outreach-engine";

type Prospect = Awaited<ReturnType<typeof getBankerProspects>>[number];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  prospect: { bg: "bg-gray-100", text: "text-gray-700" },
  contacted: { bg: "bg-blue-100", text: "text-blue-700" },
  replied: { bg: "bg-purple-100", text: "text-purple-700" },
  meeting_scheduled: { bg: "bg-amber-100", text: "text-amber-700" },
  meeting_completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
  partner: { bg: "bg-emerald-600", text: "text-white" },
  declined: { bg: "bg-red-100", text: "text-red-700" },
};

const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  replied: "Replied",
  meeting_scheduled: "Meeting Set",
  meeting_completed: "Met",
  partner: "Partner",
  declined: "Declined",
};

export default function OutreachPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getOutreachStats>> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  // Add form state
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", linkedinUrl: "",
    bankName: "", branchLocation: "", title: "", department: "",
    specialties: "", notes: "",
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [p, s] = await Promise.all([
        getBankerProspects({ search: search || undefined, status: statusFilter !== "all" ? statusFilter : undefined }),
        getOutreachStats(),
      ]);
      setProspects(p);
      setStats(s);
    } catch {}
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.bankName) return;
    try {
      await createBankerProspect(form);
      setForm({ firstName: "", lastName: "", email: "", phone: "", linkedinUrl: "", bankName: "", branchLocation: "", title: "", department: "", specialties: "", notes: "" });
      setShowAddForm(false);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleGenerateAndSend(prospectId: string) {
    setGenerating(prospectId);
    try {
      // Get or create a default campaign
      let campaigns = await getOutreachCampaigns();
      let campaign = campaigns[0];
      if (!campaign) {
        campaign = await createOutreachCampaign({
          name: "Default Outreach",
          messageTemplate: "",
          tone: "professional",
        });
      }
      // Generate message
      const message = await generateOutreachMessage(prospectId, campaign.id, 1);
      // Send it
      await sendOutreachMessage(message.id);
      alert("Outreach message sent!");
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
    setGenerating(null);
  }

  async function handleConvertToLender(prospectId: string) {
    if (!confirm("Convert this banker to a lender in your marketplace?")) return;
    try {
      await convertProspectToLender(prospectId);
      alert("Banker added to your Lender Marketplace!");
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleStatusUpdate(id: string, status: string) {
    try {
      await updateBankerProspect(id, { status });
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banker Outreach Agent</h1>
          <p className="text-gray-500 mt-1">Source bankers, build relationships, expand your lending network</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
          + Add Banker Prospect
        </button>
      </div>

      {/* Pipeline Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(stats.pipeline).map(([status, count]) => {
            const colors = STATUS_COLORS[status] || STATUS_COLORS.prospect;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
                className={`rounded-lg border p-3 text-center transition-all ${
                  statusFilter === status ? "border-brand-500 ring-1 ring-brand-500" : "border-gray-200"
                }`}
              >
                <div className="text-2xl font-bold text-gray-900">{count}</div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                  {STATUS_LABELS[status]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Outreach Stats */}
      {stats && stats.totals.sent > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="stat-card"><p className="text-xs text-gray-500">Emails Sent</p><p className="text-xl font-bold text-gray-900">{stats.totals.sent}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Opened</p><p className="text-xl font-bold text-gray-900">{stats.totals.opened}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Replied</p><p className="text-xl font-bold text-emerald-600">{stats.totals.replied}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Meetings</p><p className="text-xl font-bold text-brand-600">{stats.totals.meetings}</p></div>
        </div>
      )}

      {/* Add Prospect Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Add Banker Prospect</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input className="input-field" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input-field" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label className="label">Bank Name *</label>
              <input className="input-field" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} required />
            </div>
            <div>
              <label className="label">Title</label>
              <input className="input-field" placeholder="VP Commercial Lending" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">LinkedIn URL</label>
              <input className="input-field" placeholder="https://linkedin.com/in/..." value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
            </div>
            <div>
              <label className="label">Branch Location</label>
              <input className="input-field" placeholder="City, State" value={form.branchLocation} onChange={(e) => setForm({ ...form, branchLocation: e.target.value })} />
            </div>
            <div>
              <label className="label">Specialties</label>
              <input className="input-field" placeholder="SBA preferred, startup-friendly..." value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary">Add Prospect</button>
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="card p-4">
        <input
          className="input-field"
          placeholder="Search by name, bank, or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
          onKeyDown={(e) => e.key === "Enter" && loadData()}
        />
      </div>

      {/* Prospect List */}
      <div className="space-y-3">
        {prospects.map((prospect) => {
          const colors = STATUS_COLORS[prospect.status] || STATUS_COLORS.prospect;
          const lastMessage = prospect.outreachMessages[0];

          return (
            <div key={prospect.id} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-sm font-bold text-brand-700 shrink-0">
                    {prospect.firstName.charAt(0)}{prospect.lastName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {prospect.firstName} {prospect.lastName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {prospect.title && `${prospect.title} — `}{prospect.bankName}
                      {prospect.branchLocation && ` (${prospect.branchLocation})`}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {prospect.email && <span className="text-xs text-gray-400">{prospect.email}</span>}
                      {prospect.linkedinUrl && (
                        <a href={prospect.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">LinkedIn</a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-13 sm:ml-0">
                  {/* Status */}
                  <select
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                    value={prospect.status}
                    onChange={(e) => handleStatusUpdate(prospect.id, e.target.value)}
                  >
                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>

                  {/* Actions */}
                  {prospect.email && prospect.status !== "partner" && (
                    <button
                      onClick={() => handleGenerateAndSend(prospect.id)}
                      disabled={generating === prospect.id}
                      className="text-xs px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
                    >
                      {generating === prospect.id ? "Sending..." : lastMessage ? "Follow Up" : "AI Outreach"}
                    </button>
                  )}

                  {(prospect.status === "meeting_completed" || prospect.status === "partner") && prospect.status !== "partner" && (
                    <button
                      onClick={() => handleConvertToLender(prospect.id)}
                      className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                    >
                      Add to Marketplace
                    </button>
                  )}
                </div>
              </div>

              {prospect.specialties && (
                <p className="text-xs text-gray-400 mt-2 ml-13">{prospect.specialties}</p>
              )}

              {lastMessage && (
                <div className="mt-2 ml-13 text-xs text-gray-400">
                  Last outreach: {lastMessage.sentAt ? new Date(lastMessage.sentAt).toLocaleDateString() : "pending"} — {lastMessage.status}
                </div>
              )}
            </div>
          );
        })}

        {prospects.length === 0 && (
          <div className="card p-12 text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="mb-2">No banker prospects yet</p>
            <p className="text-sm">Add your first banker prospect to start building your lending network.</p>
          </div>
        )}
      </div>
    </div>
  );
}
