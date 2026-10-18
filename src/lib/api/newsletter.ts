import { SITE_URL } from "@/constants/config";
import { getPublicSupabase } from "./supabase";

/**
 * Newsletter signup and Newsroom contact / tip submission.
 *
 * Uses the website's public `/api/newsletter` and `/api/contact` endpoints
 * when reachable, and falls back to the direct Supabase RLS-protected anon
 * insert policies (`"anyone can subscribe"` and `"anyone can contact"` in
 * `supabase/schema.sql`).
 */

export interface NewsletterSubscribeInput {
  email: string;
  name?: string;
  edition?: string | null;
  source?: string;
}

export interface SubmissionResult {
  ok: boolean;
  message: string;
}

export async function subscribeToNewsletter(
  input: NewsletterSubscribeInput,
): Promise<SubmissionResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const edition = input.edition || null;
  const source = input.source || "mobile-app";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`${SITE_URL}/api/newsletter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, edition, source }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (json.ok) {
        return {
          ok: true,
          message: json.message ?? "You’re on the list for the weekday morning briefing.",
        };
      }
      if (json.error) {
        return { ok: false, message: json.error };
      }
    }
  } catch {
    // Fall back to direct Supabase insert below
  }

  const sb = getPublicSupabase();
  if (!sb) {
    return {
      ok: false,
      message: "Unable to reach the newsroom right now. Please check your connection.",
    };
  }

  const { error } = await sb.from("subscribers").insert({
    email,
    name,
    edition,
    source,
    confirmed: false,
  });

  // 23505 = duplicate email (already on the list)
  if (error && error.code !== "23505") {
    return {
      ok: false,
      message: "We couldn’t save your subscription just now. Please try again shortly.",
    };
  }

  return {
    ok: true,
    message: "You’re on the list — the briefing arrives each weekday morning.",
  };
}

export interface ContactSubmissionInput {
  name: string;
  email: string;
  topic: string;
  message: string;
}

export async function submitContactMessage(
  input: ContactSubmissionInput,
): Promise<SubmissionResult> {
  const payload = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    topic: input.topic.trim() || "General",
    message: input.message.trim(),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`${SITE_URL}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (json.ok) {
        return {
          ok: true,
          message: json.message ?? "Your message is with the newsroom.",
        };
      }
    }
  } catch {
    // Fall back to direct Supabase insert below
  }

  const sb = getPublicSupabase();
  if (!sb) {
    return {
      ok: false,
      message: "Unable to reach the newsroom right now. Please email newsroom@icn.news.",
    };
  }

  const { error } = await sb.from("contact_messages").insert({
    ...payload,
    status: "new",
  });

  if (error) {
    return {
      ok: false,
      message: "We couldn’t send that just now. Please email newsroom@icn.news directly.",
    };
  }

  return {
    ok: true,
    message: "Your message is with the newsroom.",
  };
}
