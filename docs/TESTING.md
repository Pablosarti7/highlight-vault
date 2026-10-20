# Private beta checks

Run `npm run check` and `npm run test:e2e` first. Automated tests use a separate Chromium profile and local fixtures, not your personal Chrome session.

## Real Chrome permission flow

1. Load `dist/` using the README instructions. Verify installation asks for no automatic website access.
2. On an ordinary website, open the popup and enable the site. Reject Chrome's permission request. Verify the popup explains the denial and no toolbar appears.
3. Enable again and accept. Select text, dismiss with Escape or an outside click, and verify no record was created.
4. Select text, click a color, and reload. Verify it restores. Close the tab, reopen it, and check again.
5. Fully quit Chrome, reopen it, and return to the source. Verify saved highlights restore.
6. Disable the site from the popup. Verify page colors and toolbar disappear while saved passages remain. Reload and verify the toolbar stays disabled.
7. Re-enable and verify restoration. Remove site access through Chrome's extension settings and verify it also stops.
8. Test different hostnames and HTTP versus HTTPS. Only explicitly granted host patterns should activate.

## Live ChatGPT

1. Enable `chatgpt.com` from an existing conversation URL.
2. Save separate highlights in a user message and an assistant response, including a paragraph with inline emphasis and a list item.
3. Reload and check each color and passage. Navigate to another conversation through ChatGPT's sidebar, then back. No old conversation colors should carry across.
4. Let a response stream while a prior message has a highlight. Verify ordinary chat interaction remains responsive and the old passage stays highlighted.
5. Edit or regenerate a message with a saved passage. If the passage is gone, confirm the saved quote stays in the library as unresolved. If an exact passage remains in the same identified message, verify restoration.
6. Select text in the composer. No toolbar should appear. Check normal typing, copy, and paste.
7. Revisit a saved source from the extension sidebar with the conversation closed. Verify the message loads and the extension attempts to scroll to it.

## Library and accessibility

1. Save several passages in different colors across two sites. Search text and titles offline. Verify current-page and all-highlights scope.
2. Recolor, delete, and Undo. Check the page updates along with storage. Try two open tabs at once.
3. Select via keyboard, press Option+Shift+H on Mac or Alt+Shift+H elsewhere, then use arrows and Enter. Verify Escape cancels. Check the sidebar with Tab and a screen reader.
4. Try selections near all viewport edges, zoomed text, window resizing, and nested scrolling areas.
5. Open shield settings, disable a site, and test clear-all using both Cancel and explicit confirmation.
6. To exercise storage failure handling, use an isolated development profile with quota-limited storage. Verify a failed save shows an error and never claims success.

Do not declare live ChatGPT compatibility fully verified until the live checks pass. Its DOM may change independently of this extension.
