"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getUsers, createUser, deleteUser } from "@/lib/actions";

export default function TeamPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "ACCOUNT_ADMIN",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.email || !form.password || !form.name) return;
    setLoading(true);
    try {
      await createUser({
        ...form,
        subAccountId: user?.subAccountId || "",
      });
      setForm({ email: "", password: "", name: "", role: "ACCOUNT_ADMIN" });
      setShowCreate(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    }
    setLoading(false);
  }

  async function handleDelete(userId: string, userName: string) {
    if (!confirm(`Remove team member "${userName}"?`)) return;
    try {
      await deleteUser(userId);
      await loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const canCreateUsers = user?.role === "SUPER_ADMIN";
  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ACCOUNT_ADMIN: "Admin",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
          <p className="text-gray-500 mt-1">Manage admin users and their access</p>
        </div>
        {canCreateUsers && (
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
            + Add Team Member
          </button>
        )}
      </div>

      {showCreate && canCreateUsers && (
        <form onSubmit={handleCreate} className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Add New Team Member</h3>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Email *</label>
              <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Password *</label>
              <input className="input-field" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" />
              <p className="text-xs text-gray-400 mt-1">Min 8 chars, uppercase, lowercase, number</p>
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="ACCOUNT_ADMIN">Admin</option>
                {user?.role === "SUPER_ADMIN" && (
                  <option value="SUPER_ADMIN">Super Admin</option>
                )}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Creating..." : "Add Member"}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setError(""); }} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* User List */}
      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-sm font-bold text-brand-700">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-gray-900">{u.name}</div>
                <div className="text-sm text-gray-500">{u.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-13 sm:ml-0">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800">
                {roleLabels[u.role] || u.role}
              </span>
              {u.subAccount && (
                <span className="text-xs text-gray-400">{u.subAccount.name}</span>
              )}
              {u.lastLoginAt && (
                <span className="text-xs text-gray-400 hidden sm:inline">
                  Last login: {new Date(u.lastLoginAt).toLocaleDateString()}
                </span>
              )}
              {u.id !== user?.id && canCreateUsers && (
                <button onClick={() => handleDelete(u.id, u.name)} className="text-red-500 hover:text-red-700 text-sm">
                  Remove
                </button>
              )}
              {u.id === user?.id && (
                <span className="text-xs text-emerald-600 font-medium">You</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
