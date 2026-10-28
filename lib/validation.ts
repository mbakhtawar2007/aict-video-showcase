// Phase 1 — Zod schemas for auth and onboarding payloads.
import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().min(1, "Please enter your university email address."),
});

export const codeSchema = z.object({
  email: z.string().min(1, "Please enter your university email address."),
  code: z
    .string()
    .regex(/^[0-9]{6}$/, "Enter the 6-digit code from your email."),
});

// Username rules (also enforced by a DB check constraint in 0002):
// 3-30 chars, letters/digits/dot/underscore/hyphen, no spaces.
export const onboardingSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(30, "Username must be at most 30 characters.")
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Username may only contain letters, digits, dot, underscore or hyphen.",
    ),
  full_name: z
    .string()
    .min(1, "Please enter your full name.")
    .max(100, "Full name must be at most 100 characters."),
  class_section: z
    .string()
    .max(50, "Class section must be at most 50 characters.")
    .optional()
    .or(z.literal("")),
});
