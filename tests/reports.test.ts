import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_REASONS, reportBody } from "@/features/reports/reasons";
import { ReaderApiError, sendReport } from "@/lib/api/readerProfile";

describe("reportBody", () => {
  it("names a chat message by id, never by its text", () => {
    expect(reportBody({ kind: "message", messageId: "m1", roomSlug: "r" }, "abuse", "  twice  ")).toEqual({
      reason: "abuse",
      details: "twice",
      messageId: "m1",
      roomSlug: "r",
    });
  });

  it("names a person in a room by their account id", () => {
    expect(reportBody({ kind: "person", clerkId: "user_1", roomSlug: "r" }, "spam", "")).toEqual({
      reason: "spam",
      details: "",
      reportedClerkId: "user_1",
      roomSlug: "r",
    });
  });

  it("names a profile by username", () => {
    expect(reportBody({ kind: "profile", username: "sita" }, "other", "x")).toMatchObject({
      reportedUsername: "sita",
    });
  });

  it("offers the four reasons the server accepts", () => {
    expect(REPORT_REASONS.map((r) => r.id)).toEqual(["abuse", "harassment", "spam", "other"]);
  });
});

describe("sendReport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const token = async () => "clerk_session_token_abc";
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts with the session and returns the server's thank-you", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, message: "Thank you." }));
    await expect(
      sendReport(token, { kind: "message", messageId: "m1", roomSlug: "r" }, "abuse", ""),
    ).resolves.toBe("Thank you.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/reader/report");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer clerk_session_token_abc" });
  });

  it("surfaces a suspension as the server words it", async () => {
    fetchMock.mockResolvedValue(
      reply({ ok: false, reason: "account_suspended", error: "Your account is suspended: spam." }, 403),
    );
    const err = await sendReport(token, { kind: "profile", username: "x" }, "spam", "").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReaderApiError);
    expect((err as ReaderApiError).reason).toBe("account_suspended");
    expect((err as ReaderApiError).message).toContain("suspended");
  });
});
