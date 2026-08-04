import { describe, it, expect } from "vitest";
import { parseRssFeed } from "@/lib/news/indie-news";

// Trimmed to two <item>s but otherwise real structure copied from a live
// fetch of https://www.indiewire.com/feed/, including an HTML numeric
// entity (&#8216;) in a title, to make sure decoding isn't broken by
// however fast-xml-parser is configured.
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>IndieWire</title>
  <link>https://www.indiewire.com</link>
  <description>The Voice of Creative Independence</description>
  <item>
    <title>&#8216;Butcher, Baker, Nightmare Maker&#8217; Is the Deranged Cult Slasher Every Horror Fan Should Have on Tap</title>
    <link>https://www.indiewire.com/features/best-of/butcher-baker-nightmare-maker-1981-cult-film-1235208050/</link>
    <dc:creator><![CDATA[Alison Foreman]]></dc:creator>
    <pubDate>Sat, 01 Aug 2026 03:59:00 +0000</pubDate>
    <guid isPermaLink="false">https://www.indiewire.com/?p=1235208050</guid>
    <description><![CDATA[Released in 1981, William Asher's delirious exploitation flick will instantly up your repertory game.]]></description>
  </item>
  <item>
    <title>For Rising Stars, Good Taste Comes at a Cost</title>
    <link>https://www.indiewire.com/awards/industry/superhero-films-1235208021/</link>
    <pubDate>Fri, 31 Jul 2026 22:30:00 +0000</pubDate>
  </item>
</channel>
</rss>`;

describe("parseRssFeed", () => {
  it("extracts title, url, source, and publishedAt from each item", () => {
    const items = parseRssFeed(SAMPLE_RSS, "IndieWire");
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({
      title: "For Rising Stars, Good Taste Comes at a Cost",
      url: "https://www.indiewire.com/awards/industry/superhero-films-1235208021/",
      source: "IndieWire",
      publishedAt: "Fri, 31 Jul 2026 22:30:00 +0000",
    });
  });

  it("decodes numeric HTML entities in titles", () => {
    const [item] = parseRssFeed(SAMPLE_RSS, "IndieWire");
    expect(item.title).toBe(
      "‘Butcher, Baker, Nightmare Maker’ Is the Deranged Cult Slasher Every Horror Fan Should Have on Tap"
    );
  });

  it("respects the limit parameter", () => {
    const items = parseRssFeed(SAMPLE_RSS, "IndieWire", 1);
    expect(items).toHaveLength(1);
  });

  it("returns an empty array for malformed XML rather than throwing", () => {
    expect(parseRssFeed("<not valid xml", "IndieWire")).toEqual([]);
  });

  it("returns an empty array when the feed has no items", () => {
    const empty = `<rss><channel><title>Empty</title></channel></rss>`;
    expect(parseRssFeed(empty, "IndieWire")).toEqual([]);
  });

  it("handles a single item without wrapping it in an array crash", () => {
    const single = `<rss><channel><item><title>Only One</title><link>https://example.com/a</link></item></channel></rss>`;
    const items = parseRssFeed(single, "IndieWire");
    expect(items).toEqual([
      { title: "Only One", url: "https://example.com/a", source: "IndieWire", publishedAt: "" },
    ]);
  });
});
