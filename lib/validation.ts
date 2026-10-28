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

// Phase 2 — project payloads. Title/slug limits mirror the 0003
// check constraints (title 1-200); tools_used is a string array;
// characters carry an optional image_path STRING ONLY in Phase 2
// (no image upload yet). role/status/vote_count/view_count are
// never accepted from the client.
export const characterInputSchema = z.object({
  name: z.string().trim().min(1, "Character name is required.").max(100),
  role: z.string().max(100).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  image_path: z.string().max(500).optional().or(z.literal("")),
});

export const projectCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  tagline: z.string().max(300).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  concept: z.string().max(5000).optional().or(z.literal("")),
  story: z.string().max(20000).optional().or(z.literal("")),
  genre: z.string().max(100).optional().or(z.literal("")),
  tools_used: z.array(z.string().max(100)).max(20).optional().default([]),
  group_id: z.string().uuid("Invalid group.").nullable().optional(),
  group_name: z.string().trim().max(100).optional().or(z.literal("")),
  characters: z.array(characterInputSchema).max(50).optional().default([]),
});

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  status: z.enum(["draft", "published", "hidden"]).optional(),
  rules_accepted_at: z.string().optional().or(z.literal("")),
});

export const completeUploadSchema = z.object({
  size_bytes: z.number().int().positive("File size is required."),
  mime: z.string().min(1, "File MIME type is required."),
  // First 24 bytes of the file, base64-encoded, for the magic-byte
  // check. The route rejects the upload when this is missing:
  // without it a renamed non-video could slip through.
  header_base64: z.string().min(1, "File header bytes are required."),
  duration_seconds: z.number().positive().nullable().optional(),
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
