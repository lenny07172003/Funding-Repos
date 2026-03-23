"use client";

import { useState, useEffect } from "react";
import { getCurrentUser } from "./actions";
import { useSession } from "next-auth/react";

interface BrandData {
  brandName: string;
  brandLogo: string;
  primaryColor: string;
  brandFavicon: string;
  loaded: boolean;
}

const defaultBrand: BrandData = {
  brandName: "",
  brandLogo: "",
  primaryColor: "#3b82f6",
  brandFavicon: "",
  loaded: false,
};

// Module-level cache so all components share the same branding data
let cachedBrand: BrandData = { ...defaultBrand };
let loadPromise: Promise<void> | null = null;

export function useBranding(): BrandData {
  const { data: session } = useSession();
  const [brand, setBrand] = useState<BrandData>(cachedBrand);

  useEffect(() => {
    if (cachedBrand.loaded) {
      setBrand(cachedBrand);
      return;
    }

    if (!session?.user) return;

    if (!loadPromise) {
      loadPromise = getCurrentUser().then((user) => {
        if (user?.branding) {
          cachedBrand = {
            brandName: user.branding.brandName || "",
            brandLogo: user.branding.brandLogo || "",
            primaryColor: user.branding.primaryColor || "#3b82f6",
            brandFavicon: user.branding.brandFavicon || "",
            loaded: true,
          };
        } else {
          cachedBrand = { ...defaultBrand, loaded: true };
        }
      }).catch(() => {
        cachedBrand = { ...defaultBrand, loaded: true };
      });
    }

    loadPromise.then(() => setBrand(cachedBrand));
  }, [session]);

  return brand;
}

/** Reset cache (call when user logs out or switches account) */
export function resetBrandingCache() {
  cachedBrand = { ...defaultBrand };
  loadPromise = null;
}
