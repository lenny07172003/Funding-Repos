import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

// Rate limiting store (in-memory, per-process)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record) return true;
  if (now - record.lastAttempt > WINDOW_MS) {
    loginAttempts.delete(email);
    return true;
  }
  return record.count < MAX_ATTEMPTS;
}

function recordAttempt(email: string) {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record || now - record.lastAttempt > WINDOW_MS) {
    loginAttempts.set(email, { count: 1, lastAttempt: now });
  } else {
    record.count++;
    record.lastAttempt = now;
  }
}

function clearAttempts(email: string) {
  loginAttempts.delete(email);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        // Rate limit check
        if (!checkRateLimit(email)) {
          throw new Error("Too many login attempts. Please try again in 15 minutes.");
        }

        recordAttempt(email);

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            agency: true,
            subAccount: true,
          },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        // Clear rate limit on success
        clearAttempts(email);

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          agencyId: user.agencyId,
          subAccountId: user.subAccountId,
          clientId: user.clientId || null,
          agencyName: user.agency?.name || null,
          subAccountName: user.subAccount?.name || null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.agencyId = (user as any).agencyId;
        token.subAccountId = (user as any).subAccountId;
        token.clientId = (user as any).clientId;
        token.agencyName = (user as any).agencyName;
        token.subAccountName = (user as any).subAccountName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).agencyId = token.agencyId as string | null;
        (session.user as any).subAccountId = token.subAccountId as string | null;
        (session.user as any).clientId = token.clientId as string | null;
        (session.user as any).agencyName = token.agencyName as string | null;
        (session.user as any).subAccountName = token.subAccountName as string | null;
      }
      return session;
    },
  },
});
