import {
  COLORS,
  conversationId,
  isChatGPT,
  pageIdentity,
  request,
  type Color,
  type SavedHighlight,
} from "../shared/model";
import {
  captureAnchor,
  quoteText,
  excluded,
  overlaps,
  resolveAnchor,
} from "./anchors";

declare global {
  interface Window {
    __highlightVault?: { destroy: () => void };
  }
}
// Re-injection after activation replaces the old instance and its listeners.
window.__highlightVault?.destroy();
if ("highlights" in CSS && "Highlight" in window) start();
function start() {
  const abort = new AbortController();
  const signal = abort.signal;
  const host = document.createElement("div");
  host.dataset.highlightVaultUi = "";
  host.style.cssText =
    "all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important";
  const shadow = host.attachShadow({ mode: "open" });
  const toolbarSheet = new CSSStyleSheet();
  toolbarSheet.replaceSync(
    `:host{color-scheme:light}*{box-sizing:border-box}.toolbar{position:fixed;display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid #e4e3dd;border-radius:99px;background:#fffefa;box-shadow:0 6px 24px #171a2030;font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#343c36}.toolbar[hidden],.toast[hidden]{display:none}.dot{width:27px;height:27px;padding:0;border:1px solid #0001;border-radius:50%;cursor:pointer}.dot:hover{transform:scale(1.13)}button:focus-visible{outline:3px solid #243e32;outline-offset:3px}.close{border:0;border-left:1px solid #e7e5df;padding:2px 2px 2px 9px;background:none;color:#697169;cursor:pointer;font-size:20px}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#253f32;color:#fff;padding:12px 18px;max-width:calc(100vw - 32px);border-radius:12px;font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 6px 24px #0002}`,
  );
  shadow.adoptedStyleSheets = [toolbarSheet];
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.hidden = true;
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Highlight selected text");
  toolbar.setAttribute("aria-keyshortcuts", "Alt+Shift+H");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  shadow.append(toolbar, toast);
  document.documentElement.append(host);
  const highlightStyle = new CSSStyleSheet();
  highlightStyle.replaceSync(
    Object.entries(COLORS)
      .map(
        ([name, color]) =>
          `::highlight(highlight-vault-${name}){background-color:${color};color:#17231b;text-decoration:none}`,
      )
      .join("\n") +
      "::highlight(highlight-vault-focus){background-color:#facc15;color:#17231b;text-decoration:underline}",
  );
  document.adoptedStyleSheets = [
    ...document.adoptedStyleSheets,
    highlightStyle,
  ];
  const registry = (CSS as unknown as { highlights: Map<string, unknown> })
    .highlights;
  const HighlightClass = (
    window as unknown as { Highlight: new (...ranges: Range[]) => unknown }
  ).Highlight;
  let selected: Range | null = null,
    currentKey = pageIdentity(location.href),
    records: SavedHighlight[] = [];
  const liveAnchors = new Map<string, Range>();
  let rendered = new Map<string, Range>(),
    selectionTimer = 0,
    restoreTimer = 0,
    toastTimer = 0,
    jumpTimer = 0;
  let running = true,
    generation = 0,
    saving = false,
    pointerDown = false,
    needsReload = false;
  let pendingJump: { id: string; expires: number } | null = null;
  const dismiss = () => {
    clearTimeout(selectionTimer);
    toolbar.hidden = true;
    selected = null;
  };
  function notify(message: string) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }
  function clearPaint() {
    for (const name of Object.keys(COLORS))
      registry.delete("highlight-vault-" + name);
    registry.delete("highlight-vault-focus");
    rendered.clear();
  }
  function jump() {
    if (!pendingJump) return;
    if (Date.now() > pendingJump.expires) {
      pendingJump = null;
      return;
    }
    const range = rendered.get(pendingJump.id);
    if (!range) return;
    range.startContainer.parentElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    registry.set("highlight-vault-focus", new HighlightClass(range));
    clearTimeout(jumpTimer);
    jumpTimer = window.setTimeout(
      () => registry.delete("highlight-vault-focus"),
      1800,
    );
    pendingJump = null;
    void request({ type: "JUMP_DONE" }).catch(() => undefined);
  }
  async function restore(reload = false) {
    const version = ++generation;
    try {
      const loaded = reload
        ? await request<SavedHighlight[]>({ type: "LIST", pageKey: currentKey })
        : records;
      if (!running || version !== generation) return;
      records = loaded;
      clearPaint();
      const cache = new Map();
      const ranges: Record<Color, Range[]> = {
        yellow: [],
        green: [],
        blue: [],
        pink: [],
      };
      const statuses: Record<string, SavedHighlight["status"]> = {};
      for (const record of records) {
        const live = liveAnchors.get(record.id);
        const range =
          live?.startContainer.isConnected &&
          live.endContainer.isConnected &&
          quoteText(live.toString()) === record.exactText
            ? live
            : resolveAnchor(record, cache);
        if (range) liveAnchors.set(record.id, range);
        else liveAnchors.delete(record.id);
        statuses[record.id] = range ? "active" : "unresolved";
        if (range) {
          ranges[record.color].push(range);
          rendered.set(record.id, range);
        }
      }
      for (const [color, list] of Object.entries(ranges))
        registry.set("highlight-vault-" + color, new HighlightClass(...list));
      if (records.length)
        await request({ type: "STATUS", pageKey: currentKey, statuses });
      jump();
    } catch (error) {
      if (running && reload)
        notify(
          error instanceof Error
            ? error.message
            : "Could not load your highlights.",
        );
    }
  }
  function schedule(reload = false) {
    needsReload ||= reload;
    clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(() => {
      const refresh = needsReload;
      needsReload = false;
      void restore(refresh);
    }, 300);
  }
  function selectionChanged() {
    if (saving || pointerDown || shadow.activeElement) return;
    clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(showSelection, 100);
  }
  function showSelection() {
    const selection = window.getSelection();
    if (
      (document.activeElement && excluded(document.activeElement)) ||
      !selection ||
      selection.isCollapsed ||
      !selection.rangeCount ||
      !selection.toString().trim()
    ) {
      dismiss();
      return;
    }
    const range = selection.getRangeAt(0);
    if (
      excluded(range.startContainer) ||
      excluded(range.endContainer) ||
      !captureAnchor(range, isChatGPT(location.href))
    ) {
      dismiss();
      return;
    }
    selected = range.cloneRange();
    toolbar.hidden = false;
    const rect = range.getBoundingClientRect();
    const width = toolbar.offsetWidth,
      height = toolbar.offsetHeight;
    toolbar.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    toolbar.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, rect.top > height + 12 ? rect.top - height - 10 : rect.bottom + 10))}px`;
  }
  async function save(color: Color) {
    if (!selected || saving) return;
    saving = true;
    try {
      const range = selected.cloneRange();
      const anchor = captureAnchor(range, isChatGPT(location.href));
      if (
        !anchor ||
        !range.startContainer.isConnected ||
        pageIdentity(location.href) !== currentKey
      )
        throw new Error("The page changed. Select the text again.");
      if ([...rendered.values()].some((other) => overlaps(range, other)))
        throw new Error(
          "This overlaps a saved highlight. Choose a separate passage.",
        );
      const now = new Date().toISOString();
      const record: SavedHighlight = {
        ...anchor,
        id: crypto.randomUUID(),
        pageUrl: location.href,
        pageKey: currentKey,
        pageTitle: document.title,
        hostname: location.hostname,
        sourceType: isChatGPT(location.href) ? "chatgpt" : "webpage",
        conversationId: conversationId(location.href),
        color,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      await request({ type: "SAVE", record });
      // The user's explicit selection is authoritative in this document instance.
      liveAnchors.set(record.id, range);
      dismiss();
      window.getSelection()?.removeAllRanges();
      await restore(true);
      notify("Saved to your vault");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Could not save. Please try again.",
      );
    } finally {
      saving = false;
    }
  }
  for (const [color, hex] of Object.entries(COLORS)) {
    const button = document.createElement("button");
    button.className = "dot";
    button.style.background = hex;
    button.title = `Highlight ${color}`;
    button.setAttribute("aria-label", `Highlight ${color}`);
    button.addEventListener("pointerdown", (e) => e.preventDefault(), {
      signal,
    });
    button.addEventListener(
      "click",
      () => {
        void save(color as Color);
      },
      { signal },
    );
    toolbar.append(button);
  }
  const close = document.createElement("button");
  close.className = "close";
  close.textContent = "×";
  close.title = "Dismiss";
  close.setAttribute("aria-label", "Dismiss highlight toolbar");
  close.addEventListener("click", dismiss, { signal });
  toolbar.append(close);
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.composedPath().includes(host)) return;
      pointerDown = true;
      dismiss();
    },
    { signal },
  );
  document.addEventListener(
    "pointerup",
    () => {
      pointerDown = false;
      selectionChanged();
    },
    { signal },
  );
  document.addEventListener("selectionchange", selectionChanged, { signal });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        dismiss();
        if (shadow.activeElement instanceof HTMLElement)
          shadow.activeElement.blur();
      }
      if (e.altKey && e.shiftKey && e.code === "KeyH" && !toolbar.hidden) {
        e.preventDefault();
        toolbar.querySelector("button")?.focus();
      }
      if (
        e.composedPath().includes(host) &&
        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
      ) {
        e.preventDefault();
        const buttons = [...toolbar.querySelectorAll("button")];
        const i = buttons.indexOf(shadow.activeElement as HTMLButtonElement);
        buttons[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                buttons.length
        ].focus();
      }
    },
    { signal },
  );
  document.addEventListener("scroll", dismiss, {
    signal,
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", dismiss, { signal });
  const observer = new MutationObserver((changes) => {
    if (
      changes.some(
        (c) =>
          !host.contains(c.target) &&
          c.target !== host &&
          (c.type !== "childList" ||
            [...c.addedNodes, ...c.removedNodes].some((n) => n !== host)),
      )
    )
      schedule();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "data-message-id",
      "data-message-author-role",
      "hidden",
      "aria-hidden",
    ],
  });
  // Isolated-world history patches do not see a site's pushState. Poll only the URL.
  const navigation = window.setInterval(() => {
    const next = pageIdentity(location.href);
    if (next !== currentKey) {
      currentKey = next;
      records = [];
      liveAnchors.clear();
      generation++;
      clearPaint();
      dismiss();
      schedule(true);
    }
  }, 500);
  function onMessage(
    message: { type: string; id?: string },
    _sender: chrome.runtime.MessageSender,
    respond: (response: unknown) => void,
  ) {
    if (message.type === "REFRESH") {
      schedule(true);
      respond({ ok: true });
    }
    if (message.type === "DISABLE") {
      destroy();
      respond({ ok: true });
    }
    if (message.type === "SCROLL_TO" && message.id) {
      pendingJump = { id: message.id, expires: Date.now() + 30000 };
      jump();
      respond({ ok: true });
    }
  }
  chrome.runtime.onMessage.addListener(onMessage);
  function destroy() {
    running = false;
    generation++;
    abort.abort();
    observer.disconnect();
    clearInterval(navigation);
    [selectionTimer, restoreTimer, toastTimer, jumpTimer].forEach(clearTimeout);
    chrome.runtime.onMessage.removeListener(onMessage);
    clearPaint();
    liveAnchors.clear();
    host.remove();
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
      (sheet) => sheet !== highlightStyle,
    );
    delete window.__highlightVault;
  }
  window.__highlightVault = { destroy };
  void restore(true);
}
