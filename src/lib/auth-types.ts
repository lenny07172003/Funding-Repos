// Extend NextAuth types with our custom fields
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "AGENCY_ADMIN" | "ACCOUNT_ADMIN";
  agencyId: string | null;
  subAccountId: string | null;
  agencyName: string | null;
  subAccountName: string | null;
}

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
}
