/** Validate required environment variables at build/startup time */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: getRequiredEnv("DATABASE_URL"),
  NEXTAUTH_SECRET: getRequiredEnv("NEXTAUTH_SECRET"),
  NEXTAUTH_URL: getRequiredEnv("NEXTAUTH_URL"),
  ENCRYPTION_KEY: getRequiredEnv("ENCRYPTION_KEY"),
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "Funding CRM <onboarding@resend.dev>",
};
