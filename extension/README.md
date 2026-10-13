# TraderApe — ESPN Helper

Tiny MV3 extension whose only job is to read your `espn_s2` and `SWID` cookies
from `espn.com` and hand them to the TraderApe web app when it
asks. Replaces the manual DevTools step on the ESPN onboarding flow.

> Status: the web app's ESPN cookie flow is currently manual copy-paste, so no
> code in the app probes this extension today (the auto-fill connect form was
> removed Oct 12). The extension still works standalone — the popup checks your
> espn.com session and opens the app — and the allowlist is pinned to the live
> TraderApe domain so auto-fill can be re-wired later without a new release.

## What it does

1. You log into espn.com in this browser like normal.
2. You open the Analyzer web app and pick the ESPN tab.
3. The web app probes the extension via `chrome.runtime.sendMessage`.
4. Extension reads the two cookies and returns them.
5. Web app auto-fills both fields. One click instead of six manual steps.

## What it does NOT do

- No network calls of its own
- No analytics
- No cookie storage (cookies stay where they are; we just read them when asked)
- No access to anything outside `*.espn.com` (the host permissions in
  `manifest.json` are the only origins we can touch)
- Only responds to messages from `https://www.traderape.me/*` and
  `https://traderape.me/*` (set via `externally_connectable` plus a
  belt-and-braces origin check in `background.js`). The shipped build never trusts localhost — see "Local
  development install" below for how to test without weakening the shipped
  allowlist.

## Local development install

### Chrome / Edge / Brave

1. In your working copy ONLY, add the dev origins the shipped build deliberately
   omits: `http://localhost:5173/*` and `http://localhost:4173/*` to
   `externally_connectable.matches` in `manifest.json`, and the same two
   origins to `ALLOWED_ORIGINS` in `background.js`. Without them the extension
   ignores the dev server. **Strip them again before packing a release** (see
   Architecture notes for why shipping them is a cookie-theft hole).
2. Visit `chrome://extensions`
3. Toggle "Developer mode" on (top right)
4. Click "Load unpacked"
5. Pick this `extension/` directory
6. The "Auto-fill from extension" flow is not currently wired into the web
   app (it was removed with the connect form in October 2026), so this
   section is for the popup's session-check UX only. If auto-fill is
   re-added later, set the extension ID as `VITE_ESPN_EXTENSION_ID` (GitHub >
   Settings > Secrets and variables > Actions > Variables) so the frontend
   build knows where to send the cookie request.
7. Reload the TraderApe web app. The extension responds to `ping` and
   `get-espn-cookies` messages from `https://www.traderape.me`.

### Firefox

Firefox uses the WebExtensions API which is compatible. Load via
`about:debugging#/runtime/this-firefox` > "Load Temporary Add-on" and pick
`manifest.json`.

## Publishing

### Chrome Web Store

1. Add proper icons before publishing — Chrome Web Store requires 128x128 PNG
   minimum. Drop them at `extension/icons/icon16.png`, `icon48.png`, `icon128.png`
   and add an `"icons"` block to `manifest.json`.
2. Zip the contents of this directory (not the directory itself).
3. Pay the one-time $5 developer fee at the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
4. Upload the zip. Review usually takes 1-3 business days.
5. Once published, copy the extension ID from the listing URL and keep it on
   file. It becomes the `VITE_ESPN_EXTENSION_ID` value only if the auto-fill
   flow is ever re-added to the web app (see "Local development install"
   step 6 — currently unneeded).

### Firefox Add-ons (AMO)

1. Same icons + manifest changes.
2. Zip the directory contents.
3. Upload at [addons.mozilla.org/developers](https://addons.mozilla.org/en-US/developers/).
4. Listed extensions go through manual review (~days). Self-distributed XPIs
   are signed automatically but won't appear in search.

## Architecture notes

- `manifest_version: 3` — required by Chrome Web Store as of 2024.
- `permissions: ["cookies"]` is the only permission. Combined with
  `host_permissions` for `espn.com`, this lets us call
  `chrome.cookies.get({url: "https://www.espn.com", name: "espn_s2"})`.
  We cannot read cookies for any other site.
- `externally_connectable.matches` is the security boundary. Only listed
  origins can `chrome.runtime.sendMessage(EXT_ID, ...)`. It is pinned to the
  live frontend domain (`www.traderape.me`) ONLY — **the shipped
  manifest and `background.js` must never include localhost origins**: on a
  store-installed extension a localhost entry lets any local dev server
  (someone else's `npm run dev`) silently read a user's ESPN session cookies
  (found by security review, 2026-08-25). For local testing, add
  `http://localhost:5173` / `:4173` to both `externally_connectable` in
  `manifest.json` and `ALLOWED_ORIGINS` in `background.js` in an unpacked
  copy, and strip them before packing a release. **If the frontend domain
  ever changes again, update this, the `ALLOWED_ORIGINS` set in
  `background.js`, and `ANALYZER_URL` in `popup.js` together, or auto-fill
  silently stops working against production.** Never widen it to a shared
  host like `*.github.io`: that origin is account-wide, so every other site
  published there would inherit the ability to read a user's ESPN session
  cookies.
- `background.js` runs as a service worker (no persistent process).
- `popup.html` is optional UX so users can see whether they're logged into
  espn.com without leaving the extension icon.
