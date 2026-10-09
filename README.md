# Securin Signals for Chrome

A Manifest V3 extension that finds CVE identifiers on any webpage and opens the matching
**Securin Signals** record in one click:

```
CVE-2017-0143  →  https://www.securin.io/vulnerability-database/cve/CVE-2017-0143
```

It adds no vulnerability data of its own. Securin's canonical CVE page is the source of truth.

## Features

| Journey             | What happens                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Automatic detection | CVE IDs in page text get a subtle dotted underline. Pointing at one shows a small **Open in Securin** / copy button. Dynamically loaded content is picked up automatically.                                                          |
| Right-click         | Select text containing a CVE (or right-click a highlighted CVE): **Open CVE in Securin Signals** / **Copy CVE identifier**.                                                                                                          |
| Popup               | Count and list of unique CVEs on the current page (newest first), filter-as-you-type, manual lookup (`CVE-2021-44228`, `cve-2021-44228` or `2021-44228`), open and copy actions, per-site highlight switch. Shortcut: `Alt+Shift+S`. |
| Settings            | Turn highlighting, the hover button, or the toolbar count on/off; list sites where highlighting is disabled.                                                                                                                         |

## Install (Load unpacked)

Requirements: Node.js 20.19+ (or 22+), npm, Chrome 110+.

```bash
npm install
npm run build          # typecheck + build into dist/
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. Reload any tabs that were already open (content scripts are injected on page load).

## Scripts

| Command                | Purpose                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `npm run build`        | Typecheck, then build popup/options/worker and the content script into `dist/`                |
| `npm run dev`          | Rebuild pages + service worker on change (run the content build separately, or rerun `build`) |
| `npm test`             | Vitest unit/component tests (jsdom)                                                           |
| `npm run lint`         | ESLint (bans `innerHTML`, `eval`, etc.)                                                       |
| `npm run format:check` | Prettier                                                                                      |
| `npm run check`        | lint + format + tests + build                                                                 |
| `npm run icons`        | Regenerate `public/icons/*.png` from code                                                     |

To ship to the Chrome Web Store, zip the **contents** of `dist/` (`cd dist && zip -r ../securin-signals.zip .`).

## Architecture

```
src/
  utils/       cve.ts (parse/validate/normalize), url.ts (buildSecurinCveUrl),
               messages.ts (typed contract + runtime validators), settings.ts, search.ts
  content/     scanner.ts (TreeWalker scan, live Ranges), observer.ts (debounced MutationObserver),
               exclusions.ts, highlighter.ts (CSS Custom Highlight API), hit-test.ts,
               indicator.ts (closed shadow-DOM button + toast), controller.ts, index.ts
  background/  index.ts (message routing), menus.ts (context menus), badge.ts
  popup/       React popup (services.ts isolates chrome.* for tests)
  options/     React settings page
  api/         provider.ts (intelligence provider interface + canonical-page provider),
               cache.ts (TTL cache / request de-dup / timeout wrapper for a future API provider)
  shared/      navigation.ts (the single "open record" path), tokens.css, BrandMark.tsx
tests/         Vitest suites
```

Build: `vite.config.ts` builds the HTML pages and the ES-module service worker.
`vite.content.config.ts` builds the content script as a single IIFE, since content scripts can't be ES modules.

### Detection design

- **Pattern**: `CVE-YYYY-NNNN…`, case-insensitive, with Unicode hyphen variants (‐ ‑ – —) normalized to `-`.
  It validates the format: year ≥ 1999, and only the 4-digit sequence form may be zero-padded. A well-formed ID is not
  assumed to exist; Securin is the authority.
- **No DOM mutation for highlighting.** Matches are painted with `CSS.highlights` / `::highlight(securin-cve)`,
  so text nodes owned by React or Vue, links and code blocks are never wrapped or replaced.
- **Efficient scanning.** A `TreeWalker` with a `FILTER_REJECT` filter prunes excluded subtrees. Text nodes are pre-filtered
  with a cheap `/cve/i` test. Mutations are debounced (300 ms, forced flush at 1.5 s) and collapsed to their top-most
  roots, so only changed subtrees are rescanned, never the whole document.
- **Excluded**: `script`, `style`, `noscript`, `template`, `textarea`, `input` (including password), `select`, `iframe`, `svg`,
  `canvas`, `contenteditable` regions, `role="textbox"`, design-mode documents, and the extension's own UI.
- Bounded work: at most 5,000 tracked occurrences per page, and at most 1,000 IDs per message.

## Permissions

| Permission                                    | Why                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content script on `http://*/*`, `https://*/*` | **Required for automatic detection**: the extension must read page text to find CVE IDs wherever the user browses. Chrome shows this as "Read and change all your data on all websites". The script only reads text locally and never modifies page content (highlights are rendered by the browser, not inserted into the DOM). |
| `contextMenus`                                | Right-click "Open CVE in Securin Signals" / "Copy CVE identifier".                                                                                                                                                                                                                                                               |
| `storage`                                     | Save settings (synced via the browser profile).                                                                                                                                                                                                                                                                                  |

Deliberately **not** requested: `tabs`, `activeTab`, `scripting`, `clipboardWrite`, `webRequest`, `offscreen`, or any host
permission for securin.io. Opening a new tab doesn't need them, and the popup gets the page hostname from the content script.

## Security and privacy

- **Fixed destination.** `buildSecurinCveUrl()` validates and normalizes the ID and builds the URL against the hard-coded
  origin `https://www.securin.io`. `openCveRecord()` checks the result again with `isSecurinCveUrl()` before calling
  `chrome.tabs.create`. Messages carry CVE IDs only, never URLs; the service worker rebuilds the URL itself.
- **Validated messaging.** Every inbound message is parsed against a strict schema (unknown keys rejected). Sender identity
  is checked (`sender.id`, tab and top frame). There is no `externally_connectable`, so webpages can't message the extension.
- **No unsafe HTML.** UI is built with React or `textContent`/DOM APIs inside a closed shadow root. ESLint bans
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, and `new Function`. Extension pages use the default MV3 CSP (`script-src 'self'`).
- **Synthetic clicks ignored.** The inline button acts only on `isTrusted` events.
- **No data leaves the browser.** Page content is never transmitted. The only network activity is the user opening a
  Securin record tab. No analytics, no remote code, no remote fonts.
- The extension doesn't scan, probe, or exploit anything. It only navigates to public record pages.

## Future Securin API integration

`src/api/provider.ts` defines `CveIntelligenceProvider`. The shipped `CanonicalPageProvider` makes **no network
requests**; it returns only the validated record URL. If an approved, documented Securin API becomes available:

1. Implement a new provider against the **confirmed** endpoint and schema. Model optional fields explicitly; don't invent any.
2. Wrap it in `CachingProvider` (`src/api/cache.ts`) for TTL caching, in-flight de-duplication, timeouts and abort.
3. Do network calls from the service worker, add only that API's origin to `host_permissions`, and use a user-scoped,
   expiring auth flow. Never embed a permanent API secret in the extension.
4. Until then, the UI shows no CVSS, KEV, exploit or threat-actor data.

## Testing

**Automated** (`npm test`): 184 tests covering valid/invalid IDs, case and dash normalization, de-duplication, URL
generation and URL-safety (path traversal, foreign origins, query/fragment injection), DOM scanning, exclusions,
dynamic updates and debouncing, message validation, settings sanitization, context-menu handling, provider caching/timeouts,
and the popup (states, search, copy, site toggle) and options page, including error paths.

**Browser smoke test (run during development).** The built `dist/` was loaded unpacked in Chromium via Playwright.
It verified highlight painting, an unchanged page DOM, excluded fields, badge counts, dynamic content, page buttons and
inputs still working, the inline button opening the exact record, settings toggles, popup search, and that only
canonical Securin URLs were navigated to.

**Still needs manual verification in desktop Chrome:**

- [ ] Native context menu: selection items appear on selected text; "Open CVE-… in Securin Signals" appears when right-clicking a highlighted CVE; both actions work (including copy → paste).
- [ ] Toolbar popup opened from the icon and via `Alt+Shift+S` on a normal page, a `chrome://` page ("unavailable" state), and a tab opened before install.
- [ ] Keyboard-only use of the popup and options (tab order, focus rings, Enter/Escape); screen-reader announcements (NVDA/VoiceOver).
- [ ] Light and dark OS themes for popup, options, highlight and inline button.
- [ ] Heavy SPAs (e.g. GitHub advisories, Jira, Gmail) and long pages (NVD search results): no jank, no broken interactions.
- [ ] Extension reload/update while tabs are open: orphaned content scripts shut down quietly.

## Known limitations

- A CVE split across elements (`CVE-2017-<b>0143</b>`) isn't detected.
- Only the top frame is scanned (`all_frames: false`). CVEs inside iframes don't appear.
- Shadow-DOM content of web components isn't scanned.
- Pages can tell the extension is installed (the `securin-cve` highlight name is visible to page scripts).
