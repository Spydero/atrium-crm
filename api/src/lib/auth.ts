import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";

function origins(): string[] {
  const list = [
    process.env.CLIENT_ORIGIN || "http://localhost:3000",
    process.env.ADMIN_ORIGIN || "http://localhost:3001",
  ];
  return [...new Set(list.map((o) => o.trim()).filter(Boolean))];
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:4000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: origins(),
  emailAndPassword: {
    enabled: true,
    /** Public self-signup closed. Platform/invite flows create users via Prisma + hashPassword. */
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "broker",
        required: false,
        input: false,
      },
      organizationId: {
        type: "string",
        required: false,
        input: false,
      },
      platformRole: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
