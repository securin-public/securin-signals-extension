# Testing

## Automated

`npm test` runs 244 Vitest tests (jsdom) covering:

- CVE parsing: valid/invalid IDs, case and dash normalization, de-duplication
- URL generation and URL safety (path traversal, foreign origins, query/fragment injection)
- DOM scanning, exclusions, dynamic updates and debouncing
- Message validation, settings sanitization, context-menu handling
- Provider caching and timeouts; the signals parser against a real captured response plus hostile and malformed payloads
- The API provider (request shape, 404, errors, oversize, timeout), session caching and rate limiting
- Hover-card rendering states, the popup (states, search, copy, site toggle) and the options page, including error paths

`npm run check` runs lint, format check, tests and build together.

## Browser smoke test

The built `dist/` was loaded unpacked in Chromium via Playwright. It verified highlight painting, an unchanged page DOM,
excluded fields, badge counts, dynamic content, page buttons and inputs still working, the hover card opening the exact
record, settings toggles, popup search, and that only canonical Securin URLs were navigated to. A live run confirmed
real hover-card signals (e.g. CVE-2021-44228: Risk Score 9.4 Critical, CVSS 10, CISA KEV, Exploit, Ransomware),
loading in about 1.5 s on a warm worker.

## Manual verification checklist (desktop Chrome)

- [ ] Native context menu: selection items appear on selected text; "Open CVE-… in Securin Signals" appears when right-clicking a highlighted CVE; both actions work (including copy → paste).
- [ ] Toolbar popup opened from the icon and via `Alt+Shift+S` on a normal page, a `chrome://` page ("unavailable" state), and a tab opened before install.
- [ ] Keyboard-only use of the popup and options (tab order, focus rings, Enter/Escape); screen-reader announcements (NVDA/VoiceOver).
- [ ] Highlight legibility on both light and dark websites; hover-card placement near viewport edges.
- [ ] Heavy SPAs (e.g. GitHub advisories, Jira, Gmail) and long pages (NVD search results): no jank, no broken interactions.
- [ ] Extension reload/update while tabs are open: orphaned content scripts shut down quietly.
