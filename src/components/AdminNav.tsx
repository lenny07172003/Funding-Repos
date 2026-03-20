"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const navItems = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/clients", label: "All Clients" },
  { href: "/admin/lenders", label: "Lender Marketplace" },
  { href: "/admin/onboard", label: "Onboard New Client" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isClientDetail = pathname.startsWith("/admin/clients/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const user = session?.user as any;
  const role = user?.role;
  const isSuper = role === "SUPER_ADMIN";

  return (
    <nav className="bg-brand-900 border-b border-brand-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <span className="text-lg font-bold text-white">
                {user?.subAccountName || "Admin Dashboard"}
              </span>
            </div>
            <span className="sm:hidden text-lg font-bold text-white">Admin</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || (isClientDetail && item.href === "/admin/clients");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 lg:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-700 text-white"
                      : "text-brand-200 hover:text-white hover:bg-brand-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* User menu */}
            <div className="relative ml-2">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-brand-200 hover:text-white hover:bg-brand-800 transition-colors"
              >
                <div className="w-7 h-7 bg-brand-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
                  {user?.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <span className="hidden lg:inline">{user?.name || "User"}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium">
                      {isSuper ? "Super Admin" : "Admin"}
                    </span>
                  </div>
                  <div className="py-1">
                    {isSuper && (
                      <Link
                        href="/admin/agencies"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Whitelabel
                      </Link>
                    )}
                    <Link
                      href="/admin/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Settings
                    </Link>
                    <Link
                      href="/admin/settings/team"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Team Members
                    </Link>
                    {isSuper && (
                      <Link
                        href="/admin/settings/branding"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Branding
                      </Link>
                    )}
                  </div>
                  <div className="border-t border-gray-100 py-1">
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center gap-2">
            {/* Mobile user avatar */}
            <div className="w-7 h-7 bg-brand-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 rounded-lg text-brand-200 hover:text-white hover:bg-brand-800 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-brand-800 px-4 py-3 space-y-1">
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || (isClientDetail && item.href === "/admin/clients");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-700 text-white"
                    : "text-brand-200 hover:text-white hover:bg-brand-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="border-t border-brand-800 pt-3 mt-3 space-y-1">
            <div className="px-4 py-2">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs text-brand-300">{user?.email}</p>
            </div>
            {isSuper && (
              <Link href="/admin/agencies" onClick={() => setMobileOpen(false)} className="block px-4 py-2 text-sm text-brand-200 hover:text-white">
                Whitelabel
              </Link>
            )}
            <Link href="/admin/settings" onClick={() => setMobileOpen(false)} className="block px-4 py-2 text-sm text-brand-200 hover:text-white">
              Settings
            </Link>
            <Link href="/admin/settings/team" onClick={() => setMobileOpen(false)} className="block px-4 py-2 text-sm text-brand-200 hover:text-white">
              Team Members
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
