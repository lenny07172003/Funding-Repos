// Extend NextAuth types with our custom fields
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ACCOUNT_ADMIN";
  subAccountId: string | null;
  subAccountName: string | null;
}

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
}
