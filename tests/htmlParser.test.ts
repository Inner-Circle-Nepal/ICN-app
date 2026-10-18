import { describe, expect, it } from "vitest";
import { parseArticleHtml } from "@/utils/htmlParser";
import { decodeHtmlEntities } from "@/utils/format";

describe("htmlParser", () => {
  it("decodes named, decimal and hexadecimal entities", () => {
    // `&nbsp;` resolves to U+00A0, not a plain space: it is what keeps a
    // figure and its unit on the same line.
    expect(
      decodeHtmlEntities(
        "Kathmandu &amp; Diaspora &mdash; &#8220;Quoted&#8221; 100&nbsp;NPR",
      ),
    ).toBe("Kathmandu & Diaspora — “Quoted” 100 NPR");

    expect(decodeHtmlEntities("Nepal&#x27;s budget &#x2014; reviewed")).toBe(
      "Nepal's budget — reviewed",
    );
  });

  it("does not decode its own output", () => {
    // A story quoting markup writes `&amp;lt;`, which must survive as the
    // literal text `&lt;` rather than turning back into a tag.
    expect(decodeHtmlEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  it("leaves unknown and malformed entities untouched", () => {
    expect(decodeHtmlEntities("Rs 500 &notarealentity; &#xZZ; 50&50")).toBe(
      "Rs 500 &notarealentity; &#xZZ; 50&50",
    );
  });

  it("decodes code points above the BMP", () => {
    expect(decodeHtmlEntities("&#128512;")).toBe("\u{1f600}");
  });

  it("handles bare text before the first <p> tag without losing content", () => {
    const html = `KATHMANDU — The Rastriya Swatantra Party (RSP) has opened applications.<p>Second paragraph with <strong>bold</strong> and <em>italic</em> text.</p>`;
    const blocks = parseArticleHtml(html);

    expect(blocks.length).toBe(2);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      variant: "normal",
      spans: [
        {
          text: "KATHMANDU — The Rastriya Swatantra Party (RSP) has opened applications.",
        },
      ],
    });
    expect(blocks[1]).toEqual({
      type: "paragraph",
      variant: "normal",
      spans: [
        { text: "Second paragraph with " },
        { text: "bold", bold: true },
        { text: " and " },
        { text: "italic", italic: true },
        { text: " text." },
      ],
    });
  });

  it("parses headings, blockquotes with citations, lists, figures, and links", () => {
    const html = `
      <p>Lead paragraph with a <a href="https://icn.news/nepal/budget-review">link</a>.</p>
      <h2>Fiscal Architecture</h2>
      <blockquote>
        <p>"Remittance inflows reached a record high this quarter."</p>
        <cite>— Nepal Rastra Bank Monthly Bulletin</cite>
      </blockquote>
      <ul>
        <li>First key point</li>
        <li>Second <strong>important</strong> point</li>
      </ul>
      <figure>
        <img src="https://images.example.com/photo.jpg" alt="Singha Durbar" />
        <figcaption>Singha Durbar at dusk. Photo: ICN</figcaption>
      </figure>
      <hr />
    `;

    const blocks = parseArticleHtml(html);
    expect(blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "heading",
      "blockquote",
      "list",
      "image",
      "rule",
    ]);

    const heading = blocks[1];
    expect(heading.type === "heading" && heading.level).toBe(2);

    const quote = blocks[2];
    expect(quote.type === "blockquote" && quote.cite).toBe(
      "— Nepal Rastra Bank Monthly Bulletin",
    );

    const list = blocks[3];
    expect(list.type === "list" && list.ordered).toBe(false);
    expect(list.type === "list" && list.items.length).toBe(2);

    const fig = blocks[4];
    expect(fig.type === "image" && fig.src).toBe(
      "https://images.example.com/photo.jpg",
    );
    expect(fig.type === "image" && fig.caption).toBe(
      "Singha Durbar at dusk. Photo: ICN",
    );
  });

  /*
   * The two cases below are reduced from real published bodies
   * (`president-paudel-ends-current-parliamentary-session` and
   * `nta-warns-isps-excessive-internet-charges-2026`). The newsroom editor
   * emits lists with an unclosed `<li>` and with a list nested inside an item,
   * and requiring a matching `</li>` dropped the whole list on the first.
   */
  it("keeps an item whose </li> was never closed", () => {
    const html = `<ul>
      <li>When the session resumes, any pending bills will be taken up again.<ul>
    </ul>`;

    const blocks = parseArticleHtml(html);
    const list = blocks.find((b) => b.type === "list");
    expect(list).toBeDefined();
    expect(list?.type === "list" && list.items.length).toBe(1);
    expect(
      list?.type === "list" &&
        list.items[0].map((s) => s.text).join(""),
    ).toBe("When the session resumes, any pending bills will be taken up again.");
  });

  it("keeps the words of a list nested inside an item", () => {
    const html = `<ul><li>Alpha<ul><li>Beta</li></ul></li><li>Gamma</li></ul>`;

    const blocks = parseArticleHtml(html);
    const list = blocks.find((b) => b.type === "list");
    expect(list).toBeDefined();
    const texts =
      list?.type === "list"
        ? list.items.map((item) => item.map((s) => s.text).join("").trim())
        : [];
    expect(texts).toContain("Alpha");
    expect(texts).toContain("Beta");
  });

  it("does not let an unclosed list swallow the rest of the story", () => {
    const html = `<ul><li>Item<ul></ul><p>A paragraph that must still render.</p>`;
    const blocks = parseArticleHtml(html);
    const paragraphs = blocks.filter((b) => b.type === "paragraph");
    expect(
      paragraphs.some((p) =>
        p.type === "paragraph" &&
        p.spans.map((s) => s.text).join("").includes("must still render"),
      ),
    ).toBe(true);
  });

  it("drops script and style content rather than printing it as text", () => {
    const html = `<p>Before</p><script>alert("x")</script><style>p{color:red}</style><p>After</p>`;
    const blocks = parseArticleHtml(html);
    const text = blocks
      .flatMap((b) => (b.type === "paragraph" ? b.spans.map((s) => s.text) : []))
      .join(" ");
    expect(text).toContain("Before");
    expect(text).toContain("After");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("refuses unsafe link and image URLs", () => {
    const blocks = parseArticleHtml(
      `<p><a href="javascript:alert(1)">tap</a> and <a href="https://icn.news/x">safe</a></p>` +
        `<p><img src="javascript:alert(1)" alt="bad" /></p>`,
    );

    const spans = blocks.flatMap((b) => (b.type === "paragraph" ? b.spans : []));
    expect(spans.find((s) => s.text === "tap")?.href).toBeUndefined();
    expect(spans.find((s) => s.text === "safe")?.href).toBe("https://icn.news/x");
    expect(blocks.some((b) => b.type === "image")).toBe(false);
  });

  it("rejects a javascript: URL hidden behind an entity", () => {
    const blocks = parseArticleHtml(
      `<p><a href="javas&#99;ript:alert(1)">tap</a></p>`,
    );
    const spans = blocks.flatMap((b) => (b.type === "paragraph" ? b.spans : []));
    expect(spans.find((s) => s.text === "tap")?.href).toBeUndefined();
  });
});
