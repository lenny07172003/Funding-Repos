"use server";

import { prisma } from "./db";
import { encrypt } from "./crypto";
import { headers } from "next/headers";

// Simple in-memory rate limiter for onboarding actions
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_ONBOARDING_ACTIONS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkOnboardingRateLimit(clientId: string) {
  const now = Date.now();
  const record = rateLimits.get(clientId);
  if (!record || now > record.resetAt) {
    rateLimits.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (record.count >= MAX_ONBOARDING_ACTIONS) {
    throw new Error("Too many requests. Please try again later.");
  }
  record.count++;
}

/**
 * Public onboarding actions — no auth required.
 * These are called by clients completing their onboarding form.
 * All operations are scoped by client ID and only update onboarding-related fields.
 */

export async function getClientForOnboarding(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      ssn: true,
      dateOfBirth: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      businessName: true,
      businessAge: true,
      naicsCode: true,
      sicCode: true,
      ein: true,
      businessAddress: true,
      businessPhone: true,
      annualRevenue: true,
      entityType: true,
      stateOfIncorporation: true,
      onboardingStatus: true,
      onboardingCompletedSteps: true,
      creditMonitoringStatus: true,
      creditMonitoringProvider: true,
      creditMonitoringUsername: true,
    },
  });
  return client;
}

export async function submitAgreement(
  clientId: string,
  data: {
    fullName: string;
    signatureData: string;
    dateSigned: string;
  }
) {
  if (!clientId || !data.fullName?.trim() || !data.signatureData || !data.dateSigned) {
    throw new Error("Missing required fields");
  }
  checkOnboardingRateLimit(clientId);
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found");

  const currentSteps = parseSteps(client.onboardingCompletedSteps);
  const signature = JSON.stringify({
    fullName: data.fullName,
    signatureData: data.signatureData,
    dateSigned: data.dateSigned,
    ipAddress: "client-web",
  });

  await prisma.client.update({
    where: { id: clientId },
    data: {
      agreementSignature: signature,
      onboardingStatus: "agreement_signed",
      onboardingCompletedSteps: JSON.stringify({ ...currentSteps, agreement: true }),
    },
  });
}

export async function submitBusinessForm(
  clientId: string,
  personal: {
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
  },
  business: {
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
) {
  if (!clientId || !personal.firstName?.trim() || !personal.lastName?.trim() || !personal.email?.trim()) {
    throw new Error("First name, last name, and email are required");
  }
  checkOnboardingRateLimit(clientId);
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found");

  const currentSteps = parseSteps(client.onboardingCompletedSteps);

  await prisma.client.update({
    where: { id: clientId },
    data: {
      ...personal,
      ...business,
      ssn: personal.ssn ? encrypt(personal.ssn) : "",
      onboardingCompletedSteps: JSON.stringify({ ...currentSteps, businessForm: true }),
    },
  });
}

export async function submitCreditMonitoring(
  clientId: string,
  data: {
    provider: string;
    username: string;
    password: string;
  }
) {
  if (!clientId || !data.provider?.trim()) {
    throw new Error("Provider is required");
  }
  checkOnboardingRateLimit(clientId);
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found");

  const currentSteps = parseSteps(client.onboardingCompletedSteps);

  await prisma.client.update({
    where: { id: clientId },
    data: {
      creditMonitoringProvider: data.provider,
      creditMonitoringUsername: data.username,
      creditMonitoringPassword: data.password ? encrypt(data.password) : "",
      creditMonitoringStatus: "active",
      onboardingCompletedSteps: JSON.stringify({ ...currentSteps, creditMonitoring: true }),
      onboardingStatus: "active",
      onboardedAt: new Date().toISOString(),
    },
  });
}

function parseSteps(raw: string) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { agreement: false, businessForm: false, creditMonitoring: false };
  }
}
