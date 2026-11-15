// Supabase Edge Function: nudge opted-in phones a few times a week.
//
// Triggered by pg_cron (Tue/Thu/Sat at 02:15 UTC = 08:00 NPT). The call
// carries no body; only the `x-webhook-secret` header matters.
//
// Message pool is shared across languages — a single rotating set of
// bilingual, Nepali-flavored lines. Day-of-year % pool.length picks the
// message, so every device sees the same one on the same day no matter
// when the function is reached.
//
// Dedupe: `reminder_push_log.sent_on` is a date PK, so a second firing
// on the same NPT day fails the claim insert and the function exits.
//
// Secrets:
//   WEBHOOK_SECRET      shared with the cron job's `x-webhook-secret` header
//   EXPO_ACCESS_TOKEN   optional

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type TokenRow = { token: string };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

// Nepali-flavored bilingual pool. Rotates by day-of-year; a given device
// sees the same message on the same calendar day.
const POOL: { title: string; body: string }[] = [
  { title: "चियाको समय", body: "आजको मुख्य समाचार हेर्नुहोस् — एक छिनमा सकिन्छ।" },
  { title: "Good morning, Nepal", body: "Grab your chiya — today's dispatches are up." },
  { title: "आज के भयो?", body: "समाचार बोकेर आयौँ। एक क्लिकमा पढ्नुहोस्।" },
  { title: "A quick catch-up", body: "What Kathmandu is talking about — in under two minutes." },
  { title: "नेपालको धडकन", body: "आजका मुख्य घटना, एकै ठाउँमा।" },
  { title: "दिनको सुरुवात", body: "आजको दिन समाचार सँगै सुरु गर्नुहोस्।" },
  { title: "Still here with you", body: "The newsroom never sleeps. Here's what you missed." },
  { title: "भेट्न आऊ न", body: "हाम्रो च्यानलमा आजका ताजा समाचार तयार छन्।" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Day of the year 1..366 for the given instant, so `% pool.length` gives
// the stable per-day pick.
function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return json({ error: "unauthorised" }, 401);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Use Nepal time for the daily key so a cron firing near midnight UTC
  // does not land on two different "dates" over two firings and send twice.
  const nowNpt = new Date(Date.now() + (5 * 60 + 45) * 60_000);
  const sentOn = nowNpt.toISOString().slice(0, 10); // YYYY-MM-DD in NPT

  const { error: claimError } = await sb
    .from("reminder_push_log")
    .insert({ sent_on: sentOn });
  if (claimError) return json({ skipped: "already sent today" });

  const tokens: TokenRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("mobile_push_tokens")
      .select("token")
      .eq("reminders_enabled", true)
      .range(from, from + 999);
    if (error) return json({ error: error.message }, 500);
    tokens.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const { title, body } = POOL[dayOfYear(nowNpt) % POOL.length];

  const messages = tokens.map(({ token }) => ({
    to: token,
    title,
    body,
    sound: "default",
    priority: "normal" as const,
    channelId: "reminders",
    data: { tag: "reminder" },
  }));

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

  if (dead.length) await sb.from("mobile_push_tokens").delete().in("token", dead);

  await sb
    .from("reminder_push_log")
    .update({ recipients: sent })
    .eq("sent_on", sentOn);

  return json({ date: sentOn, recipients: tokens.length, sent, removed: dead.length });
});
