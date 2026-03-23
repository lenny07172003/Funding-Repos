"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getCurrentUser } from "@/lib/actions";

interface BrandData {
  brandName: string;
  brandLogo: string;
  primaryColor: string;
  brandFavicon: string;
}

/**
 * BrandProvider loads the current user's agency branding and applies it
 * as CSS custom properties. This makes all brand-* Tailwind classes
 * dynamically reflect the agency's chosen color.
 *
 * It also provides the brand name and logo to child components via
 * a data attribute on the wrapper div.
 */
export default function BrandProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [brand, setBrand] = useState<BrandData | null>(null);

  useEffect(() => {
    async function loadBrand() {
      try {
        const user = await getCurrentUser();
        if (user?.branding) {
          setBrand({
            brandName: user.branding.brandName || "",
            brandLogo: user.branding.brandLogo || "",
            primaryColor: user.branding.primaryColor || "#3b82f6",
            brandFavicon: user.branding.brandFavicon || "",
          });
        }
      } catch {}
    }
    if (session?.user) loadBrand();
  }, [session]);

  useEffect(() => {
    if (!brand?.primaryColor || brand.primaryColor === "#3b82f6") return;

    // Generate a color palette from the primary color
    const hex = brand.primaryColor;
    const shades = generateShades(hex);

    const root = document.documentElement;
    root.style.setProperty("--brand-50", shades[50]);
    root.style.setProperty("--brand-100", shades[100]);
    root.style.setProperty("--brand-200", shades[200]);
    root.style.setProperty("--brand-300", shades[300]);
    root.style.setProperty("--brand-400", shades[400]);
    root.style.setProperty("--brand-500", shades[500]);
    root.style.setProperty("--brand-600", shades[600]);
    root.style.setProperty("--brand-700", shades[700]);
    root.style.setProperty("--brand-800", shades[800]);
    root.style.setProperty("--brand-900", shades[900]);
    root.style.setProperty("--brand-950", shades[950]);

    // Update favicon if set
    if (brand.brandFavicon) {
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement
        || document.createElement("link");
      link.rel = "icon";
      link.href = brand.brandFavicon;
      if (!link.parentElement) document.head.appendChild(link);
    }

    return () => {
      // Cleanup — restore defaults
      const props = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
      props.forEach((shade) => root.style.removeProperty(`--brand-${shade}`));
    };
  }, [brand]);

  return (
    <div
      data-brand-name={brand?.brandName || ""}
      data-brand-logo={brand?.brandLogo || ""}
    >
      {children}
    </div>
  );
}

/**
 * Generate a shade palette from a single hex color.
 * The input color becomes the 600 shade, and we lighten/darken from there.
 */
function generateShades(hex: string): Record<number, string> {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  function mix(color: number, white: number, factor: number): number {
    return Math.round(color + (white - color) * factor);
  }

  function lighten(factor: number): string {
    return `rgb(${mix(r, 255, factor)}, ${mix(g, 255, factor)}, ${mix(b, 255, factor)})`;
  }

  function darken(factor: number): string {
    return `rgb(${mix(r, 0, factor)}, ${mix(g, 0, factor)}, ${mix(b, 0, factor)})`;
  }

  return {
    50: lighten(0.92),
    100: lighten(0.84),
    200: lighten(0.72),
    300: lighten(0.56),
    400: lighten(0.36),
    500: lighten(0.12),
    600: `rgb(${r}, ${g}, ${b})`,
    700: darken(0.15),
    800: darken(0.3),
    900: darken(0.45),
    950: darken(0.6),
  };
}
