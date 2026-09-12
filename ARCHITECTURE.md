# Chrome Extension Architecture

> The **JobMaxxing Chrome extension** — a capture-focused client that detects job
> postings, extracts their details, and saves them (with the resume/cover letter
> you submitted) into the same account as the web app. It does **not** fill or
> submit employer forms.
>
> Companion doc: [`../web/ARCHITECTURE.md`](../web/ARCHITECTURE.md).
> Both docs use the same section layout so you can read them side by side.

---

## 1. Role in the system

```
┌─────────────────┐        Bearer JWT (REST)         ┌──────────────────────┐
│ Chrome extension│ ───────────────────────────────▶ │  Web app             │
│  (this repo)    │        /api/extension/*          │  Next.js on Node     │
└────────┬────────┘                                  └───────────┬──────────┘
         │ shared Supabase session cookie                        │
         │ (two-way login mirror)                                │
         ▼                                                       ▼
                        ┌───────────────────────────────────────────┐
                        │  Supabase: Auth · Postgres (RLS) · Storage │
                        └───────────────────────────────────────────┘
```

The extension is a **thin capture client**. It owns no schema and no business
rules about applications — it scrapes pages, uploads documents, and delegates
persistence to the web app's API and Supabase. The web app is the system of
record (see [`web/ARCHITECTURE.md` §1](../web/ARCHITECTURE.md)).

---

## 2. Tech stack

| Layer | Choice |
|-------|--------|
| Platform | Chrome Manifest V3, Chrome 114+ |
| Language | Vanilla ES modules (no build step / bundler) |
| Background | Service worker (`background.js`, `type: module`) |
| UI | Side panel (`popup/`) — plain HTML/CSS/JS |
| Page access | `chrome.scripting.executeScript` injected functions |
| Backend | Supabase Auth + web app REST API (shared with web) |
| PDF | `vendor/pdf-lib.min.js` (local, in-browser PDF merge) |
| Tests | `node --test` on `src/*.test.js` |

No framework, no transpile — files load directly as ES modules. Functions that
run in the page (`src/scrape/*`) must be self-contained because Chrome
serializes them without their module scope.

---

## 3. Directory layout

```
extension/
├── manifest.json           # MV3 manifest: permissions, hosts, entry points
├── background.js           # Service worker — message router + orchestration (§4)
├── config.js               # Local secrets-free config (SUPABASE_URL, key, APP_URL)
├── config.example.js       # Template to copy into config.js
├── popup/                  # Side-panel UI (html/css/js)
├── content/
│   └── content.js          # Content script on supported job boards (badge detect)
├── src/
│   ├── messages.js         # MSG constants — the popup↔background message contract
│   ├── storage.js          # Local index cache + delegates to the API layer
│   ├── mapping.js          # Maps between extension shape ↔ web app "track" shape
│   ├── network.js          # fetch wrapper with typed network-unavailable errors
│   ├── status-map.js       # The 8 shared application statuses
│   ├── auth/
│   │   ├── session.js      # Supabase session: sign in/out, tokens, display, adopt
│   │   └── web-sync.js     # Two-way login mirror with the website's cookie (§7)
│   ├── api/
│   │   ├── jobmaxxing.js    # Calls the web app's /api/extension/* endpoints (§5)
│   │   └── documents.js     # Uploads resume/cover-letter files to Supabase Storage
│   ├── scrape/
│   │   ├── page.js          # detectJobPostingPage / scrapePage (run in page)
│   │   └── inject.js        # Formatted-text extraction helper
│   ├── document-policy.js   # File type/size rules + storage path builder
│   ├── auth-gate.js         # Gates UI on auth state
│   └── util/                # csv, date, hash, job-url, pdf-name, tab-url, seasons
├── icons/                   # Toolbar + store icons
├── vendor/                  # pdf-lib (vendored)
└── docs/                    # PRIVACY.md, RELEASE_CHECKLIST.md
```

---

## 4. Background service worker (`background.js`)

The service worker is the hub. It:

- Installs the **web session sync** on startup (`installWebSessionSync`).
- Sets the side panel to open on toolbar click.
- Runs a **single message router** (`chrome.runtime.onMessage`) that dispatches
  on `msg.type` and always responds — even if the sender (popup) disconnected.
- Manages follow-up **alarms** and the toolbar **badge** (`NEW` on detected
  postings, `!` on follow-up reminders, cleared on navigation).

Message types (from `src/messages.js`), all requiring auth except detection:

| Category | Messages |
|----------|----------|
| Auth | `SIGN_IN`, `SIGN_OUT`, `GET_SESSION` |
| Applications | `SAVE_APPLICATION`, `UPDATE_APPLICATION`, `DELETE_APPLICATION`, `GET_APPLICATION`, `GET_ALL`, `GET_INDEX`, `REPAIR_INDEX` |
| Data mgmt | `EXPORT_JSON`, `IMPORT_JSON`, `WIPE_ALL` |
| Page capture | `CHECK_JOB_PAGE`, `SCRAPE_TAB`, `SCRAPE_PAGE`, `PAGE_DETECTED` |

---

## 5. Data flow — capturing a posting

```
Content script detects posting ──▶ badge "NEW" (PAGE_DETECTED)   (supported boards only)
        │
User opens side panel, clicks "Grab this posting"  (always available, any page)
        │  popup ── SCRAPE_TAB ──▶ background
        ▼
background: captureEligibility(url) → inject scrapePage
        │  returns {title, company, location, description, deadline,
        │           recruitingSeason, sourceHost, jobUrl}
        ▼
User reviews fields, optionally attaches resume/cover-letter files
        │  popup ── SAVE_APPLICATION ──▶ background
        ▼
background → storage.saveApplication
        ├─ api/documents.js  → upload files to Supabase Storage (job-documents)
        ├─ api/jobmaxxing.js → POST /api/extension/applications  (Bearer JWT)
        │        └─ 409 ⇒ surfaced to user as a duplicate
        └─ maybeAnalyze() → POST …/analyze (server parse; Gemini only if consented)
```

`src/mapping.js` translates between the extension's field names and the web
app's "track" shape. `src/storage.js` keeps a local index cache in
`chrome.storage.local` but treats the API as the source of truth.

**This depends on the web app's `/api/extension/*` contract** — see
[`web/ARCHITECTURE.md` §5](../web/ARCHITECTURE.md). The `409` duplicate response
and the `aiConsent` gate are load-bearing.

---

## 6. Capture scope & permissions

**Auto-detection (badge):** a content script sets a `NEW` badge only on the
built-in boards — **LinkedIn, Workday (`myworkdayjobs.com`), Greenhouse, Lever,
Ashby, Dayforce HCM**.

**Capture (Grab):** works on **any page**. The **Grab this posting** button is
always available; clicking it scrapes the current tab (`scrapePage`: JSON-LD →
known ATS containers → generic text-density heuristic). There is no job-posting
gate — if a page can't be read, the form still opens for manual entry.

| Permission | Why |
|------------|-----|
| `storage` | Session, display info, recent-application index, prefs |
| `scripting` (+ `activeTab`) | Inject the scraper into the current tab on Grab |
| `tabs` | Read active tab, open JobMaxxing, clear badge on navigation |
| `cookies` | Mirror the Supabase session with the JobMaxxing origin |
| `sidePanel` | Host the persistent UI |
| `alarms` | Follow-up reminders |

`host_permissions` is broad — **`*://*/*`** — so Grab can read the current page
on any site (a side panel can't obtain per-site access on demand, so broad
access is required). This produces Chrome's "read and change all your data on all
websites" disclosure. Content-script badge detection stays limited to the
supported boards. See [`docs/PRIVACY.md`](docs/PRIVACY.md).

---

## 7. Auth & session model

The extension shares one identity with the web app in two ways:

1. **Bearer JWT for the API** — `src/auth/session.js` holds the Supabase session
   in `chrome.storage.local`; `getAccessToken()` supplies the JWT that
   `api/jobmaxxing.js` sends to `/api/extension/*`.
2. **Two-way login mirror via cookie** — `src/auth/web-sync.js` reads/writes the
   website's `sb-<project-ref>-auth-token` cookie:
   - Website login → extension **adopts** the cookie session.
   - Extension login → extension **writes** the cookie so the website logs in.
   - Sign-out on either side clears the other.

A `sessionSource` marker (`web` vs `popup`) records where the current session
came from, so a missing website cookie only signs the extension out when the
session originated from the web. Cookie name/domain must match the web app's
scoping — see [`web/ARCHITECTURE.md` §7](../web/ARCHITECTURE.md).

---

## 8. Shared contract with the web app

Two integration points must stay aligned across the two repos:

1. **The `/api/extension/*` REST contract** (§5) — schemas, `409` duplicate
   handling, `aiConsent` gating.
2. **The Supabase session cookie** (§7) — name, domain scope, format.

Both also share the **8 application statuses** (`src/status-map.js`): Saved,
Applied, Online Assessment, Interview, Final Round, Offer, Rejected, Withdrawn.
If you change any of these, update the other repo and both ARCHITECTURE docs.

---

## 9. Config & commands

Copy `config.example.js` → `config.js` and set the **public** Supabase values
(never a service-role or Gemini key):

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_your-key";
export const APP_URL = "http://localhost:3000";   // deployed HTTPS origin in prod
```

```bash
npm test           # node --test src/*.test.js
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** →
select this folder. Before packaging, follow [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).
