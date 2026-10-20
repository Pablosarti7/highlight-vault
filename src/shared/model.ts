export const COLORS = {
  yellow: "#FACC15",
  green: "#86EFAC",
  blue: "#93C5FD",
  pink: "#F9A8D4",
} as const;
export type Color = keyof typeof COLORS;
export interface MessageContext {
  id: string | null;
  role: string | null;
  fingerprint: string;
}
export interface Anchor {
  exactText: string;
  prefix: string;
  suffix: string;
  position: { start: number; end: number };
  domAnchor: {
    startPath: number[];
    startOffset: number;
    endPath: number[];
    endOffset: number;
    container: string;
  };
  messageContext: MessageContext | null;
}
export interface SavedHighlight extends Anchor {
  id: string;
  pageUrl: string;
  pageKey: string;
  pageTitle: string;
  hostname: string;
  sourceType: "webpage" | "chatgpt";
  conversationId: string | null;
  color: Color;
  status: "active" | "unresolved";
  createdAt: string;
  updatedAt: string;
}
export type Request =
  | { type: "LIST"; pageKey?: string }
  | { type: "SAVE"; record: SavedHighlight }
  | { type: "RECOLOR"; id: string; color: Color }
  | { type: "DELETE"; id: string }
  | { type: "UNDO"; id: string }
  | { type: "CLEAR" }
  | { type: "JUMP_DONE" }
  | {
      type: "STATUS";
      pageKey: string;
      statuses: Record<string, SavedHighlight["status"]>;
    }
  | { type: "ACTIVATE"; tabId: number }
  | { type: "DISABLE_SITE"; pattern: string }
  | { type: "VISIT"; id: string };
export type Reply<T = unknown> =
  { ok: true; data: T } | { ok: false; error: string };
export async function request<T = unknown>(message: Request): Promise<T> {
  const reply: Reply<T> = await chrome.runtime.sendMessage(message);
  if (!reply?.ok)
    throw new Error(
      reply?.error ||
        "The extension is unavailable. Reload this page and try again.",
    );
  return reply.data;
}
export function pageIdentity(input: string): string {
  const url = new URL(input);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^utm_/i.test(key) ||
      /^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key)
    )
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}
export function sitePattern(input?: string): string | null {
  try {
    const url = new URL(input || "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.hostname === "chromewebstore.google.com" ||
      (url.hostname === "chrome.google.com" &&
        url.pathname.startsWith("/webstore"))
    )
      return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}
export function isChatGPT(input: string): boolean {
  return new URL(input).hostname === "chatgpt.com";
}
export function conversationId(input: string): string | null {
  return isChatGPT(input)
    ? new URL(input).pathname.match(/\/c\/([^/]+)/)?.[1] || null
    : null;
}
export const RECORD_PREFIX = "highlight:";
