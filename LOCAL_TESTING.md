# Local Testing Guide — Chrome Extension

How to run the extension against a local web app, what to flip to `localhost`, and
what to flip **back** before you package/publish.

Web side of the same workflow: [`../web/LOCAL_TESTING.md`](../web/LOCAL_TESTING.md).

---

## Local vs. committed (GitHub) configuration

The committed code targets the **deployed** app: `config.example.js` defaults
`APP_URL` to `https://job-maxxing.vercel.app` and `manifest.json`
`host_permissions` includes `https://job-maxxing.vercel.app/*`. Your **local**
`config.js` (gitignored) is where you point the extension at the local web app
for testing.

| Where | `APP_URL` | Connects the extension to |
|-------|-----------|---------------------------|
| Local working copy — `config.js` (gitignored) | `http://localhost:3000` | the local web app |
| GitHub / committed — `config.example.js`, manifest | `https://job-maxxing.vercel.app` | the deployed app |

## TL;DR — the one thing that toggles

| File | Local value | Deployed value |
|------|-------------|----------------|
| `extension/config.js` → `APP_URL` | `http://localhost:3000` | `https://job-maxxing.vercel.app` |

```js
// config.js  (gitignored; set this to localhost for local testing)
// Deployed:  'https://job-maxxing.vercel.app'
// Local dev: 'http://localhost:3000'
export const APP_URL = 'http://localhost:3000';
```

> `config.js` is **THE** config file the code imports (`src/auth/*`, `src/api/*`
> all import `../../config.js`). `config.local.js` is unused legacy — ignore it.
>
> `config.js` is gitignored, so `git push` is safe. **But it is bundled into the
> packaged extension** — so the switch-back moment is **packaging/publishing**,
> not commit. See [§4](#4-before-you-packagepublish).

---

## 1. Prerequisites

- The web app running locally on `http://localhost:3000`
  (see [`../web/LOCAL_TESTING.md`](../web/LOCAL_TESTING.md)).
- `config.js` present. If missing, copy the template:
  ```bash
  cp config.example.js config.js
  ```

Fill in the **same** Supabase project as the web app (public values only — never
a service-role or Gemini key):

```js
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YOUR-KEY';
export const APP_URL = 'http://localhost:3000';   // ← local value
```

---

## 2. Load & run locally

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Click the JobMaxxing toolbar icon to open the side panel.
4. Sign in with the same JobMaxxing account as the web app. The extension mirrors
   the web session via cookie (`localhost:3000` is always an allowed origin — see
   `src/auth/web-sync.js`).
5. Open a supported posting (LinkedIn, Workday, Greenhouse, Lever, Ashby,
   Dayforce HCM), click **Grab this posting**, optionally attach a resume/cover
   letter, and save.
6. Confirm it appears on the web app's `/applications`.

> **After editing `config.js`, reload the extension** (`chrome://extensions` →
> reload icon). Config is read at load time; changes are not hot-reloaded.

Run tests:

```bash
npm test    # node --test src/*.test.js
```

---

## 3. What does NOT need toggling

- **`manifest.json` host permissions** are broad (`*://*/*`), so they already
  cover both `http://localhost:3000` and the deployed origin (and every site the
  Grab button captures). Nothing to edit per environment — only `config.js`
  `APP_URL` decides which app the extension actually targets.

---

## 4. Before you package/publish

`config.js` ships inside the packaged `.zip`, so this is the real switch-back:

- [ ] `APP_URL` = `https://job-maxxing.vercel.app` (production origin).
- [ ] `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` = the production project's
      public values.
- [ ] **`host_permissions` covers your `APP_URL` origin.** It is broad (`*://*/*`),
      so any deployed origin is already covered for API calls and cookie access —
      no per-origin entry to add. (This breadth is also what lets **Grab this
      posting** read any site; it shows the "all websites" install warning.)
- [ ] No service-role or Gemini key anywhere in `config.js`.
- [ ] Work through [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).

### Before you push (git)
`config.js` and `config.local.js` are gitignored, so the localhost value won't
leak. Quick sanity check for accidental hardcoded URLs in tracked files:

```bash
git diff --cached | grep -n "localhost:3000" || echo "clean"
```

---

## 5. Quick switch reference

```
LOCAL  → config.js: APP_URL = 'http://localhost:3000'   + web app on :3000
PROD   → config.js: APP_URL = 'https://job-maxxing.vercel.app'  + host_permissions updated
         (then reload / repackage)
```
