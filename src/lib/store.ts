"use client";

import { Client, CreditBureauData } from "./types";

const STORAGE_KEY = "funding_crm_data";

const emptyBureau: CreditBureauData = {
  score: null,
  accounts: null,
  creditAge: "",
  derogatoryAccounts: null,
  highestCreditLimit: null,
  inquiries: null,
};

export function createEmptyClient(id?: string): Client {
  return {
    id: id || crypto.randomUUID(),
    personalInfo: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      ssn: "",
      dateOfBirth: "",
      address: "",
      city: "",
      state: "",
      zip: "",
    },
    businessInfo: {
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
    },
    creditProfile: {
      experian: { ...emptyBureau },
      equifax: { ...emptyBureau },
      transUnion: { ...emptyBureau },
      apiKeyConfigured: false,
      lastPulled: null,
    },
    fundingApplications: [],
    documents: [],
    onboardingStatus: "not_started",
    onboardedAt: null,
    totalFunded: 0,
    totalApproved: 0,
    notes: "",
  };
}

export function getClients(): Client[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveClients(clients: Client[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

export function getClient(id: string): Client | undefined {
  return getClients().find((c) => c.id === id);
}

export function upsertClient(client: Client) {
  const clients = getClients();
  const idx = clients.findIndex((c) => c.id === client.id);
  if (idx >= 0) {
    clients[idx] = client;
  } else {
    clients.push(client);
  }
  saveClients(clients);
}

export function deleteClient(id: string) {
  saveClients(getClients().filter((c) => c.id !== id));
}

// API Key storage
const API_KEY_STORAGE = "funding_crm_api_key";
const API_PROVIDER_STORAGE = "funding_crm_api_provider";

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

export function setApiKey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function getApiProvider(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(API_PROVIDER_STORAGE) || "";
}

export function setApiProvider(provider: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(API_PROVIDER_STORAGE, provider);
}
