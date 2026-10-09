# Securin Signals for Chrome: privacy policy

_Last updated: 2026-10-09_

Securin Signals is a browser extension published by Securin. It finds CVE identifiers
(for example `CVE-2017-0143`) on webpages you visit and links them to Securin's public
vulnerability database.

## What the extension reads

To find CVE identifiers, the extension reads the visible text of the webpages you open. This
happens **entirely inside your browser**. Page text, URLs, titles, form contents and
browsing history are **never stored or transmitted**.

## What the extension sends

| When                                                                                                                             | What is sent                                                                             | To                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| You point at a highlighted CVE, or open the popup on a page with CVEs, and **Show Securin signals on hover** is on (the default) | Only the CVE identifier, as `{"view":"cve","id":"CVE-…"}`                                | Securin's vulnerability database (`d2tc2ta7c5xxs3.cloudfront.net`) |
| You choose to open a CVE                                                                                                         | Your browser opens `https://www.securin.io/vulnerability-database/cve/<ID>` in a new tab | www.securin.io                                                     |

Signal requests are sent without cookies, credentials or a referrer. Turn off **Show Securin
signals on hover** in the extension's settings to stop them entirely. Detection and the
"Open in Securin Signals" links keep working.

## What the extension stores

- **Settings** (on/off switches and sites where highlighting is disabled) in Chrome sync
  storage, so they follow your Chrome profile.
- **Signal results** for CVEs you looked at, in session storage. They are cleared when the
  browser closes and expire after at most 6 hours.

The extension has no analytics, telemetry, advertising, or remote code. It does not sell or
share data with anyone.

## Permissions

- **Read data on all websites (http/https):** required to detect CVE identifiers on any page.
- **Access to `d2tc2ta7c5xxs3.cloudfront.net`:** to fetch Securin signals for a CVE.
- **contextMenus:** the right-click "Open CVE in Securin Signals" and "Copy CVE identifier" items.
- **storage:** settings and the signal cache described above.

## Contact

Questions about this policy: https://www.securin.io/
