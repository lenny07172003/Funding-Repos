import type { NextAuthConfig } from "next-auth";

// Lightweight auth config safe for Edge Runtime (no bcrypt, no Prisma)
// Used by middleware for session checks only
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  providers: [], // Providers added in auth.ts (they need Node.js APIs)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.subAccountId = (user as any).subAccountId;
        token.subAccountName = (user as any).subAccountName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).subAccountId = token.subAccountId as string | null;
        (session.user as any).subAccountName = token.subAccountName as string | null;
      }
      return session;
    },
  },
};
