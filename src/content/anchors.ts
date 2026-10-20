import type { Anchor, MessageContext } from "../shared/model";

const EXCLUDED =
  'script,style,noscript,template,input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-highlight-vault-ui],[hidden],[aria-hidden="true"]';
export function excluded(node: Node): boolean {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return !element || !!element.closest(EXCLUDED);
}
export interface TextIndex {
  text: string;
  nodes: { node: Text; start: number; end: number }[];
  starts: Uint32Array;
  ends: Uint32Array;
}
export function indexText(root: Element): TextIndex {
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  // Reject whole excluded branches rather than testing their text descendants.
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (excluded(node)) return NodeFilter.FILTER_REJECT;
        if (node.nodeType === Node.ELEMENT_NODE) {
          const style = getComputedStyle(node as Element);
          return style.display === "none" || style.visibility === "hidden"
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  // Canonical whitespace makes indentation and line wrapping irrelevant. Keep
  // a compact map back to raw UTF-16 offsets so rendering still targets the DOM.
  const raw = text;
  const starts = new Uint32Array(raw.length);
  const ends = new Uint32Array(raw.length);
  const parts: string[] = [];
  let length = 0;
  for (const match of raw.matchAll(/\s+|\S+/g)) {
    const offset = match.index!;
    if (/^\s/.test(match[0])) {
      parts.push(" ");
      starts[length] = offset;
      ends[length++] = offset + match[0].length;
    } else {
      parts.push(match[0]);
      for (let i = 0; i < match[0].length; i++) {
        starts[length] = offset + i;
        ends[length++] = offset + i + 1;
      }
    }
  }
  return {
    text: parts.join(""),
    nodes,
    starts: starts.subarray(0, length),
    ends: ends.subarray(0, length),
  };
}
function pathOf(node: Node, root: Node): number[] {
  const path: number[] = [];
  while (node !== root && node.parentNode) {
    path.unshift(
      Array.prototype.indexOf.call(node.parentNode.childNodes, node),
    );
    node = node.parentNode;
  }
  return path;
}
function follow(root: Node, path: number[]): Node | null {
  let node: Node | undefined = root;
  for (const i of path) node = node?.childNodes[i];
  return node || null;
}
function offsets(
  range: Range,
  root: Element,
  index: TextIndex,
): { start: number; end: number } | null {
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(root);
  after.setEnd(range.endContainer, range.endOffset);
  // Range.toString includes excluded text, so count only indexed nodes.
  function count(boundary: Range) {
    let total = 0;
    for (const entry of index.nodes) {
      if (boundary.comparePoint(entry.node, 0) > 0) break;
      if (boundary.comparePoint(entry.node, entry.node.length) <= 0)
        total += entry.node.length;
      else if (entry.node === boundary.endContainer)
        total += boundary.endOffset;
    }
    return total;
  }
  const rawStart = count(before),
    rawEnd = count(after);
  function lowerBound(array: Uint32Array, value: number, inclusive: boolean) {
    let lo = 0,
      hi = array.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (inclusive ? array[mid] <= value : array[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  let start = lowerBound(index.ends, rawStart, true),
    end = lowerBound(index.starts, rawEnd, false);
  while (start < end && index.text[start] === " ") start++;
  while (end > start && index.text[end - 1] === " ") end--;
  return end > start ? { start, end } : null;
}
export function rangeAt(
  index: TextIndex,
  start: number,
  end: number,
): Range | null {
  if (end <= start || start < 0 || end > index.text.length) return null;
  start = index.starts[start];
  end = index.ends[end - 1];
  const first = index.nodes.find((n) => start >= n.start && start < n.end);
  const last = index.nodes.find((n) => end > n.start && end <= n.end);
  if (!first || !last || end <= start) return null;
  const range = document.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}
function messageElement(node: Node): Element | null {
  const element = node instanceof Element ? node : node.parentElement;
  return (
    element?.closest("[data-message-id]") ||
    element?.closest("[data-message-author-role]") ||
    null
  );
}
export function quoteText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
export function captureAnchor(range: Range, chat: boolean): Anchor | null {
  if (excluded(range.startContainer) || excluded(range.endContainer))
    return null;
  const message = chat ? messageElement(range.startContainer) : null;
  // Chat highlights belong to one message, never navigation or the composer.
  if (chat && (!message || messageElement(range.endContainer) !== message))
    return null;
  const root = message || document.body;
  const index = indexText(root);
  const position = offsets(range, root, index);
  if (
    !position ||
    index.text.slice(position.start, position.end) !==
      quoteText(range.toString())
  )
    return null;
  const messageContext: MessageContext | null = message
    ? {
        id:
          message.getAttribute("data-message-id") ||
          message
            .closest("[data-message-id]")
            ?.getAttribute("data-message-id") ||
          null,
        role:
          message.getAttribute("data-message-author-role") ||
          message
            .querySelector("[data-message-author-role]")
            ?.getAttribute("data-message-author-role") ||
          null,
        fingerprint: index.text.trimStart().slice(0, 160),
      }
    : null;
  return {
    exactText: index.text.slice(position.start, position.end),
    prefix: index.text.slice(Math.max(0, position.start - 64), position.start),
    suffix: index.text.slice(position.end, position.end + 64),
    position,
    messageContext,
    domAnchor: {
      startPath: pathOf(range.startContainer, root),
      startOffset: range.startOffset,
      endPath: pathOf(range.endContainer, root),
      endOffset: range.endOffset,
      container: message ? "message" : "body",
    },
  };
}
function resolveRoot(anchor: Anchor): Element | null {
  const context = anchor.messageContext;
  if (!context) return document.body;
  const messages = [
    ...document.querySelectorAll(
      "[data-message-id], [data-message-author-role]",
    ),
  ];
  if (context.id) {
    const found = messages.filter(
      (el) => el.getAttribute("data-message-id") === context.id,
    );
    if (found.length === 1) return found[0];
    return null; // An edited or regenerated message must not fall back to a different message.
  }
  const candidates = messages.filter(
    (el) =>
      el.getAttribute("data-message-author-role") === context.role &&
      indexText(el).text.trimStart().startsWith(context.fingerprint),
  );
  return candidates.length === 1 ? candidates[0] : null;
}
export function resolveAnchor(
  anchor: Anchor,
  cache = new Map<Element, TextIndex>(),
): Range | null {
  const root = resolveRoot(anchor);
  if (!root || !anchor.exactText) return null;
  let index = cache.get(root);
  if (!index) {
    index = indexText(root);
    cache.set(root, index);
  }
  const matches: { start: number; score: number }[] = [];
  for (
    let start = index.text.indexOf(anchor.exactText);
    start !== -1;
    start = index.text.indexOf(anchor.exactText, start + 1)
  ) {
    const end = start + anchor.exactText.length;
    const prefix = index.text.slice(
      Math.max(0, start - anchor.prefix.length),
      start,
    );
    const suffix = index.text.slice(end, end + anchor.suffix.length);
    const score =
      (anchor.prefix.trim() && prefix === anchor.prefix ? 1 : 0) +
      (anchor.suffix.trim() && suffix === anchor.suffix ? 1 : 0);
    matches.push({ start, score });
  }
  matches.sort((a, b) => b.score - a.score);
  if (
    matches.length === 1 &&
    !anchor.messageContext?.id &&
    (anchor.prefix.trim() || anchor.suffix.trim()) &&
    matches[0].score === 0
  )
    return null;
  if (
    !matches.length ||
    (matches.length > 1 &&
      (matches[0].score === matches[1].score || matches[0].score === 0))
  )
    return null;
  const start = matches[0].start,
    end = start + anchor.exactText.length;
  // Try the saved structural location, but accept it only after quote disambiguation.
  const first = follow(root, anchor.domAnchor.startPath),
    last = follow(root, anchor.domAnchor.endPath);
  if (
    start === anchor.position.start &&
    end === anchor.position.end &&
    first &&
    last
  ) {
    try {
      const range = document.createRange();
      range.setStart(first, anchor.domAnchor.startOffset);
      range.setEnd(last, anchor.domAnchor.endOffset);
      const location = offsets(range, root, index);
      if (
        quoteText(range.toString()) === anchor.exactText &&
        location?.start === start
      )
        return range;
    } catch {
      /* The site replaced this structure. Use the verified quote offsets. */
    }
  }
  const range = rangeAt(index, start, end);
  return range && quoteText(range.toString()) === anchor.exactText
    ? range
    : null;
}
export function overlaps(a: Range, b: Range): boolean {
  return (
    a.compareBoundaryPoints(Range.END_TO_START, b) < 0 &&
    a.compareBoundaryPoints(Range.START_TO_END, b) > 0
  );
}
