import { describe, expect, it } from "vitest";
import { conversationId, pageIdentity, sitePattern } from "../src/shared/model";
describe("page identity and permissions", () => {
  it("drops known tracking parameters while preserving document identifiers", () => {
    expect(
      pageIdentity(
        "https://example.com/read?id=12&utm_source=email&gclid=abc#section",
      ),
    ).toBe("https://example.com/read?id=12");
    expect(pageIdentity("https://example.com/read?id=13")).not.toBe(
      pageIdentity("https://example.com/read?id=12"),
    );
    expect(pageIdentity("https://example.com/?b=2&a=1")).toBe(
      pageIdentity("https://example.com/?a=1&b=2"),
    );
  });
  it("requests only one host and scheme, and rejects restricted pages", () => {
    expect(sitePattern("https://chatgpt.com/c/abc")).toBe(
      "https://chatgpt.com/*",
    );
    expect(sitePattern("http://localhost:8765/test")).toBe(
      "http://localhost/*",
    );
    expect(sitePattern("chrome://extensions")).toBeNull();
    expect(sitePattern("file:///a")).toBeNull();
    expect(
      sitePattern("https://chromewebstore.google.com/detail/foo"),
    ).toBeNull();
  });
  it("identifies conversation URLs including project paths", () => {
    expect(conversationId("https://chatgpt.com/c/abc")).toBe("abc");
    expect(conversationId("https://chatgpt.com/g/project/c/def")).toBe("def");
    expect(conversationId("https://example.com/c/abc")).toBeNull();
  });
});
