import {
  COLORS,
  RECORD_PREFIX,
  pageIdentity,
  sitePattern,
  type Request,
  type SavedHighlight,
} from "../shared/model";

// Serialise all read/modify/write operations across tabs and extension views.
let queue = Promise.resolve<unknown>(undefined);
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}
const key = (id: string) => RECORD_PREFIX + id;
async function list(): Promise<SavedHighlight[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(RECORD_PREFIX))
    .map(([, v]) => v as SavedHighlight)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function get(id: string): Promise<SavedHighlight> {
  const record = (await chrome.storage.local.get(key(id)))[key(id)];
  if (!record) throw new Error("This highlight is no longer saved.");
  return record as SavedHighlight;
}
async function syncSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  const matches = origins.filter((origin) => /^https?:\/\//.test(origin));
  const scripts = await chrome.scripting.getRegisteredContentScripts({
    ids: ["vault-sites"],
  });
  if (matches.length) {
    const config: chrome.scripting.RegisteredContentScript = {
      id: "vault-sites",
      matches,
      js: ["content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
    };
    if (scripts.length) await chrome.scripting.updateContentScripts([config]);
    else await chrome.scripting.registerContentScripts([config]);
  } else if (scripts.length)
    await chrome.scripting.unregisterContentScripts({ ids: ["vault-sites"] });
}
async function inject(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}
async function stopTabs(patterns?: string[]) {
  const tabs = await chrome.tabs.query(
    patterns?.length ? { url: patterns } : {},
  );
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id)
      .map((tab) => chrome.tabs.sendMessage(tab.id!, { type: "DISABLE" })),
  );
}
async function visit(id: string) {
  const record = await get(id);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    try {
      return !!tab.url && pageIdentity(tab.url) === record.pageKey;
    } catch {
      return false;
    }
  });
  let target: chrome.tabs.Tab | undefined;
  if (existing?.id) {
    target = await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else target = await chrome.tabs.create({ url: record.pageUrl });
  // Keep a pending jump across worker suspension and delayed page rendering.
  if (target?.id) {
    await chrome.storage.session.set({ ["jump:" + target.id]: id });
    try {
      await chrome.tabs.sendMessage(target.id, { type: "SCROLL_TO", id });
    } catch {
      /* Content script will request this on load. */
    }
  }
}
async function handle(message: Request, sender: chrome.runtime.MessageSender) {
  const fromPage = !sender.url?.startsWith(chrome.runtime.getURL(""));
  if (fromPage && !sender.tab)
    throw new Error("This action requires a website tab.");
  const pageKey = fromPage && sender.url ? pageIdentity(sender.url) : null;
  if (fromPage) {
    if (
      sender.frameId !== 0 ||
      !sender.url ||
      !sitePattern(sender.url) ||
      !(await chrome.permissions.contains({
        origins: [sitePattern(sender.url)!],
      }))
    )
      throw new Error("Highlighting is not enabled on this site.");
    if (!["LIST", "SAVE", "STATUS", "JUMP_DONE"].includes(message.type))
      throw new Error(
        "This action is available only in the extension library.",
      );
  }
  switch (message.type) {
    case "LIST": {
      if (fromPage && message.pageKey !== pageKey)
        throw new Error("Page changed. Please try again.");
      const records = await list();
      if (fromPage && sender.tab?.id) {
        const pending = (
          await chrome.storage.session.get("jump:" + sender.tab.id)
        )["jump:" + sender.tab.id];
        if (pending)
          void chrome.tabs
            .sendMessage(sender.tab.id, { type: "SCROLL_TO", id: pending })
            .catch(() => undefined);
      }
      return message.pageKey
        ? records.filter((r) => r.pageKey === message.pageKey)
        : records;
    }
    case "SAVE": {
      const r = message.record;
      if (
        !fromPage ||
        r.pageKey !== pageKey ||
        pageIdentity(r.pageUrl) !== pageKey ||
        !(r.color in COLORS) ||
        typeof r.exactText !== "string" ||
        !r.exactText.trim() ||
        r.exactText.length > 100000 ||
        !/^[\da-f-]{36}$/i.test(r.id)
      )
        throw new Error("This selection could not be saved.");
      if (
        (await list()).some(
          (other) =>
            other.pageKey === r.pageKey &&
            other.exactText === r.exactText &&
            JSON.stringify(other.messageContext) ===
              JSON.stringify(r.messageContext) &&
            other.position.start === r.position.start,
        )
      )
        throw new Error("This passage is already in your vault.");
      await chrome.storage.local.set({ [key(r.id)]: r });
      return r;
    }
    case "RECOLOR": {
      if (!(message.color in COLORS))
        throw new Error("Unknown highlight color.");
      const r = await get(message.id);
      r.color = message.color;
      r.updatedAt = new Date().toISOString();
      await chrome.storage.local.set({ [key(r.id)]: r });
      return null;
    }
    case "DELETE": {
      const r = await get(message.id);
      await chrome.storage.session.set({
        ["undo:" + r.id]: { record: r, expires: Date.now() + 30000 },
      });
      await chrome.storage.local.remove(key(message.id));
      return null;
    }
    case "UNDO": {
      const undoKey = "undo:" + message.id;
      const undo = (await chrome.storage.session.get(undoKey))[undoKey] as
        { record: SavedHighlight; expires: number } | undefined;
      if (!undo || undo.expires < Date.now())
        throw new Error("The undo period has ended.");
      await chrome.storage.local.set({ [key(message.id)]: undo.record });
      await chrome.storage.session.remove(undoKey);
      return null;
    }
    case "CLEAR": {
      const records = await list();
      await chrome.storage.local.remove(records.map((r) => key(r.id)));
      await chrome.storage.session.clear();
      return null;
    }
    case "JUMP_DONE":
      if (sender.tab?.id)
        await chrome.storage.session.remove("jump:" + sender.tab.id);
      return null;
    case "STATUS": {
      if (!fromPage || message.pageKey !== pageKey)
        throw new Error("Invalid status update.");
      const updates: Record<string, SavedHighlight> = {};
      for (const r of await list()) {
        const status = message.statuses[r.id];
        if (
          r.pageKey === pageKey &&
          (status === "active" || status === "unresolved") &&
          status !== r.status
        )
          updates[key(r.id)] = { ...r, status };
      }
      if (Object.keys(updates).length) await chrome.storage.local.set(updates);
      return null;
    }
    case "ACTIVATE": {
      const tab = await chrome.tabs.get(message.tabId);
      const pattern = sitePattern(tab.url);
      if (
        !pattern ||
        !(await chrome.permissions.contains({ origins: [pattern] }))
      )
        throw new Error("Website access was not granted.");
      await syncSites();
      const tabs = await chrome.tabs.query({ url: pattern });
      const results = await Promise.allSettled(
        tabs.filter((t) => t.id).map((t) => inject(t.id!)),
      );
      if (results.every((r) => r.status === "rejected"))
        throw new Error(
          "Chrome could not enable this page. Refresh it and try again.",
        );
      return null;
    }
    case "DISABLE_SITE":
      await stopTabs([message.pattern]);
      await chrome.permissions.remove({ origins: [message.pattern] });
      await syncSites();
      return null;
    case "VISIT":
      await visit(message.id);
      return null;
  }
  throw new Error("Unknown extension action.");
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  serial(() => handle(message, sender)).then(
    (data) => respond({ ok: true, data }),
    (error) =>
      respond({
        ok: false,
        error: error instanceof Error ? error.message : "Something went wrong.",
      }),
  );
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  void serial(async () => {
    await chrome.storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    await syncSites();
  });
});
chrome.runtime.onStartup.addListener(() => {
  void serial(syncSites);
});
chrome.permissions.onAdded.addListener(() => {
  void serial(syncSites);
});
chrome.permissions.onRemoved.addListener(() => {
  void serial(async () => {
    // Tab IDs remain available after access is revoked, but their URLs may not.
    await stopTabs();
    await syncSites();
    const { origins = [] } = await chrome.permissions.getAll();
    if (origins.length) {
      const tabs = await chrome.tabs.query({ url: origins });
      await Promise.allSettled(
        tabs.filter((tab) => tab.id).map((tab) => inject(tab.id!)),
      );
    }
  });
});
chrome.tabs.onRemoved.addListener((id) => {
  void chrome.storage.session.remove("jump:" + id);
});

// Content scripts cannot observe storage changes after access is restricted to
// trusted contexts. Send an explicit invalidation instead of exposing storage.
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area !== "local" ||
    !Object.keys(changes).some((k) => k.startsWith(RECORD_PREFIX))
  )
    return;
  void chrome.tabs
    .query({})
    .then((tabs) =>
      Promise.allSettled(
        tabs
          .filter((tab) => tab.id)
          .map((tab) => chrome.tabs.sendMessage(tab.id!, { type: "REFRESH" })),
      ),
    );
});
