export interface CreditBureauData {
  score: number | null;
  accounts: number | null;
  creditAge: string;
  derogatoryAccounts: number | null;
  highestCreditLimit: number | null;
  inquiries: number | null;
}

export interface CreditProfile {
  experian: CreditBureauData;
  equifax: CreditBureauData;
  transUnion: CreditBureauData;
  apiKeyConfigured: boolean;
  lastPulled: string | null;
}

export interface BusinessInfo {
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

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ssn: string;
  dateOfBirth: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface FundingApplication {
  id: string;
  type: "credit_card" | "line_of_credit" | "term_loan" | "alternative_lending";
  lender: string;
  product: string;
  amount: number | null;
  status: "pending" | "applied" | "approved" | "funded" | "denied";
  appliedDate: string;
  approvedDate: string | null;
  fundedDate: string | null;
  notes: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  status: "pending" | "reviewed" | "approved" | "rejected";
}

export interface Client {
  id: string;
  personalInfo: PersonalInfo;
  businessInfo: BusinessInfo;
  creditProfile: CreditProfile;
  fundingApplications: FundingApplication[];
  documents: Document[];
  onboardingStatus: "not_started" | "agreement_sent" | "agreement_signed" | "active";
  onboardedAt: string | null;
  totalFunded: number;
  totalApproved: number;
  notes: string;
}

export type ApplicationType = FundingApplication["type"];
export type ApplicationStatus = FundingApplication["status"];
