/** Plan configuration — shared between client and server */
export const PLANS = {
  tier_1: {
    id: "tier_1",
    name: "Starter",
    price: 97.95,
    maxSubAccounts: 3,
    maxClients: 500,
    maxUsers: -1,
    canResellSubAccounts: false,
    features: ["Up to 3 sub-accounts", "500 clients", "White-label branding", "AI analysis (per-use credits)", "Unlimited team members"],
  },
  tier_2: {
    id: "tier_2",
    name: "Professional",
    price: 297,
    maxSubAccounts: -1,
    maxClients: 750,
    maxUsers: -1,
    canResellSubAccounts: true,
    features: ["Unlimited sub-accounts", "750 clients", "White-label branding", "AI analysis (per-use credits)", "Unlimited team members", "Resell sub-accounts"],
  },
  tier_3: {
    id: "tier_3",
    name: "Enterprise",
    price: 457,
    maxSubAccounts: -1,
    maxClients: -1,
    maxUsers: -1,
    canResellSubAccounts: true,
    features: ["Unlimited sub-accounts", "Unlimited clients", "White-label branding", "AI analysis (per-use credits)", "Unlimited team members", "Resell sub-accounts", "Priority support"],
  },
} as const;
