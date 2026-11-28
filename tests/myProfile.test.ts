import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `getMyProfile` decides whether a signed-in reader is sent to the signup
 * form: only the site's own `profile_missing` 404 may mean "no profile".
 */

vi.mock("@/constants/config", () => ({ SITE_URL: "https://site.test" }));

import { ReaderApiError, getMyProfile } from "@/lib/api/readerProfile";

const getToken = async () => "token";

function reply(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("getMyProfile", () => {
  it("returns the profile", async () => {
    reply(200, {
      ok: true,
      profile: { clerk_user_id: "user_a", username: "reader", display_name: "Reader" },
      suspension: null,
    });
    expect((await getMyProfile(getToken))?.username).toBe("reader");
  });

  it("returns null only for the site's profile_missing answer", async () => {
    reply(404, { ok: false, error: "No profile yet.", reason: "profile_missing" });
    expect(await getMyProfile(getToken)).toBeNull();
  });

  it("treats any other 404 as a failure, not as 'no profile'", async () => {
    reply(404, "<html>Not Found</html>");
    await expect(getMyProfile(getToken)).rejects.toBeInstanceOf(ReaderApiError);
    reply(404, { ok: false, reason: "something_else" });
    await expect(getMyProfile(getToken)).rejects.toBeInstanceOf(ReaderApiError);
  });

  it("refuses to ask without a session", async () => {
    reply(200, { ok: true, profile: {} });
    await expect(getMyProfile(async () => null)).rejects.toMatchObject({ reason: "not_signed_in" });
  });
});
