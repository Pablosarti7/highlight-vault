# Build verification · October 19, 2026

Version 0.1.0 is built into `dist/` and ready for Chrome's **Load unpacked** flow. Installation instructions are in the project README.

## Verified

- TypeScript checks and production build pass.
- 14 unit tests pass: anchors, whitespace normalization, duplicate passages, message identity, composer exclusions, overlap detection, URL normalization, and site patterns.
- 9 packaged-extension browser tests pass in an isolated Playwright Chromium profile: creation, save/reload, library search/recolor, source revisiting, deletion/Undo, missing content, SPA navigation, content-script shutdown, permission-denial UI, ChatGPT message fixtures, keyboard operation, strict style CSP, full browser restart, ambiguous duplicates, multi-tab updates, and clear-all confirmation.
- Dependency installation audit reports zero vulnerabilities after updating the test runner.
- Sidebar and page screenshots were inspected. The sidebar preview is `docs/library-preview.png`.

## Remaining manual verification

The real Chrome optional-permission prompt and authenticated live ChatGPT markup have not been exercised. Browser integration tests grant test hosts in a disposable manifest copy. They exercise the actual sidebar application in an extension tab, rather than automating Chrome's native side-panel container. The release manifest retains optional-only website permissions.

Follow `docs/TESTING.md` before declaring the extension ready for a broader private beta. No personal Chrome profile was modified, and the extension was not installed into the user's regular browser or published to the Chrome Web Store.
