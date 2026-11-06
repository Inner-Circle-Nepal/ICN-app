// Supabase Edge Function: send a breaking-news alert to every subscribed phone.
//
// Triggered by a Database Webhook on `public.articles` (INSERT and UPDATE).
// It sends only when a story is published, flagged breaking, already live,
// and has never been alerted before (`mobile_push_log`), so editing a
// breaking story later does not alert anyone again.
//
// Delivery goes through Expo's push service, which forwards to Apple (APNs)
// and Google (FCM) with the credentials already stored on the Expo project.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   WEBHOOK_SECRET      shared with the webhook's `x-webhook-secret` header
//   EXPO_ACCESS_TOKEN   optional; only if "enhanced push security" is on
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ArticleRecord = {
  id: string;
  slug: string;
  title: string;
  title_ne: string | null;
  excerpt: string | null;
  excerpt_ne: string | null;
  status: string;
  is_breaking: boolean;
  published_at: string | null;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: ArticleRecord | null;
};

type TokenRow = { token: string; language: string };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100; // Expo's per-request limit

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function trim(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return json({ error: "unauthorised" }, 401);
  }

  const payload = (await req.json()) as WebhookPayload;
  const a = payload.record;
  if (payload.type === "DELETE" || !a) return json({ skipped: "no record" });

  const live =
    a.status === "published" &&
    a.is_breaking &&
    a.published_at !== null &&
    new Date(a.published_at).getTime() <= Date.now();
  if (!live) return json({ skipped: "not a live breaking story" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Claim the story first. The primary key makes this the dedupe: a second
  // webhook for the same article (an edit, a retry) fails here and stops.
  const { error: claimError } = await sb.from("mobile_push_log").insert({ article_id: a.id });
  if (claimError) return json({ skipped: "already sent" });

  const tokens: TokenRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("mobile_push_tokens")
      .select("token, language")
      .range(from, from + 999);
    if (error) return json({ error: error.message }, 500);
    tokens.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const messages = tokens.map(({ token, language }) => {
    const ne = language === "ne" && a.title_ne;
    return {
      to: token,
      title: ne ? "ताजा समाचार" : "Breaking",
      body: trim(ne ? a.title_ne : a.title, 178),
      sound: "default",
      priority: "high",
      channelId: "breaking-news",
      data: { path: `/article/${a.slug}`, slug: a.slug, tag: "breaking" },
    };
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  let sent = 0;
  const dead: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    if (!res.ok) continue;
    const { data: tickets } = (await res.json()) as {
      data: { status: "ok" | "error"; details?: { error?: string } }[];
    };
    tickets.forEach((t, j) => {
      if (t.status === "ok") sent += 1;
      else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[j].to);
    });
  }

  // Phones that uninstalled the app or revoked permission.
  if (dead.length) await sb.from("mobile_push_tokens").delete().in("token", dead);

  await sb.from("mobile_push_log").update({ recipients: sent }).eq("article_id", a.id);

  return json({ article: a.slug, recipients: tokens.length, sent, removed: dead.length });
});
