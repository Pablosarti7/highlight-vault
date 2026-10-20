# Highlight Vault

A local-first Chrome extension for keeping the passages you want to find again. Select text, choose a color, and come back to it on the page or in your searchable sidebar.

## Try the extension

The ready-to-load extension is in `dist/` after building. Requires Chrome 120 or newer.

1. Open `chrome://extensions` in Google Chrome.
2. Switch on **Developer mode**, in the top right.
3. Click **Load unpacked** and select this project's **dist** folder.
4. Open a website or an existing ChatGPT conversation.
5. Click Chrome's puzzle-piece menu and pin **Highlight Vault**. Click its icon.
6. Choose **Enable highlighting on this site** and approve Chrome's site permission.
7. Select some text and click a color on the floating toolbar.
8. Click the extension icon, then **Open your vault** to search, recolor, delete, or revisit highlights.

Refresh the page to check restoration. You can disable an individual site from the popup or the sidebar's shield button. Disabling a site removes the page interface and highlight colors, but keeps your saved passages.

**Keyboard:** after selecting text, press **Alt+Shift+H** (Option+Shift+H on Mac) to focus the floating toolbar. Use arrow keys to choose a button and Enter to save. Escape dismisses without saving. Normal Tab navigation also reaches the toolbar. Selecting text alone never saves it.

When updating the build, click **Reload** on the extension's card in `chrome://extensions`, then refresh open webpages. Keep the unpacked folder in place; Chrome loads the extension from that folder.

## Develop

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

- `npm run build`: TypeScript checks, Vite sidebar/popup build, and bundled worker/content scripts into `dist/`.
- `npm test`: anchor and page-identity unit tests.
- `npm run test:e2e`: packaged-extension integration tests in an isolated Chromium profile. No personal browser profile is used.
- `npm run dev`: UI development server. Extension APIs still require a loaded extension; this is not a standalone web app.

Dependencies are locked in `package-lock.json`. No development server or backend is required to use the built extension.

## What is included

- Four-color floating toolbar isolated in Shadow DOM, including keyboard controls.
- CSS Custom Highlight API rendering without wrapping or rewriting website text.
- Local persistent storage, per-record writes, and serialized worker operations across tabs.
- Quote, context, position, and DOM anchors, with whitespace normalization across markup changes. Duplicate matches require distinguishing surrounding text. Missing or ambiguous passages stay in the library as unresolved.
- ChatGPT message ID anchoring, with a conservative role/fingerprint fallback when IDs are absent. Edited messages with stable IDs can restore; missing IDs are not silently redirected to other messages.
- Debounced DOM restoration, URL-only polling for SPA navigation, and pending source jumps for asynchronously rendered messages.
- Native Chrome side panel with current-page/all-highlights views, offline search, color filtering, recoloring, source navigation, deletion, and a 10-second Undo.
- Optional site-by-site host access, immediate disable, and privacy settings with a deliberate clear-all confirmation.

## Privacy

Highlight Vault makes no network requests, includes no analytics, and needs no account. It stores your selected quote, up to 64 characters on each side, anchoring metadata, a short message fingerprint for ChatGPT, and source information in your Chrome profile. It does not save entire pages or conversations. It excludes form fields, password inputs, and editable composers. Background storage access is restricted to trusted extension contexts; content scripts use scoped worker messages.

Chrome local storage is **not encrypted** and is accessible to someone with access to your browser profile. Uninstalling the extension or clearing its storage removes your highlights. This MVP has no backup/export or sync feature. Storage uses Chrome's default local quota, with save errors surfaced instead of silently discarding passages.

## Limits and verification

Works on ordinary HTML pages and supports ChatGPT conversation message selectors. Chrome internal pages, the Chrome Web Store, PDFs, cross-origin frames, shadow-root text, rendered math, and complex editors are outside this MVP. CSS Custom Highlight API support is required. Site designs and ChatGPT markup can change; unresolved records are deliberately preserved.

Source navigation works best while the site is enabled. If disabled, the source still opens and saved text stays in the library; re-enable the site to restore page colors. A location status describes the most recent check on a loaded page, not a continuous check of closed tabs. Multiple tabs showing different versions of the same page may report different location states.

Automated tests cover real browser selection, save/reload restoration, sidebar search and edits, missing/dynamic text, SPA navigation, editor exclusions, overlapping selections, and disabling the content script. The integration suite grants fixture hosts in a disposable copy of the manifest; the shipping manifest has no automatic host access. The suite also verifies strict style CSP, keyboard controls, multi-tab edits, ambiguous duplicates, clear-all confirmation, and a full test-browser restart. Native permission dialogs and live authenticated ChatGPT conversations require the manual checks in [docs/TESTING.md](docs/TESTING.md).

## Project map

- `src/content/anchors.ts`: selection indexing and conservative restoration.
- `src/content/index.ts`: floating toolbar, rendering, DOM observation, navigation.
- `src/background/index.ts`: storage, site registration, source navigation.
- `src/ui/`: React sidebar and popup.
- `src/shared/model.ts`: records, page normalization, messaging.
- `docs/product-requirements.md`: the supplied MVP specification.

Built against Chrome's [Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting), [optional Permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions), [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), and the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API).
