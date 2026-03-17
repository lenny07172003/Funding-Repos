"use client";

import { Client, CreditBureauData, Lender, ApplicationType } from "./types";

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
    agreementSignature: null,
    creditMonitoringStatus: "not_started",
    creditMonitoringProvider: "",
    creditMonitoringUsername: "",
    creditMonitoringPassword: "",
    onboardingEmailSentAt: null,
    onboardingCompletedSteps: {
      agreement: false,
      businessForm: false,
      creditMonitoring: false,
    },
    referralPartner: "",
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

// Lender storage
const LENDER_STORAGE = "funding_crm_lenders";

export function createEmptyLender(id?: string): Lender {
  return {
    id: id || crypto.randomUUID(),
    name: "",
    logo: "",
    description: "",
    website: "",
    apiKey: "",
    apiEndpoint: "",
    apiSecret: "",
    status: "disconnected",
    supportedProducts: [],
    minCreditScore: null,
    maxLoanAmount: null,
    minLoanAmount: null,
    interestRateRange: "",
    termRange: "",
    avgApprovalTime: "",
    totalFunded: 0,
    totalDeals: 0,
    approvalRate: null,
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    notes: "",
    connectedAt: null,
    lastSyncAt: null,
    webhookUrl: "",
    sandboxMode: true,
  };
}

export function getLenders(): Lender[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(LENDER_STORAGE);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLenders(lenders: Lender[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LENDER_STORAGE, JSON.stringify(lenders));
}

export function getLender(id: string): Lender | undefined {
  return getLenders().find((l) => l.id === id);
}

export function ensureLenderByName(name: string) {
  if (!name.trim()) return;
  const lenders = getLenders();
  const exists = lenders.some((l) => l.name.toLowerCase() === name.trim().toLowerCase());
  if (!exists) {
    const lender = createEmptyLender();
    lender.name = name.trim();
    lender.logo = name.trim().charAt(0).toUpperCase();
    lenders.push(lender);
    saveLenders(lenders);
  }
}

export function upsertLender(lender: Lender) {
  const lenders = getLenders();
  const idx = lenders.findIndex((l) => l.id === lender.id);
  if (idx >= 0) {
    lenders[idx] = lender;
  } else {
    lenders.push(lender);
  }
  saveLenders(lenders);
}

export function deleteLender(id: string) {
  saveLenders(getLenders().filter((l) => l.id !== id));
}

// Referral Partners storage
const REFERRAL_PARTNERS_STORAGE = "funding_crm_referral_partners";

export function getReferralPartners(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(REFERRAL_PARTNERS_STORAGE);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveReferralPartners(partners: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REFERRAL_PARTNERS_STORAGE, JSON.stringify(partners));
}
