import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { request, sitePattern } from "../shared/model";
import { Header, Icon, errorMessage } from "./common";
import "./styles.css";
function Popup() {
  const [tab, setTab] = useState<chrome.tabs.Tab>(),
    [enabled, setEnabled] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pattern = sitePattern(tab?.url);
  useEffect(() => {
    void (async () => {
      try {
        const [active] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        setTab(active);
        const match = sitePattern(active?.url);
        setEnabled(
          !!match && (await chrome.permissions.contains({ origins: [match] })),
        );
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function toggle() {
    if (!pattern || !tab?.id) return;
    setError("");
    setBusy(true);
    try {
      if (enabled) {
        await request({ type: "DISABLE_SITE", pattern });
        setEnabled(false);
      } else {
        // Call directly from the click handler to preserve Chrome's user gesture.
        const granted = await chrome.permissions.request({
          origins: [pattern],
        });
        if (!granted) {
          setError(
            "Access was declined. You can enable this site whenever you’re ready.",
          );
          return;
        }
        await request({ type: "ACTIVATE", tabId: tab.id });
        setEnabled(true);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function openLibrary() {
    if (!tab?.windowId) return;
    void chrome.sidePanel
      .open({ windowId: tab.windowId })
      .then(() => window.close())
      .catch((e) => setError(errorMessage(e)));
  }
  return (
    <div className="popup">
      <Header />
      <main>
        <div className="eyebrow">YOUR READING, REMEMBERED</div>
        <h2>Keep the good parts.</h2>
        <p className="intro">
          A sentence that clicks. An idea to come back to. Give it a little
          color.
        </p>
        <section className="site-box">
          <div className="site-line">
            <span className={"status-dot " + (enabled ? "on" : "")} />
            <strong>
              {tab?.url && pattern ? new URL(tab.url).hostname : "This page"}
            </strong>
            <span className="pill">{enabled ? "Enabled" : "Not enabled"}</span>
          </div>
          <p>
            {!ready
              ? "Checking this page…"
              : !pattern
                ? "Open a regular website to start highlighting. Chrome’s internal pages, PDFs, and the Web Store aren’t supported."
                : enabled
                  ? "Select text on this site, then choose a color to save it."
                  : "You decide where highlighting works. Enable this site to get started."}
          </p>
          <button
            className={enabled ? "secondary full" : "primary full"}
            onClick={() => void toggle()}
            disabled={!ready || !pattern || busy}
          >
            {busy
              ? "Updating…"
              : enabled
                ? "Disable highlighting on this site"
                : "Enable highlighting on this site"}
          </button>
        </section>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="library-button"
          onClick={openLibrary}
          disabled={!ready}
        >
          <Icon name="book" />
          <span>Open your vault</span>
          <Icon name="arrow" />
        </button>
        <p className="privacy">
          <Icon name="shield" />
          Saved on this device. Always yours.
        </p>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Popup />);
