import { beforeEach, describe, expect, it } from "vitest";
import {
  captureAnchor,
  indexText,
  overlaps,
  rangeAt,
  resolveAnchor,
  quoteText,
} from "../src/content/anchors";
function select(text: string, occurrence = 0) {
  const index = indexText(document.body);
  let start = -1;
  for (let i = 0; i <= occurrence; i++)
    start = index.text.indexOf(text, start + 1);
  return rangeAt(index, start, start + text.length)!;
}
beforeEach(() => {
  document.body.innerHTML = "";
});
describe("safe text anchors", () => {
  it("restores when indentation and whitespace change, including across text nodes", () => {
    document.body.innerHTML =
      "<p>  A useful \n   <strong>idea</strong> to remember.  </p>";
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    const anchor = captureAnchor(range, false)!;
    expect(anchor.exactText).toBe("A useful idea to remember.");
    document.body.innerHTML = "<p>A useful <em>idea</em>   to remember.</p>";
    expect(quoteText(resolveAnchor(anchor)!.toString())).toBe(
      "A useful idea to remember.",
    );
  });
  it("captures a selection across inline elements and restores after markup changes", () => {
    document.body.innerHTML =
      "<p>A useful <strong>idea to</strong> remember today.</p>";
    const anchor = captureAnchor(select("useful idea to remember"), false)!;
    expect(anchor.exactText).toBe("useful idea to remember");
    expect(anchor.position).toEqual({ start: 2, end: 25 });
    document.body.innerHTML =
      "<header>New navigation</header><article><p>A useful <em>idea</em> to remember today.</p></article>";
    expect(resolveAnchor(anchor)?.toString()).toBe(anchor.exactText);
  });
  it("disambiguates identical passages using surrounding text after text is inserted", () => {
    document.body.innerHTML =
      "<p>First context: repeated sentence. First tail.</p><p>Other context: repeated sentence. Other tail.</p>";
    const anchor = captureAnchor(select("repeated sentence.", 1), false)!;
    document.body.prepend(document.createTextNode("Inserted heading"));
    const range = resolveAnchor(anchor)!;
    expect(range.startContainer.parentElement?.textContent).toContain(
      "Other context",
    );
  });
  it("refuses identical candidates even when a saved offset points to one of them", () => {
    const text = "A".repeat(80) + "identical passage" + "B".repeat(80);
    document.body.innerHTML = `<p>${text}</p><p>${text}</p>`;
    const anchor = captureAnchor(select("identical passage"), false)!;
    expect(resolveAnchor(anchor)).toBeNull();
  });
  it("does not jump to a surviving duplicate after the original passage disappears", () => {
    document.body.innerHTML =
      "<p>Original setting. A repeated idea. Original ending.</p><p>Different setting. A repeated idea. Different ending.</p>";
    const anchor = captureAnchor(select("A repeated idea.", 0), false)!;
    document.body.firstElementChild!.remove();
    expect(resolveAnchor(anchor)).toBeNull();
  });
  it("keeps a missing quote unresolved and restores it when asynchronously inserted", () => {
    document.body.innerHTML = "<p>Keep this passage.</p>";
    const anchor = captureAnchor(select("this passage"), false)!;
    document.body.innerHTML = "<p>Loading</p>";
    expect(resolveAnchor(anchor)).toBeNull();
    document.body.innerHTML = "<div><p>Keep this passage.</p></div>";
    expect(resolveAnchor(anchor)?.toString()).toBe("this passage");
  });
  it("restores the right ChatGPT message when messages are reordered", () => {
    document.body.innerHTML =
      '<div data-message-id="one" data-message-author-role="assistant">The same idea.</div><div data-message-id="two" data-message-author-role="assistant">The same idea.</div>';
    const anchor = captureAnchor(select("same idea", 1), true)!;
    expect(anchor.messageContext?.id).toBe("two");
    document.body.prepend(document.body.lastElementChild!);
    expect(
      resolveAnchor(anchor)?.startContainer.parentElement?.getAttribute(
        "data-message-id",
      ),
    ).toBe("two");
    document.querySelector('[data-message-id="two"]')!.remove();
    expect(resolveAnchor(anchor)).toBeNull();
  });
  it("uses a fingerprint when stable message IDs are absent", () => {
    document.body.innerHTML =
      '<div data-message-author-role="user">My thought.</div><div data-message-author-role="assistant">Your idea.</div>';
    const anchor = captureAnchor(select("Your idea"), true)!;
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div data-message-author-role="assistant">An earlier answer.</div>',
    );
    expect(resolveAnchor(anchor)?.toString()).toBe("Your idea");
  });
  it("does not index fields, composers, hidden content, or extension UI", () => {
    document.body.innerHTML =
      '<p>Readable</p><input value="secret"><textarea>Private</textarea><div contenteditable="true">Draft</div><div role="textbox">Composer</div><div hidden>Hidden</div><div style="display:none">Invisible</div><div data-highlight-vault-ui>Toolbar</div><script>bad()</script>';
    expect(indexText(document.body).text).toBe("Readable");
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("[contenteditable]")!);
    expect(captureAnchor(range, false)).toBeNull();
  });
  it("refuses ChatGPT selections outside messages or across message boundaries", () => {
    document.body.innerHTML =
      '<nav>Navigation</nav><div data-message-id="a">First message.</div><div data-message-id="b">Second message.</div>';
    expect(captureAnchor(select("Navigation"), true)).toBeNull();
    expect(captureAnchor(select("message.Second"), true)).toBeNull();
  });
  it("detects partial overlap but permits adjacent and separate selections", () => {
    document.body.innerHTML = "<p>abcdefghij</p>";
    expect(overlaps(select("abcde"), select("defg"))).toBe(true);
    expect(overlaps(select("abcde"), select("abcde"))).toBe(true);
    expect(overlaps(select("abc"), select("def"))).toBe(false);
    expect(overlaps(select("ab"), select("ij"))).toBe(false);
  });
});
