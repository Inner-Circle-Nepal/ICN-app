// Supabase Edge Function: alert opted-in phones that a Chautari room just went live.
//
// Triggered by a Database Webhook on `public.chautari_rooms` (INSERT, UPDATE).
// Sends only when a room has `status = 'live'` and this is the transition
// into live (INSERT where status=live, or UPDATE where old_record.status
// was not 'live'), so a later edit to the same room does not re-alert.
// A second guard: `chautari_push_log` has `room_id` as its primary key, so
// two webhooks for the same room can never both send.
//
// Delivery mirrors `send-breaking-push`: Expo → APNs / FCM.
//
// Secrets:
//   WEBHOOK_SECRET      shared with the webhook's `x-webhook-secret` header
//   EXPO_ACCESS_TOKEN   optional

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type RoomRecord = {
  id: string;
  slug: string;
  title: string;
  host_name: string | null;
  status: string;
  started_at: string | null;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: RoomRecord | null;
  old_record: RoomRecord | null;
};

type TokenRow = { token: string; language: string };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

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
  const r = payload.record;
  if (payload.type === "DELETE" || !r) return json({ skipped: "no record" });

  if (r.status !== "live") return json({ skipped: "not live" });

  // On UPDATE, only alert when this is the transition into live. A room that
  // was already live and is being edited (title change, etc.) must not re-fire.
  if (payload.type === "UPDATE" && payload.old_record?.status === "live") {
    return json({ skipped: "already live before this update" });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Claim the room. PK on room_id means a second webhook for the same room
  // (a retry, a moderation edit) fails here and stops.
  const { error: claimError } = await sb
    .from("chautari_push_log")
    .insert({ room_id: r.id });
  if (claimError) return json({ skipped: "already sent" });

  const tokens: TokenRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("mobile_push_tokens")
      .select("token, language")
      .eq("chautari_enabled", true)
      .range(from, from + 999);
    if (error) return json({ error: error.message }, 500);
    tokens.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const host = (r.host_name ?? "").trim();
  const roomTitle = (r.title ?? "").trim();
  const title = trim(roomTitle || "Chautari", 65);

  const messages = tokens.map(({ token, language }) => {
    const ne = language === "ne";
    const liveLabel = ne ? "चौतारी लाइभ" : "Chautari live";
    const body = host ? `${liveLabel} · ${host}` : `${liveLabel} — ${ne ? "अहिले" : "now"}`;
    return {
      to: token,
      title,
      body: trim(body, 178),
      sound: "default",
      priority: "high",
      channelId: "chautari-live",
      data: { path: `/chautari/${r.slug}`, slug: r.slug, tag: "chautari-live" },
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

  if (dead.length) await sb.from("mobile_push_tokens").delete().in("token", dead);

  await sb
    .from("chautari_push_log")
    .update({ recipients: sent })
    .eq("room_id", r.id);

  return json({ room: r.slug, recipients: tokens.length, sent, removed: dead.length });
});
