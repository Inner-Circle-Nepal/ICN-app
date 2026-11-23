// Supabase Edge Function: send news alerts to subscribed phones. (The name
// predates "All news"; it stays because the webhook calls this URL.)
//
// Triggered by a Database Webhook on `public.articles` (INSERT and UPDATE).
// A published, live story goes to two audiences that never overlap:
//   - phones with All news on (`all_news_enabled`): every story published in
//     the last day, once, claimed in `mobile_news_push_log`;
//   - phones with Breaking on and All news off: breaking stories only, once,
//     claimed in `mobile_push_log`.
// So a reader with All news on gets one push for a breaking story, not two,
// and editing a story later alerts nobody again. The decisions are in
// `plan.ts`.
//
// Delivery goes through Expo's push service, which forwards to Apple (APNs)
// and Google (FCM) with the credentials already stored on the Expo project.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   WEBHOOK_SECRET      shared with the webhook's `x-webhook-secret` header
//   EXPO_ACCESS_TOKEN   optional; only if "enhanced push security" is on
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { type ArticleRecord, audiences, storyMessage } from "./plan.ts";

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

/** Every token matching the audience's opt-ins, read in pages of 1000. */
async function readTokens(
  sb: SupabaseClient,
  audience: "story" | "breaking",
): Promise<TokenRow[]> {
  const tokens: TokenRow[] = [];
  for (let from = 0; ; from += 1000) {
    let query = sb.from("mobile_push_tokens").select("token, language");
    query =
      audience === "story"
        ? query.eq("all_news_enabled", true)
        : query.eq("breaking_enabled", true).eq("all_news_enabled", false);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(error.message);
    tokens.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return tokens;
}

/** Send through Expo; returns how many were accepted and which tokens are dead. */
async function deliver(messages: { to: string }[]) {
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
  return { sent, dead };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return json({ error: "unauthorised" }, 401);
  }

  const payload = (await req.json()) as WebhookPayload;
  const a = payload.record;
  if (payload.type === "DELETE" || !a) return json({ skipped: "no record" });

  const due = audiences(a, Date.now());
  if (!due.story && !due.breaking) return json({ skipped: "not a live story" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const result: Record<string, unknown> = { article: a.slug };
  const dead: string[] = [];

  // Each audience claims the story first. The primary key makes this the
  // dedupe: a second webhook for the same article (an edit, a retry) fails
  // here and that audience is skipped.
  const runs = [
    { audience: "story" as const, due: due.story, log: "mobile_news_push_log" },
    { audience: "breaking" as const, due: due.breaking, log: "mobile_push_log" },
  ];
  for (const run of runs) {
    if (!run.due) continue;
    const { error: claimError } = await sb.from(run.log).insert({ article_id: a.id });
    if (claimError) {
      result[run.audience] = "already sent";
      continue;
    }
    let tokens: TokenRow[];
    try {
      tokens = await readTokens(sb, run.audience);
    } catch (e) {
      return json({ ...result, error: (e as Error).message }, 500);
    }
    const out = await deliver(tokens.map((t) => storyMessage(a, t.token, t.language)));
    dead.push(...out.dead);
    await sb.from(run.log).update({ recipients: out.sent }).eq("article_id", a.id);
    result[run.audience] = { recipients: tokens.length, sent: out.sent };
  }

  // Phones that uninstalled the app or revoked permission.
  if (dead.length) await sb.from("mobile_push_tokens").delete().in("token", dead);

  return json({ ...result, removed: dead.length });
});
