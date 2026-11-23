import { describe, expect, it } from "vitest";
import {
  type ArticleRecord,
  audiences,
  STORY_WINDOW_MS,
  storyMessage,
} from "../supabase/functions/send-breaking-push/plan";

const NOW = Date.parse("2026-11-22T06:00:00Z");

function story(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: "a1",
    slug: "budget-passes",
    title: "Budget passes",
    title_ne: "बजेट पारित",
    excerpt: "Parliament approved the budget.",
    excerpt_ne: "संसदले बजेट पारित गर्‍यो।",
    hero_image: null,
    status: "published",
    is_breaking: false,
    published_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

describe("audiences", () => {
  it("a fresh ordinary story goes to All news readers only", () => {
    expect(audiences(story(), NOW)).toEqual({ story: true, breaking: false });
  });

  it("a fresh breaking story goes to both audiences (which never overlap)", () => {
    expect(audiences(story({ is_breaking: true }), NOW)).toEqual({ story: true, breaking: true });
  });

  it("an old story never goes to All news readers", () => {
    const old = new Date(NOW - STORY_WINDOW_MS - 1).toISOString();
    expect(audiences(story({ published_at: old }), NOW)).toEqual({ story: false, breaking: false });
    // Ticking Breaking on an old story still alerts breaking readers, as before.
    expect(audiences(story({ published_at: old, is_breaking: true }), NOW)).toEqual({
      story: false,
      breaking: true,
    });
  });

  it("drafts, future publish times and missing times send nothing", () => {
    const none = { story: false, breaking: false };
    expect(audiences(story({ status: "draft", is_breaking: true }), NOW)).toEqual(none);
    expect(
      audiences(story({ published_at: new Date(NOW + 60_000).toISOString(), is_breaking: true }), NOW),
    ).toEqual(none);
    expect(audiences(story({ published_at: null }), NOW)).toEqual(none);
  });
});

describe("storyMessage", () => {
  it("styles an ordinary story as headline + excerpt on the news channel", () => {
    const m = storyMessage(story(), "tok", "en");
    expect(m).toMatchObject({
      to: "tok",
      title: "Budget passes",
      body: "Parliament approved the budget.",
      channelId: "news",
      priority: "default",
      data: { path: "/article/budget-passes", tag: "story" },
    });
  });

  it("styles a breaking story the same for every audience", () => {
    const m = storyMessage(story({ is_breaking: true }), "tok", "en");
    expect(m).toMatchObject({
      title: "Breaking news",
      body: "Budget passes",
      channelId: "breaking-news",
      priority: "high",
      data: { tag: "breaking" },
    });
  });

  it("uses the Nepali text for Nepali readers, falling back to English", () => {
    expect(storyMessage(story(), "tok", "ne")).toMatchObject({
      title: "बजेट पारित",
      body: "संसदले बजेट पारित गर्‍यो।",
    });
    expect(storyMessage(story({ is_breaking: true }), "tok", "ne")).toMatchObject({
      title: "ताजा समाचार",
      body: "बजेट पारित",
    });
    expect(storyMessage(story({ title_ne: null, excerpt_ne: null }), "tok", "ne")).toMatchObject({
      title: "Budget passes",
      body: "Parliament approved the budget.",
    });
  });

  it("leaves the body out when a story has no excerpt", () => {
    expect(storyMessage(story({ excerpt: null }), "tok", "en")).not.toHaveProperty("body");
  });
});
