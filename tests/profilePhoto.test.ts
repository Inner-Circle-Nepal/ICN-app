import { describe, expect, it } from "vitest";
import { profileImageDataUri } from "@/features/profile/photo";

/**
 * The data URI handed to Clerk's `setProfileImage`.
 *
 * Worth testing because every way this fails is silent from the app's side:
 * a wrong or absent media type is rejected at Clerk's end with an error the
 * reader cannot act on, and a missing `base64` would otherwise send the
 * literal string "undefined".
 */

describe("profileImageDataUri", () => {
  it("builds a data URI from the reported type", () => {
    expect(profileImageDataUri({ base64: "AAAA", mimeType: "image/png" })).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("falls back to JPEG when the platform reports no type", () => {
    // The SDK docs note mimeType "may be null if it can't be determined".
    expect(profileImageDataUri({ base64: "AAAA", mimeType: null })).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(profileImageDataUri({ base64: "AAAA" })).toBe("data:image/jpeg;base64,AAAA");
  });

  it("strips parameters from a reported type", () => {
    expect(profileImageDataUri({ base64: "AAAA", mimeType: "image/jpeg; charset=binary" })).toBe(
      "data:image/jpeg;base64,AAAA",
    );
  });

  it("normalises case", () => {
    expect(profileImageDataUri({ base64: "AAAA", mimeType: "IMAGE/PNG" })).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("accepts every type Clerk takes", () => {
    for (const mime of ["image/jpeg", "image/png", "image/gif", "image/webp"]) {
      expect(profileImageDataUri({ base64: "AAAA", mimeType: mime })).toBe(
        `data:${mime};base64,AAAA`,
      );
    }
  });

  /* A declared type that does not match the bytes is rejected at the far end. */
  it("does not pass through an unsupported type", () => {
    expect(profileImageDataUri({ base64: "AAAA", mimeType: "image/heic" })).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(profileImageDataUri({ base64: "AAAA", mimeType: "application/pdf" })).toBe(
      "data:image/jpeg;base64,AAAA",
    );
  });

  it("returns null when there is nothing to send", () => {
    expect(profileImageDataUri({ base64: null, mimeType: "image/png" })).toBeNull();
    expect(profileImageDataUri({ base64: "", mimeType: "image/png" })).toBeNull();
    expect(profileImageDataUri(null)).toBeNull();
    expect(profileImageDataUri(undefined)).toBeNull();
  });

  it("never emits the string 'undefined' as payload", () => {
    const out = profileImageDataUri({ base64: undefined, mimeType: undefined });
    expect(out).toBeNull();
    expect(String(out)).not.toContain("undefined;base64");
  });
});
