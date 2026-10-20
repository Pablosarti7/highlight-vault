import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  COLORS,
  RECORD_PREFIX,
  pageIdentity,
  request,
  sitePattern,
  type Color,
  type SavedHighlight,
} from "../shared/model";
import { Header, Icon, errorMessage } from "./common";
import "./styles.css";
function Panel() {
  const [records, setRecords] = useState<SavedHighlight[]>([]),
    [tab, setTab] = useState<chrome.tabs.Tab>(),
    [scope, setScope] = useState<"page" | "all">("page");
  const [query, setQuery] = useState(""),
    [color, setColor] = useState<Color | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [undo, setUndo] = useState<{ id: string; expires: number } | null>(null),
    [confirmClear, setConfirmClear] = useState(false),
    [settings, setSettings] = useState(false),
    [sites, setSites] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setRecords(await request<SavedHighlight[]>({ type: "LIST" }));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function active() {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    setTab(t);
  }
  async function loadSites() {
    setSites((await chrome.permissions.getAll()).origins || []);
  }
  useEffect(() => {
    void load();
    void active();
    void loadSites();
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(
          event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        const input =
          document.querySelector<HTMLInputElement>("input[type=search]");
        if (input) {
          event.preventDefault();
          input.focus();
        }
      }
    };
    document.addEventListener("keydown", shortcut);
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (
        area === "local" &&
        Object.keys(changes).some((k) => k.startsWith(RECORD_PREFIX))
      )
        void load();
    };
    const activated = () => {
      void active();
    };
    const updated = (_id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (info.url || info.status === "complete") void active();
    };
    const permissions = () => {
      void loadSites();
    };
    chrome.storage.onChanged.addListener(changed);
    chrome.tabs.onActivated.addListener(activated);
    chrome.tabs.onUpdated.addListener(updated);
    chrome.permissions.onAdded.addListener(permissions);
    chrome.permissions.onRemoved.addListener(permissions);
    return () => {
      document.removeEventListener("keydown", shortcut);
      chrome.storage.onChanged.removeListener(changed);
      chrome.tabs.onActivated.removeListener(activated);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.permissions.onAdded.removeListener(permissions);
      chrome.permissions.onRemoved.removeListener(permissions);
    };
  }, []);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);
  async function act(work: () => Promise<unknown>) {
    setError("");
    try {
      await work();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function enable() {
    const pattern = sitePattern(tab?.url);
    if (!pattern || !tab?.id) return;
    setBusy(true);
    try {
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) {
        setError("Website access was declined. Nothing was enabled.");
        return;
      }
      await request({ type: "ACTIVATE", tabId: tab.id });
      await loadSites();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const pageKey =
    tab?.url && sitePattern(tab.url) ? pageIdentity(tab.url) : null;
  const pageRecords = records.filter((r) => r.pageKey === pageKey);
  const scoped = scope === "page" ? pageRecords : records;
  const filtered = scoped.filter(
    (r) =>
      (!color || r.color === color) &&
      `${r.exactText} ${r.pageTitle} ${r.hostname}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase().trim()),
  );
  const enabled =
    !!sitePattern(tab?.url) && sites.includes(sitePattern(tab?.url)!);
  return (
    <div className="panel">
      <Header>
        <button
          className={"icon-button " + (settings ? "selected" : "")}
          title="Privacy and site settings"
          aria-label="Privacy and site settings"
          aria-expanded={settings}
          onClick={() => setSettings(!settings)}
        >
          <Icon name="shield" />
        </button>
      </Header>
      <main>
        {settings ? (
          <section className="settings">
            <div className="eyebrow">YOUR VAULT, YOUR RULES</div>
            <h2>Private by default.</h2>
            <p>
              Your passages stay in this Chrome profile. No account, cloud sync,
              or analytics. Local storage is not encrypted.
            </p>
            <h3>Enabled websites</h3>
            {sites.length ? (
              sites.map((site) => (
                <div className="permission-row" key={site}>
                  <span>
                    {site
                      .replace(/\/$/, "")
                      .replace("/*", "")
                      .replace(/^https?:\/\//, "")}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      void act(() =>
                        request({ type: "DISABLE_SITE", pattern: site }),
                      )
                    }
                  >
                    Disable
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">No sites enabled yet.</p>
            )}
            <h3>Delete local highlights</h3>
            <p>This removes all saved passages from this Chrome profile.</p>
            {confirmClear ? (
              <div className="confirm">
                <p>
                  Delete all {records.length} highlights? This cannot be undone.
                </p>
                <button
                  className="danger"
                  onClick={() =>
                    void act(async () => {
                      await request({ type: "CLEAR" });
                      setConfirmClear(false);
                      setUndo(null);
                    })
                  }
                >
                  Delete all highlights
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="secondary"
                disabled={!records.length}
                onClick={() => setConfirmClear(true)}
              >
                Clear all highlights
              </button>
            )}
            <button
              className="text-button back"
              onClick={() => setSettings(false)}
            >
              ← Back to your highlights
            </button>
          </section>
        ) : (
          <>
            <div className="library-heading">
              <div className="eyebrow">LITTLE THINGS WORTH KEEPING</div>
              <h2>
                Your highlights<span className="total">{records.length}</span>
              </h2>
              <p className="intro">Pick up where your curiosity left off.</p>
            </div>
            <div className="tabs" role="tablist" aria-label="Highlight scope">
              <button
                role="tab"
                aria-selected={scope === "page"}
                onClick={() => setScope("page")}
              >
                Current page <span>{pageRecords.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={scope === "all"}
                onClick={() => setScope("all")}
              >
                All highlights <span>{records.length}</span>
              </button>
            </div>
            <label className="search">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Search highlights"
                placeholder="Find a thought, a phrase, a page…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <div className="filter-row">
              <span>FILTER BY COLOR</span>
              <div className="color-filters">
                <button
                  className={"all-colors " + (!color ? "active" : "")}
                  aria-pressed={!color}
                  onClick={() => setColor(null)}
                >
                  All
                </button>
                {Object.entries(COLORS).map(([name, hex]) => (
                  <button
                    key={name}
                    className={"filter-dot " + (color === name ? "active" : "")}
                    style={{ background: hex }}
                    title={`Filter ${name}`}
                    aria-label={`Filter ${name}`}
                    aria-pressed={color === name}
                    onClick={() =>
                      setColor(color === name ? null : (name as Color))
                    }
                  />
                ))}
              </div>
            </div>
            {scope === "page" && (
              <div className="current-source">
                <span className={"status-dot " + (enabled ? "on" : "")} />
                <span>
                  {tab?.url && sitePattern(tab.url)
                    ? new URL(tab.url).hostname
                    : "Open a website to start"}
                </span>
                {!enabled && sitePattern(tab?.url) && (
                  <button
                    className="text-button"
                    onClick={() => void enable()}
                    disabled={busy}
                  >
                    {busy ? "Enabling…" : "Enable site"}
                  </button>
                )}
              </div>
            )}
            <div className="results-heading">
              <span>
                {query || color
                  ? `${filtered.length} matching`
                  : scope === "all"
                    ? "YOUR COLLECTION"
                    : "ON THIS PAGE"}
              </span>
              <span>Newest first</span>
            </div>
            <section
              className="highlight-list"
              aria-label="Saved highlights"
              aria-busy={loading}
            >
              {loading ? (
                <p className="muted">Opening your vault…</p>
              ) : filtered.length ? (
                filtered.map((r) => (
                  <article
                    className="highlight-card"
                    key={r.id}
                    style={
                      { "--highlight": COLORS[r.color] } as React.CSSProperties
                    }
                  >
                    <div className="card-top">
                      <span className="source-icon">
                        {r.sourceType === "chatgpt"
                          ? "✳"
                          : r.hostname.charAt(0).toUpperCase()}
                      </span>
                      <span className="hostname">
                        {r.hostname.replace(/^www\./, "")}
                      </span>
                      <time
                        dateTime={r.createdAt}
                        title={new Date(r.createdAt).toLocaleString()}
                      >
                        {new Date(r.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                    <blockquote>{r.exactText}</blockquote>
                    <p className="page-title" title={r.pageTitle}>
                      {r.pageTitle || r.hostname}
                    </p>
                    {r.status === "unresolved" && (
                      <p
                        className="unresolved"
                        title="The saved passage could not be confidently located the last time this page was checked."
                      >
                        Location unresolved · Your text is safe
                      </p>
                    )}
                    <div className="card-actions">
                      <div
                        className="recolor"
                        role="group"
                        aria-label="Change highlight color"
                      >
                        {Object.entries(COLORS).map(([name, hex]) => (
                          <button
                            key={name}
                            style={{ background: hex }}
                            className={r.color === name ? "chosen" : ""}
                            aria-label={`Change to ${name}`}
                            aria-pressed={r.color === name}
                            onClick={() =>
                              void act(() =>
                                request({
                                  type: "RECOLOR",
                                  id: r.id,
                                  color: name as Color,
                                }),
                              )
                            }
                          />
                        ))}
                      </div>
                      <button
                        className="icon-button delete"
                        title="Delete highlight"
                        aria-label="Delete highlight"
                        onClick={() =>
                          void act(async () => {
                            await request({ type: "DELETE", id: r.id });
                            setUndo({ id: r.id, expires: Date.now() + 10000 });
                          })
                        }
                      >
                        <Icon name="trash" />
                      </button>
                      <button
                        className="source-button"
                        title="Open source and find passage"
                        onClick={() =>
                          void act(() => request({ type: "VISIT", id: r.id }))
                        }
                      >
                        Revisit
                        <Icon name="arrow" />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty">
                  <div className="empty-art">
                    <span />
                    <span />
                    <span />
                    <Icon name="book" />
                  </div>
                  <h3>
                    {query || color
                      ? "Nothing matches just yet."
                      : scope === "page"
                        ? "This page is a blank canvas."
                        : "Make room for a good idea."}
                  </h3>
                  <p>
                    {query || color
                      ? "Try another word or a different color."
                      : "Select a passage on an enabled website, choose a color, and find it here whenever you need it."}
                  </p>
                  {scope === "page" && !!records.length && (
                    <button
                      className="text-button"
                      onClick={() => setScope("all")}
                    >
                      Explore all {records.length} highlights →
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
      <footer>
        <Icon name="shield" />
        <span>Only on your device. Only for you.</span>
        <span className="version">v0.1</span>
      </footer>
      {undo && (
        <div className="undo" role="status">
          Highlight deleted
          <button
            onClick={() =>
              void act(async () => {
                await request({ type: "UNDO", id: undo.id });
                setUndo(null);
              })
            }
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Panel />);
