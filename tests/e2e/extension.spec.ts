import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
let context: BrowserContext,
  worker: Worker,
  extensionId: string,
  server: Server,
  origin: string,
  folder: string,
  profile: string;
const fixture = path.resolve("tests/fixtures/article.html");
test.beforeAll(async () => {
  server = createServer(async (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(await readFile(fixture));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  folder = await mkdtemp(path.join(tmpdir(), "vault-build-"));
  profile = await mkdtemp(path.join(tmpdir(), "vault-profile-"));
  await cp(path.resolve("dist"), folder, { recursive: true });
  const manifest = JSON.parse(
    await readFile(path.join(folder, "manifest.json"), "utf8"),
  );
  // Grant only the local fixture host in the disposable test build. The release
  // manifest remains optional-only; Chrome's native permission prompt is manual QA.
  manifest.host_permissions = ["http://127.0.0.1/*", "https://chatgpt.com/*"];
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${folder}`,
      `--load-extension=${folder}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
});
test.afterAll(async () => {
  await context?.close();
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  if (folder) await rm(folder, { recursive: true, force: true });
  if (profile) await rm(profile, { recursive: true, force: true });
});
test.beforeEach(async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
  });
});
async function pageAndPanel() {
  const page = await context.newPage();
  await page.goto(origin + "/article");
  await worker.evaluate(async () => {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (!scripts.length)
      await chrome.scripting.registerContentScripts([
        {
          id: "vault-sites",
          matches: ["http://127.0.0.1/*"],
          js: ["content.js"],
          runAt: "document_idle",
        },
      ]);
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1/*" });
    for (const tab of tabs)
      if (tab.id)
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
  });
  await expect(
    page.locator("[data-highlight-vault-ui]").first(),
  ).toBeAttached();
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 390, height: 900 });
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  await panel.getByRole("tab", { name: /All highlights/ }).click();
  return { page, panel };
}
async function select(page: Page, selector: string, text?: string) {
  await page.locator(selector).evaluate((el, text) => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const range = document.createRange();
    if (text) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const pattern = text
          .split(/\s+/)
          .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("\\s+");
        const match = new RegExp(pattern).exec(node.textContent!);
        if (match) {
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          break;
        }
      }
    } else range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, text);
  await expect(
    page.getByRole("toolbar", { name: "Highlight selected text" }),
  ).toBeVisible();
}
async function count() {
  return worker.evaluate(
    async () =>
      Object.keys(await chrome.storage.local.get(null)).filter((k) =>
        k.startsWith("highlight:"),
      ).length,
  );
}
async function painted(page: Page, color = "yellow") {
  return page.evaluate(
    (color) =>
      (CSS as any).highlights.get("highlight-vault-" + color)?.size || 0,
    color,
  );
}

test("create, persist, search, recolor, revisit, delete and undo real highlights", async () => {
  const { page, panel } = await pageAndPanel();
  await select(
    page,
    "#first",
    "They begin as something small: a line in a book",
  );
  await page
    .getByRole("button", { name: "Highlight yellow", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  await expect.poll(() => painted(page)).toBe(1);
  await select(
    page,
    "#second",
    "Pay attention to what catches your attention.",
  );
  await page
    .getByRole("button", { name: "Highlight green", exact: true })
    .click();
  await expect.poll(count).toBe(2);
  await page.reload();
  await expect.poll(() => painted(page)).toBe(1);
  await expect.poll(() => painted(page, "green")).toBe(1);
  await expect(panel.locator(".highlight-card")).toHaveCount(2);
  await panel.getByRole("searchbox").fill("line in a book");
  await expect(panel.locator(".highlight-card")).toHaveCount(1);
  await panel.getByRole("button", { name: "Change to pink" }).click();
  await expect.poll(() => painted(page, "pink")).toBe(1);
  await expect.poll(() => painted(page)).toBe(0);
  await panel.getByRole("button", { name: "Revisit" }).click();
  await expect
    .poll(() => page.evaluate(() => location.href))
    .toContain("/article");
  await panel
    .getByRole("button", { name: "Delete highlight", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  await expect.poll(() => painted(page, "pink")).toBe(0);
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(count).toBe(2);
  await expect.poll(() => painted(page, "pink")).toBe(1);
  await panel.getByRole("searchbox").fill("");
  await page.screenshot({
    path: "test-results/article.png",
    animations: "disabled",
  });
  await panel.screenshot({
    path: "test-results/library.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.close();
  await panel.close();
});
test("dismissal saves nothing, editors are excluded, overlap is rejected", async () => {
  const { page, panel } = await pageAndPanel();
  await select(page, "#first");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar")).toBeHidden();
  await expect.poll(count).toBe(0);
  await page.locator("textarea").selectText();
  await page.waitForTimeout(200);
  await expect(page.getByRole("toolbar")).toBeHidden();
  await select(page, "#first", "The best ideas rarely arrive fully formed.");
  await page
    .getByRole("button", { name: "Highlight blue", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  await select(page, "#first", "best ideas rarely arrive");
  await page
    .getByRole("button", { name: "Highlight pink", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("overlaps");
  expect(await count()).toBe(1);
  await page.close();
  await panel.close();
});
test("missing text stays saved and resolves when the content returns; SPA navigation clears old paint", async () => {
  const { page, panel } = await pageAndPanel();
  await select(page, "#second");
  await page
    .getByRole("button", { name: "Highlight yellow", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  const original = await page.locator("#second").innerText();
  await page
    .locator("#second")
    .evaluate((el) => (el.textContent = "The response was regenerated."));
  await expect(panel.locator(".unresolved")).toBeVisible();
  expect(await count()).toBe(1);
  await expect.poll(() => painted(page)).toBe(0);
  await page
    .locator("#second")
    .evaluate((el, text) => (el.textContent = text), original);
  await expect.poll(() => painted(page)).toBe(1);
  await page.evaluate(() => history.pushState({}, "", "/different"));
  await expect.poll(() => painted(page)).toBe(0);
  await page.evaluate(() => history.pushState({}, "", "/article"));
  await expect.poll(() => painted(page)).toBe(1);
  await page.close();
  await panel.close();
});
test("site disable cleans up the page and permission denial is explained", async () => {
  const { page, panel } = await pageAndPanel();
  await select(page, "#third");
  await page
    .getByRole("button", { name: "Highlight yellow", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1/*" });
    for (const tab of tabs)
      if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: "DISABLE" });
  });
  await expect(page.locator("[data-highlight-vault-ui]")).toHaveCount(0);
  expect(await count()).toBe(1);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // Load the popup with its API stubs installed before React initializes.
  await popup.addInitScript(() => {
    chrome.tabs.query = async () =>
      [
        { id: 123, windowId: 1, url: "https://example.com/" },
      ] as chrome.tabs.Tab[];
    chrome.permissions.contains = async () => false;
    chrome.permissions.request = async () => false;
  });
  await popup.reload();
  await popup
    .getByRole("button", {
      name: "Enable highlighting on this site",
      exact: true,
    })
    .click();
  await expect(popup.getByRole("alert")).toContainText("Access was declined");
  await popup.screenshot({ path: "test-results/popup.png" });
  await popup.close();
  await page.close();
  await panel.close();
});

test("ChatGPT fixtures preserve message identity through rerendering and conversation navigation", async () => {
  const page = await context.newPage();
  const html =
    '<!doctype html><title>Conversation fixture</title><main><div data-message-id="user-1" data-message-author-role="user"><p id="question">Remember the useful parts.</p></div><div data-message-id="answer-1" data-message-author-role="assistant"><p id="answer">Remember the useful parts.</p></div></main><div contenteditable="true" role="textbox">Private composer</div>';
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("https://chatgpt.com/c/test-one");
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
    for (const tab of tabs)
      if (tab.id)
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
  });
  await select(page, "#answer", "the useful parts.");
  await page
    .getByRole("button", { name: "Highlight pink", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  await expect.poll(() => painted(page, "pink")).toBe(1);
  const record = await worker.evaluate(
    async () =>
      Object.entries(await chrome.storage.local.get(null)).find(([key]) =>
        key.startsWith("highlight:"),
      )?.[1] as any,
  );
  expect(record.messageContext.id).toBe("answer-1");
  expect(record.conversationId).toBe("test-one");
  await page.locator('[data-message-id="answer-1"]').evaluate((el) => {
    el.innerHTML =
      '<section><p id="answer">Remember <strong>the useful parts.</strong></p></section>';
  });
  await expect.poll(() => painted(page, "pink")).toBe(1);
  await page.evaluate(() => history.pushState({}, "", "/c/test-two"));
  await expect.poll(() => painted(page, "pink")).toBe(0);
  await page.evaluate(() => history.pushState({}, "", "/c/test-one"));
  await expect.poll(() => painted(page, "pink")).toBe(1);
  await page
    .locator('[data-message-id="answer-1"]')
    .evaluate((el) => el.remove());
  await expect.poll(() => painted(page, "pink")).toBe(0);
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const records = Object.entries(await chrome.storage.local.get(null));
        return (records.find(([k]) => k.startsWith("highlight:"))?.[1] as any)
          ?.status;
      }),
    )
    .toBe("unresolved");
  expect(await count()).toBe(1);
  await page.close();
});

test("keyboard toolbar works on pages with strict style CSP", async () => {
  const { page, panel } = await pageAndPanel();
  await page.route("**/strict", async (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "Content-Security-Policy": "style-src 'none'" },
      body: await readFile(fixture, "utf8"),
    }),
  );
  await page.goto(origin + "/strict");
  await select(page, "#first", "The best ideas rarely arrive fully formed.");
  const toolbar = page.getByRole("toolbar", {
    name: "Highlight selected text",
  });
  expect(
    await toolbar.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(255, 254, 250)");
  await page.keyboard.press("Alt+Shift+KeyH");
  await expect(
    page.getByRole("button", { name: "Highlight yellow", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Highlight green", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(count).toBe(1);
  await expect.poll(() => painted(page, "green")).toBe(1);
  await page.close();
  await panel.close();
});

test("local highlights and automatic registration survive a full test-browser restart", async () => {
  const { page, panel } = await pageAndPanel();
  await select(page, "#third");
  await page
    .getByRole("button", { name: "Highlight blue", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  await page.close();
  await panel.close();
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${folder}`,
      `--load-extension=${folder}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const reopened = await context.newPage();
  await reopened.goto(origin + "/article");
  await expect.poll(() => painted(reopened, "blue")).toBe(1);
  expect(await count()).toBe(1);
  await reopened.close();
});

test("an explicitly selected ambiguous duplicate paints now and stays unresolved after reload", async () => {
  const { page, panel } = await pageAndPanel();
  const repeated = "A".repeat(80) + "same passage" + "B".repeat(80);
  await page.route("**/duplicates", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><meta charset="utf-8"><title>Duplicate text</title><p id="one">${repeated}</p><p id="two">${repeated}</p>`,
    }),
  );
  await page.goto(origin + "/duplicates");
  await select(page, "#two", "same passage");
  await page
    .getByRole("button", { name: "Highlight yellow", exact: true })
    .click();
  await expect.poll(count).toBe(1);
  await expect.poll(() => painted(page)).toBe(1);
  await page.reload();
  await expect(panel.locator(".unresolved")).toBeVisible();
  await expect.poll(() => painted(page)).toBe(0);
  expect(await count()).toBe(1);
  await page.close();
  await panel.close();
});

test("two tabs keep independent saves and both update after recoloring", async () => {
  const { page, panel } = await pageAndPanel();
  const other = await context.newPage();
  await other.goto(origin + "/article");
  await select(page, "#first", "The best ideas rarely arrive fully formed.");
  await page
    .getByRole("button", { name: "Highlight yellow", exact: true })
    .click();
  await select(other, "#third");
  await other
    .getByRole("button", { name: "Highlight blue", exact: true })
    .click();
  await expect.poll(count).toBe(2);
  await expect.poll(() => painted(page, "blue")).toBe(1);
  await expect.poll(() => painted(other)).toBe(1);
  await panel.getByRole("searchbox").fill("best ideas");
  await panel.getByRole("button", { name: "Change to green" }).click();
  await expect.poll(() => painted(page, "green")).toBe(1);
  await expect.poll(() => painted(other, "green")).toBe(1);
  await panel
    .getByRole("button", { name: "Privacy and site settings" })
    .click();
  await panel
    .getByRole("button", { name: "Clear all highlights", exact: true })
    .click();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await count()).toBe(2);
  await panel
    .getByRole("button", { name: "Clear all highlights", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Delete all highlights", exact: true })
    .click();
  await expect.poll(count).toBe(0);
  await expect.poll(() => painted(page, "green")).toBe(0);
  await expect.poll(() => painted(other, "blue")).toBe(0);
  await page.close();
  await other.close();
  await panel.close();
});
