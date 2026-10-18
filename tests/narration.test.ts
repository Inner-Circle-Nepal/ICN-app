import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHUNK_LIMIT,
  chunkForSpeech,
  narrationTextFromHtml,
  speechLanguageTag,
  splitSentences,
} from "@/utils/narration";

describe("narration text extraction", () => {
  it("reads headings, paragraphs, quotes and list items", () => {
    const text = narrationTextFromHtml(
      "<h2>The ruling</h2><p>The court decided on Tuesday.</p>" +
        "<ul><li>First point</li><li>Second point</li></ul>" +
        "<blockquote>We will appeal.</blockquote>",
    );

    expect(text).toContain("The ruling.");
    expect(text).toContain("The court decided on Tuesday.");
    expect(text).toContain("First point.");
    expect(text).toContain("Second point.");
    expect(text).toContain("We will appeal.");
  });

  it("does not read markup, scripts or table grids aloud", () => {
    const text = narrationTextFromHtml(
      "<p>Readable</p><script>alert(1)</script>" +
        "<table><tr><th>Code</th><th>Rate</th></tr><tr><td>USD</td><td>133</td></tr></table>",
    );

    expect(text).toContain("Readable");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("<");
    // A table read cell-by-cell is worse than silence.
    expect(text).not.toContain("133");
  });

  it("reads an image caption, since it carries reporting", () => {
    const text = narrationTextFromHtml(
      '<figure><img src="https://x/y.jpg" alt="a"><figcaption>Singha Durbar at dusk.</figcaption></figure>',
    );
    expect(text).toContain("Singha Durbar at dusk.");
  });

  it("returns empty string for an empty body rather than throwing", () => {
    expect(narrationTextFromHtml("")).toBe("");
    expect(narrationTextFromHtml("<p></p>")).toBe("");
  });

  it("does not add a second full stop to a heading that has one", () => {
    expect(narrationTextFromHtml("<h2>Why now?</h2>")).toBe("Why now?");
  });
});

describe("sentence splitting", () => {
  it("splits on full stops", () => {
    expect(splitSentences("One. Two. Three.")).toEqual(["One.", "Two.", "Three."]);
  });

  it("splits Nepali on the danda", () => {
    // Without this every Nepali article becomes a single unbroken chunk.
    const parts = splitSentences("यो पहिलो वाक्य हो। यो दोस्रो वाक्य हो।");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("यो पहिलो वाक्य हो।");
  });

  it("treats a blank line as a break", () => {
    expect(splitSentences("Para one\n\nPara two")).toEqual(["Para one", "Para two"]);
  });
});

describe("chunking for the speech engine", () => {
  it("keeps every chunk under the engine limit", () => {
    const body = `${"This is a sentence of reasonable length. ".repeat(500)}`;
    const chunks = chunkForSpeech(body, 1_000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1_000);
  });

  it("breaks between sentences, not inside them", () => {
    const body = "Alpha sentence here. Bravo sentence here. Charlie sentence here.";
    for (const chunk of chunkForSpeech(body, 40)) {
      // Every chunk is whole sentences, so each ends with terminal punctuation.
      expect(chunk).toMatch(/[.!?।]$/);
    }
  });

  it("loses no words", () => {
    const body = Array.from({ length: 200 }, (_, i) => `Sentence number ${i}.`).join(" ");
    const rejoined = chunkForSpeech(body, 300).join(" ");

    for (let i = 0; i < 200; i++) {
      expect(rejoined).toContain(`Sentence number ${i}.`);
    }
  });

  it("hard-splits a single sentence longer than the limit rather than dropping it", () => {
    // A run-on quote must still be read, even if the break is imperfect.
    const monster = `${"word ".repeat(400)}end.`;
    const chunks = chunkForSpeech(monster, 500);

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
    expect(chunks.join(" ")).toContain("end.");
  });

  it("returns nothing for empty input", () => {
    expect(chunkForSpeech("")).toEqual([]);
    expect(chunkForSpeech("   ")).toEqual([]);
  });

  it("refuses a nonsensically small limit instead of looping forever", () => {
    const chunks = chunkForSpeech("Some reasonable text here. And more of it.", 1);
    expect(chunks.length).toBeGreaterThan(0);
    expect(DEFAULT_CHUNK_LIMIT).toBeGreaterThan(1_000);
  });
});

describe("speech language tags", () => {
  it("maps to BCP 47 tags the engines recognise", () => {
    expect(speechLanguageTag("ne")).toBe("ne-NP");
    expect(speechLanguageTag("en")).toBe("en-US");
  });
});
