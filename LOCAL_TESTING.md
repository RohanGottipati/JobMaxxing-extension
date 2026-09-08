# Local Testing Guide — Chrome Extension

How to run the extension against a local web app, what to flip to `localhost`, and
what to flip **back** before you package/publish.

Web side of the same workflow: [`../web/LOCAL_TESTING.md`](../web/LOCAL_TESTING.md).

---

## TL;DR — the one thing that toggles

| File | Local value | Deployed value |
|------|-------------|----------------|
| `extension/config.js` → `APP_URL` | `http://localhost:3000` | `https://jobmaxxing.app` |

```js
// config.js
// Deployed:  'https://jobmaxxing.app'
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

- **`manifest.json` host permissions** are committed and already list
  `http://localhost:3000/*` plus the Vercel origins, so local dev works without
  edits. See the caveat in §4 about the `jobmaxxing.app` origin.

---

## 4. Before you package/publish

`config.js` ships inside the packaged `.zip`, so this is the real switch-back:

- [ ] `APP_URL` = `https://jobmaxxing.app` (production origin).
- [ ] `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` = the production project's
      public values.
- [ ] **`manifest.json` `host_permissions` includes the exact `APP_URL` origin.**
      ⚠️ It currently lists `job-maxxing.vercel.app` and `jobmaxxing-sooty.vercel.app`
      but **not** `https://jobmaxxing.app/*`. If you ship with
      `APP_URL=https://jobmaxxing.app`, add `https://jobmaxxing.app/*` to
      `host_permissions` or the extension can't call the API or read the cookie.
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
PROD   → config.js: APP_URL = 'https://jobmaxxing.app'  + host_permissions updated
         (then reload / repackage)
```
