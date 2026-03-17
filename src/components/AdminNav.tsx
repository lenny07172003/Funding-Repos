"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/clients", label: "All Clients" },
  { href: "/admin/lenders", label: "Lender Marketplace" },
  { href: "/admin/onboard", label: "Onboard New Client" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const isClientDetail = pathname.startsWith("/admin/clients/");
  const [mobileOpen, setMobileOpen] = useState(false);

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
            <span className="text-lg font-bold text-white">Admin Dashboard</span>
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-700 text-white"
                      : "text-brand-200 hover:text-white hover:bg-brand-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-brand-200 hover:text-white hover:bg-brand-800 transition-colors"
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
        </div>
      )}
    </nav>
  );
}
