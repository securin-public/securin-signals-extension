# Changelog

## 1.1.0

- Securin theme across the popup, settings, hover card and toolbar icon (Securin logomark,
  violet palette, Poppins and Plus Jakarta Sans bundled locally).
- Hover card with Securin signals: Securin Risk Score, CVSS, CISA/Securin KEV, exploit,
  ransomware, zero-day, trending and Securin tags.
- Redesigned popup: compact header with settings, search with an "Open CVE-…" suggestion,
  rows that show each CVE's risk score and key signals, and a quiet per-site highlight switch.
- New setting: **Show Securin signals on hover**.
- Signal lookups are de-duplicated, cached (memory and session storage), time-limited and
  rate-limited; responses are strictly validated.
- `npm run package` builds the store zip; `npm run demo` serves a test page.

## 1.0.0

- CVE detection with highlights painted via the CSS Custom Highlight API (no DOM mutation).
- Inline "Open in Securin" button, right-click actions, popup list and manual lookup.
- Settings: highlighting, inline button, toolbar count, per-site exclusions.
