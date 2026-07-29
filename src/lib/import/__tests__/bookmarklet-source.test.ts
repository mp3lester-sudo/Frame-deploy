import { describe, it, expect, vi, afterEach } from "vitest";
import { parseLetterboxdDiaryPaste } from "@/lib/import/letterboxd-paste";
import { LETTERBOXD_DIARY_BOOKMARKLET_SOURCE } from "@/lib/import/bookmarklet-source";

// Same shape as letterboxd-paste.test.ts's fixture builder — kept as a
// separate local copy since these are two independently-testable producers
// (this bookmarklet, and a manual page-source paste) feeding one consumer
// (parseLetterboxdDiaryPaste), not because the markup shape is expected to
// diverge.
function diaryRow(opts: { slug: string; title: string; year: number; rating?: string }): string {
  const ratingCell = opts.rating
    ? `<td class="td-rating"><a href="#" title="Remove rating">×</a> ${opts.rating}</td>`
    : `<td class="td-rating"></td>`;
  return `
    <tr class="diary-entry-row">
      <td class="td-film-details">
        <a href="/someuser/film/${opts.slug}/">${opts.title}</a><a href="/films/year/${opts.year}/">${opts.year}</a>
      </td>
      ${ratingCell}
    </tr>`;
}

function collapse(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}

describe("LETTERBOXD_DIARY_BOOKMARKLET_SOURCE", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has no // line comments (whitespace collapsing would turn one into a syntax-breaking swallow-the-rest-of-the-script)", () => {
    // Regex literals in the source use escaped single slashes (\/), never a
    // literal doubled "//" — a real `//` substring only shows up if someone
    // adds a line comment, which is exactly what this guards against.
    expect(LETTERBOXD_DIARY_BOOKMARKLET_SOURCE).not.toContain("//");
  });

  it("is still syntactically valid JavaScript after whitespace is collapsed to build the javascript: href", () => {
    expect(() => new Function(collapse(LETTERBOXD_DIARY_BOOKMARKLET_SOURCE))).not.toThrow();
  });

  it("paginates via fetch, extracts the same rows the server-side parser would, and copies them to the clipboard", async () => {
    const page1 = [
      diaryRow({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, rating: "★★★★" }),
      diaryRow({ slug: "wet-hot-american-summer", title: "Wet Hot American Summer", year: 2001, rating: "★★★½" }),
    ].join("\n");
    const page2 = diaryRow({ slug: "goldeneye", title: "GoldenEye", year: 1995 }); // unrated
    const page3 = "<html><body>no more diary rows here</body></html>";

    const pages = [page1, page2, page3];
    const requestedUrls: string[] = [];
    let calls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      requestedUrls.push(url);
      const html = pages[calls] ?? page3;
      calls++;
      return { ok: true, text: async () => html };
    });

    let copied = "";
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { hostname: "letterboxd.com", href: "https://letterboxd.com/someuser/films/diary/" });
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          copied = text;
        },
      },
    });
    vi.stubGlobal("alert", vi.fn());

    const run = new Function(`return ${collapse(LETTERBOXD_DIARY_BOOKMARKLET_SOURCE)}`);
    await run();

    // Three fetches: two real pages of entries, then one empty page that
    // stops the loop.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestedUrls).toEqual([
      "https://letterboxd.com/someuser/films/diary/",
      "https://letterboxd.com/someuser/films/diary/page/2/",
      "https://letterboxd.com/someuser/films/diary/page/3/",
    ]);

    expect(copied.split("\n")).toHaveLength(3);

    // The real proof: feed the bookmarklet's output back into the actual
    // server-side parser and confirm it reconstructs the exact same rows
    // it would have from three manual page-source pastes.
    expect(parseLetterboxdDiaryPaste(copied)).toEqual([
      { name: "The Odyssey", year: 2026, rating: 4 },
      { name: "Wet Hot American Summer", year: 2001, rating: 3.5 },
      { name: "GoldenEye", year: 1995, rating: null },
    ]);
  }, 10000);

  it("refuses to run on a non-Letterboxd page", async () => {
    const alertMock = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { hostname: "example.com", href: "https://example.com/" });
    vi.stubGlobal("alert", alertMock);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });

    const run = new Function(`return ${collapse(LETTERBOXD_DIARY_BOOKMARKLET_SOURCE)}`);
    await run();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledTimes(1);
  });
});
