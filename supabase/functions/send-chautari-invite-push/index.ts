// Supabase Edge Function: tell a reader they were invited to a Chautari room.
//
// Triggered by a Database Webhook on `public.chautari_invites` (INSERT). The
// site (`POST /api/chautari/invite`) only creates invites for readers who
// follow the inviter and asked to hear about them; this checks again, in
// case they changed their mind in between, and that the room is not over.
//
// Dedupe: claims the invite by setting `notified_at` where it is still null,
// so a retried webhook finds nothing to claim and stops.
//
// Delivery mirrors `send-chautari-live-push`: Expo → APNs / FCM, to the
// invitee's phones (`mobile_push_tokens.clerk_user_id`) with Chautari alerts on.
//
// Secrets:
//   WEBHOOK_SECRET      shared with the webhook's `x-webhook-secret` header
//   EXPO_ACCESS_TOKEN   optional

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type InviteRecord = {
  id: string;
  room_id: string;
  inviter_clerk_id: string;
  invitee_clerk_id: string;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: InviteRecord | null;
};

type TokenRow = { token: string; language: string };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const GRACE_HOURS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function trim(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// "Sat 22 Nov, 7:30 PM": Chautari shows times in Kathmandu time.
function kathmanduTime(iso: string, ne: boolean): string {
  return new Intl.DateTimeFormat(ne ? "ne-NP" : "en-GB", {
    timeZone: "Asia/Kathmandu",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return json({ error: "unauthorised" }, 401);
  }

  const payload = (await req.json()) as WebhookPayload;
  const invite = payload.record;
  if (payload.type !== "INSERT" || !invite) return json({ skipped: "not a new invite" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: claimed } = await sb
    .from("chautari_invites")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("notified_at", null)
    .select("id");
  if (!claimed?.length) return json({ skipped: "already sent" });

  const [{ data: room }, { data: follow }, { data: inviter }] = await Promise.all([
    sb
      .from("chautari_rooms")
      .select("slug, title, status, scheduled_for, banner_url")
      .eq("id", invite.room_id)
      .maybeSingle(),
    sb
      .from("user_follows")
      .select("notify")
      .eq("follower_clerk_id", invite.invitee_clerk_id)
      .eq("followee_clerk_id", invite.inviter_clerk_id)
      .maybeSingle(),
    sb
      .from("reader_profiles")
      .select("display_name")
      .eq("clerk_user_id", invite.inviter_clerk_id)
      .maybeSingle(),
  ]);

  if (!room || room.status === "ended") return json({ skipped: "room is over" });
  if (!follow?.notify) return json({ skipped: "invitee no longer listening to inviter" });

  const startsAt = room.status === "scheduled" && room.scheduled_for ? room.scheduled_for : null;
  if (startsAt && Date.now() - Date.parse(startsAt) > GRACE_HOURS * 3600_000) {
    return json({ skipped: "booking expired" });
  }

  const { data: tokenRows, error } = await sb
    .from("mobile_push_tokens")
    .select("token, language")
    .eq("clerk_user_id", invite.invitee_clerk_id)
    .eq("chautari_enabled", true);
  if (error) return json({ error: error.message }, 500);
  const tokens = (tokenRows ?? []) as TokenRow[];
  if (tokens.length === 0) return json({ room: room.slug, recipients: 0, sent: 0 });

  const name = trim(inviter?.display_name ?? "", 40);
  const roomTitle = trim(room.title ?? "", 120);
  const image = room.banner_url && /^https:\/\//.test(room.banner_url) ? room.banner_url : undefined;

  // Keep an invite only as long as it is useful: until a booked room's grace
  // period runs out, or a few hours for a room that is live now.
  const ttl = startsAt
    ? Math.max(3600, Math.round((Date.parse(startsAt) + GRACE_HOURS * 3600_000 - Date.now()) / 1000))
    : 3 * 3600;

  const messages = tokens.map(({ token, language }) => {
    const ne = language === "ne";
    const title = name
      ? ne
        ? `${name}ले तपाईंलाई चौतारीमा बोलाउनुभयो`
        : `${name} invited you to Chautari`
      : ne
        ? "चौतारीको निम्तो"
        : "You're invited to Chautari";
    const when = startsAt
      ? ne
        ? `सुरु: ${kathmanduTime(startsAt, true)}`
        : `Starts ${kathmanduTime(startsAt, false)}`
      : ne
        ? "अहिले लाइभ"
        : "Live now";
    return {
      to: token,
      title: trim(title, 65),
      subtitle: "Chautari",
      body: trim(roomTitle ? `${roomTitle} · ${when}` : when, 178),
      sound: "default",
      priority: "high",
      channelId: "chautari-live",
      threadId: "chautari",
      ttl,
      ...(image ? { richContent: { image } } : {}),
      data: { path: `/chautari/${room.slug}`, slug: room.slug, tag: "chautari-invite" },
    };
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  // A reader has a handful of phones at most: one request.
  const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) });
  let sent = 0;
  const dead: string[] = [];
  if (res.ok) {
    const { data: tickets } = (await res.json()) as {
      data: { status: "ok" | "error"; details?: { error?: string } }[];
    };
    tickets.forEach((t, j) => {
      if (t.status === "ok") sent += 1;
      else if (t.details?.error === "DeviceNotRegistered") dead.push(messages[j].to);
    });
  }
  if (dead.length) await sb.from("mobile_push_tokens").delete().in("token", dead);

  return json({ room: room.slug, recipients: tokens.length, sent, removed: dead.length });
});
