# Highlight Vault
**Product Requirements Document (PRD) | MVP v1.0**

## 1. Product vision

Build a Chrome browser extension that allows users to highlight important text on websites and AI conversations, automatically save those highlights, and find them later.

Highlights should reappear in their original location whenever the user revisits the same page, provided the original text can still be identified.

**Core promise:** Highlight text once. Find it whenever you need it.

### Initial platform
- Google Chrome on desktop, including macOS
- Chrome Manifest V3
- Local-first storage
- No account or cloud connection required

## 2. Primary user experience

1. The user opens an enabled website, such as ChatGPT.
2. They select text using their mouse or keyboard.
3. A small floating toolbar appears near the selection.
4. They choose a highlight color.
5. The extension immediately highlights and saves the text.
6. The toolbar disappears.
7. When the user reloads or revisits the page, the highlight returns automatically.
8. The user can open the extension's sidebar to find, recolor, delete, or revisit saved highlights.

The experience should feel like highlighting text in a digital book.

## 3. Feature A: Floating highlight toolbar

**Priority: P0, required**

### Appearance

The toolbar should be compact, modern, and visually unobtrusive.

It contains four circular color options and a close button.

Default colors:
- Yellow: #FACC15
- Green: #86EFAC
- Blue: #93C5FD
- Pink: #F9A8D4

Yellow is the default highlight color, but users must explicitly select it to save.

### Behavior

- Show the toolbar after the user finishes selecting nonempty text.
- Trigger after mouse selection or completed keyboard selection.
- Position the toolbar above the selected text whenever space permits.
- Automatically reposition near viewport edges to prevent clipping.
- Preserve the original text selection while the toolbar is being clicked.
- Clicking a color saves and immediately renders the highlight.
- Clicking outside the toolbar dismisses it without saving.
- Pressing Escape dismisses it.
- Changing the selection updates or dismisses the toolbar appropriately.
- The toolbar should close on significant scrolling rather than remain floating in the wrong position.
- A small success indication may briefly appear after saving.

### Exclusions

Do not show the toolbar when selecting text inside password fields, form inputs, editable chat composers, or the extension's own interface.

Do not interfere with ordinary copying, pasting, or the website's existing text selection behavior.

The toolbar should be accessible through keyboard focus and have descriptive button labels.

## 4. Feature B: Persistent highlighting

**Priority: P0, required**

When a color is selected:

1. Capture the exact selected text.
2. Capture its surrounding text and document location.
3. Record the source website and page URL.
4. Assign a unique highlight ID.
5. Save the record in local extension storage.
6. Render the highlight without changing the original text.

Highlights must persist after:
- Reloading the page
- Closing and reopening the tab
- Restarting Chrome
- Returning to the same ChatGPT conversation

Each highlight is independently stored and can have a different color.

For the first version, partially overlapping highlights can be disallowed with a clear message. Multiple separate highlights within the same paragraph must be supported.

## 5. Feature C: Highlight restoration engine

**Priority: P0, required**

Saving selected text alone is insufficient because identical sentences can appear multiple times.

Each saved highlight should contain multiple location identifiers:

- Exact quoted text
- Text immediately preceding the selection
- Text immediately following the selection
- Original text start and end positions
- DOM location information
- Nearest relevant content container
- Original page URL

### Restoration logic

When visiting a previously highlighted page:

1. Load the highlights associated with that page.
2. Attempt to locate each highlight using its saved document position.
3. Verify that the located text matches the saved quote.
4. If the location has changed, use the quote and surrounding context to identify the correct passage.
5. Reapply the original highlight color.
6. If several matches remain ambiguous, do not guess.

If the original text is unavailable or cannot be matched confidently, preserve the saved highlight in the library and mark its location as unresolved.

**Critical rule:** It is better to show an unresolved highlight than to highlight the wrong sentence.

## 6. Feature D: ChatGPT compatibility

**Priority: P0, required**

The extension must explicitly support conversation pages on chatgpt.com.

### Required behavior

- Highlight text inside assistant responses.
- Highlight text inside user messages.
- Support ordinary rendered paragraphs, headings, and list content.
- Save the conversation URL and relevant message context.
- Restore highlights after reopening an existing conversation.
- Handle messages that appear asynchronously.
- Handle navigation between conversations without requiring a full browser reload.
- Avoid blocking ChatGPT's normal interface.

### Dynamic content handling

ChatGPT may render, remove, replace, or update message elements while a conversation is open.

The extension must observe relevant content changes and reattempt restoration when necessary.

Use debounced DOM observation to avoid continuously rescanning the entire page.

### Message identification

Where stable message identifiers are available, store them.

Otherwise, use a combination of conversation ID, message context, text fingerprint, and surrounding text.

Never rely solely on the position of a message within the conversation.

### Important cases

- If a response is regenerated and the saved passage disappears, retain the highlight in the library.
- If a message is edited and the exact passage remains identifiable, restore it.
- If the selected passage changes enough to make matching ambiguous, display an unresolved status.
- Highlighting ChatGPT's message input field is excluded.

Compatibility with code blocks, rendered math, and specialized interactive content is best effort for the MVP, not a launch requirement.

## 7. Feature E: Browser sidebar

**Priority: P0, required**

The extension should provide a native Chrome side panel.

### Sidebar sections

**Current Page**

Displays highlights associated with the currently open page.

**All Highlights**

Displays saved highlights from every enabled website.

### Each saved highlight displays

- Selected text
- Highlight color
- Page title
- Website hostname
- Date saved
- Source link

### Available actions

- Open the original page
- Attempt to scroll to the highlighted passage
- Change the highlight color
- Delete the highlight
- Search saved highlights

Search should operate across saved text and page titles, without requiring an internet connection.

The list should display newest highlights first.

Deleting a highlight must remove it from persistent storage and the currently rendered webpage. A brief Undo option is desirable.

When a highlight is unresolved, the sidebar should display that status without deleting the saved quote.

## 8. Feature F: Website permissions

**Priority: P0, required**

The extension should not automatically read every website.

### Initial activation

1. The user installs the extension.
2. They open a website.
3. They click the extension icon.
4. They choose "Enable highlighting on this site."
5. Chrome requests the required website permission.
6. Once permission is granted, highlighting becomes available on that site.

The permission should persist so highlights can automatically return on future visits.

Users should be able to disable the extension for individual websites.

Only the necessary website permissions should be requested.

ChatGPT should be one of the first supported sites, but the user should still control its activation.

## 9. Data model

Each highlight should be stored as a structured record.

| Field | Description |
|---|---|
| id | Unique highlight identifier |
| pageUrl | Original URL |
| pageKey | Normalized document identity |
| pageTitle | Original page title |
| hostname | Website hostname |
| sourceType | Webpage or ChatGPT |
| conversationId | Chat identifier, if applicable |
| messageContext | Message ID or matching metadata |
| exactText | Saved selection |
| prefix | Text before selection |
| suffix | Text after selection |
| position | Document position and offsets |
| domAnchor | Structural text location |
| color | Selected highlight color |
| status | Active or unresolved |
| createdAt | Creation timestamp |
| updatedAt | Last modification timestamp |

Page identity normalization must remove irrelevant tracking parameters while preserving query parameters that actually identify different documents.

## 10. Technical architecture

### Content script
Responsible for:
- Detecting text selections
- Displaying the floating toolbar
- Capturing text anchors
- Rendering highlights
- Observing dynamic webpage changes
- Scrolling to restored highlights

### Extension service worker
Responsible for:
- Managing extension events
- Coordinating messages
- Handling website activation
- Reading and writing stored highlight records

### Sidebar application
Responsible for:
- Displaying saved highlights
- Searching
- Recoloring
- Deleting
- Navigating to original sources

### Storage layer
Use `chrome.storage.local` for the MVP.

Design the storage interface so IndexedDB can replace it later if larger collections or more complex querying become necessary.

### Rendering strategy
Use the CSS Custom Highlight API where supported to highlight DOM text ranges without wrapping or modifying the underlying HTML.

Keep the floating toolbar isolated from website CSS, preferably using a Shadow DOM container.

## 11. Recommended technology

- TypeScript
- React for sidebar UI
- Vite for development and bundling
- Chrome Extension Manifest V3
- Chrome Side Panel API
- Chrome Storage API
- Chrome Scripting API
- CSS Custom Highlight API
- Vitest for unit tests
- Playwright with a browser-extension test setup for integration tests

No backend, cloud database, or user authentication is required.

## 12. Privacy and security requirements

- Store user highlights locally by default.
- Do not transmit highlighted text to external servers.
- Do not collect full conversation histories.
- Only store text explicitly highlighted by the user.
- Never collect passwords or form-field contents.
- Never execute scripts derived from highlighted text.
- Treat saved text as untrusted when displaying it in the sidebar.
- Allow the user to delete individual highlights.
- Provide a way to clear all locally stored highlights.
- Do not add analytics or telemetry in the initial MVP.

Local extension storage should not be described as encrypted or protected from everyone with access to the browser profile.

## 13. MVP exclusions

The following features are postponed until after the initial version:

- AI-powered summaries
- AI search or semantic search
- User accounts and login
- Cloud synchronization
- Sharing and collaborative highlights
- Folders and tagging
- Personal notes attached to highlights
- Safari and Firefox extensions
- Mobile browser support
- Highlighting inside PDFs
- Images and screenshots
- Browser-internal pages
- Cross-origin embedded frames
- Offline copies of entire webpages

These are potential future features, not dependencies for the MVP.

## 14. Acceptance criteria

The extension is ready for its first private beta when all of the following pass:

**Highlight creation**
- Selecting a paragraph shows the floating toolbar.
- Selecting a color creates a visible highlight.
- Dismissing the toolbar creates no saved record.
- Different highlights can use different colors.

**Persistence**
- Highlights survive a refresh.
- Highlights survive closing and reopening Chrome.
- Multiple highlights on one page restore independently.
- Identical text appearing twice does not result in highlighting the wrong occurrence.

**ChatGPT**
- Existing ChatGPT conversations can be highlighted.
- Highlights restore after reloading the conversation.
- Highlights restore when returning through ChatGPT navigation.
- Changes to message rendering do not create duplicate records.
- Unresolvable selections remain available in the sidebar.

**Sidebar**
- Highlights appear with their source information.
- Search finds matching saved text.
- Changing a saved color updates the stored record and visible highlight.
- Deleting a highlight removes the correct record.
- Opening a saved highlight returns to its source page.

**Safety and reliability**
- The extension does not alter website text content.
- The ChatGPT composer remains usable.
- Permission denial does not cause errors or unintended access.
- Highlight records remain intact when their source page is unavailable.

## 15. Development milestones

### Milestone 1: Working highlighter
Implement selection detection, floating toolbar, colors, local saving, and restoration on simple HTML webpages.

### Milestone 2: ChatGPT support
Implement dynamic message observation, conversation identification, and stable restoration across ChatGPT navigation and reloads.

### Milestone 3: Sidebar library
Implement current-page highlights, all highlights, search, recoloring, deletion, and source navigation.

### Milestone 4: Hardening and testing
Test duplicate passages, DOM changes, permission behavior, multiple tabs, storage persistence, performance, and recovery from missing content.

## 16. Definition of MVP success

A user should be able to open ChatGPT, select an important sentence, click a highlight color, leave the conversation, return later, and find the same sentence highlighted again.

They should also be able to find it from the sidebar without remembering which conversation contained it.

**The MVP prioritizes reliable restoration, simplicity, and privacy over adding advanced features.**