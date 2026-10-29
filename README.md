# JobMaxxing Chrome Extension

Capture and review a job posting in a persistent Chrome side panel, then save it to the same account used by the [JobMaxxing web app](https://github.com/RohanGottipati/JobMaxxing).

The extension does **not** fill or submit employer application forms. It records the role, job-description snapshot and optional copies of the files you submitted.

Current release source: **1.3.0**, Manifest V3, Chrome 114 or newer. The repository documents developer installation; it does not claim that this source version is published in the Chrome Web Store.

## What it does

- Flags individual job pages with a `NEW` badge on LinkedIn, Workday, Greenhouse, Lever, Ashby and Dayforce HCM
- **Grab this posting** captures the current page on **any** site — not just the boards above
- Captures company, role, location, job URL, description, deadline and recruiting season when available (via `JobPosting` structured data, known ATS containers, then a generic text heuristic)
- Supports manual entry, and still opens the form to add a role by hand when a page cannot be read
- Saves PDF or DOCX resume and cover-letter copies with the application
- Detects duplicate job URLs and job descriptions
- Opens from Chrome's toolbar as a persistent side panel
- Uses the same Supabase account as the web app and mirrors website sign-in/sign-out state when possible
- Opens the saved application in the web app
- Requests deterministic server-side parsing after saving a job description; Gemini enrichment runs only when the server is configured and the account has granted AI consent
- Combines selected PDFs locally in the browser

## Tech stack

- Chrome Manifest V3: module service worker (`background.js`), side panel UI and a content script
- Vanilla JavaScript ES modules, HTML and CSS: no framework, bundler or build step
- Supabase Auth and Storage plus the JobMaxxing web app's `/api/extension/*` REST API
- [pdf-lib](https://pdf-lib.js.org/), vendored as `vendor/pdf-lib.min.js`, for merging PDFs locally
- Node's built-in `node:test` runner for tests (no npm dependencies)

## Project structure

```
manifest.json        MV3 manifest: permissions, host access, entry points
background.js        Service worker: message router, capture, badge and alarms
config.example.js    Template for the gitignored config.js
popup/               Side-panel UI (popup.html, popup.css, popup.js)
content/content.js   Badge detector on the built-in job boards
src/                 Shared modules: auth, API clients, scraper, storage, mapping, utils, tests
vendor/              Vendored pdf-lib
icons/               Extension icons
docs/                Privacy notes and release checklist
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the message contract, data flow and auth model, and [LOCAL_TESTING.md](LOCAL_TESTING.md) for running against a local web app.

## Prerequisites

- Google Chrome 114 or newer (Side Panel API)
- A running JobMaxxing web app, either the deployed `https://job-maxxing.vercel.app` or a local instance on `http://localhost:3000`, plus the public settings of the Supabase project it uses
- Node.js, only to run the tests (no packages to install)

## Local setup

1. If you are testing against a local web app, apply its latest migrations and start it. See the [web app repository](https://github.com/RohanGottipati/JobMaxxing).

2. Copy the example configuration:

```bash
cp config.example.js config.js
```

3. Add the same public Supabase settings used by the web app:

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_your-key";
export const APP_URL = "http://localhost:3000"; // or https://job-maxxing.vercel.app
```

Get the URL and publishable key from the Supabase project's **Connect** dialog or **Settings → API Keys**. Publishable keys are intended for public clients and remain constrained by grants, Supabase Auth, RLS and Storage policies. Existing `config.js` files may continue to export the legacy `SUPABASE_ANON_KEY` during migration, but new configuration should use `SUPABASE_PUBLISHABLE_KEY`.

Never place a Supabase secret/service-role key or Gemini key in the extension. For a production package, set `APP_URL` to the deployed HTTPS origin and make sure that exact origin is listed in `host_permissions` in `manifest.json`.

4. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository folder. Reload the extension after you edit `config.js`.

5. Select the JobMaxxing toolbar icon to open the side panel, then sign in with your JobMaxxing email and password. The extension stores a local Supabase session and mirrors it to or from the configured website when Chrome cookie access is available.

### Configuration

The extension has no `.env` file. Settings live in `config.js`, which is gitignored and is imported by `src/auth/*` and `src/api/*`:

| Export | Purpose |
|--------|---------|
| `SUPABASE_URL` | HTTPS URL of the Supabase project shared with the web app |
| `SUPABASE_PUBLISHABLE_KEY` | Public `sb_publishable_...` key (legacy fallback: `SUPABASE_ANON_KEY`) |
| `APP_URL` | Origin of the JobMaxxing web app used for API calls, deep links and session-cookie sync |

## User flow

1. Open a job posting on any site and select the JobMaxxing toolbar icon.
2. Select **Grab this posting** (always available).
3. Review the extracted fields and optionally attach the exact resume and cover letter you used.
4. Save the application.
5. Use **Open in JobMaxxing** to edit details, run a career match or manage the saved documents.

If the current page is already tracked, the side panel offers to update or open the existing application instead of silently creating another copy.

## Capture behavior

The built-in job-board host patterns run a small content-script detector that sets the `NEW` badge when the current page looks like an individual posting (LinkedIn, Workday, Greenhouse, Lever, Ashby, Dayforce HCM). **Grab this posting** is not limited to those boards — it is always clickable and captures the current tab on any site only after you select it (on sites outside the built-in boards, Chrome first asks you to allow access to that site). A manual **Add application** action is available without scraping the page.

The extension uses the web app's eight statuses: Saved, Applied, Online Assessment, Interview, Final Round, Offer, Rejected and Withdrawn. Moving a Saved role forward sets the applied date when one is not already present.

## Permissions

- `storage` keeps the Supabase session, display details, recent-application index and local preferences in Chrome local storage.
- `scripting` (with `activeTab`) injects the scraper into the current tab when you select **Grab this posting**.
- `tabs` reads the active tab, opens JobMaxxing and clears badge state when navigation starts.
- `cookies` mirrors the Supabase session between the extension and the configured JobMaxxing origin.
- `sidePanel` hosts the persistent interface; `alarms` supports previously configured local follow-up reminders.
- **Host permissions are limited** to the built-in boards, the JobMaxxing web app and Supabase. On any other site, **Grab this posting** asks Chrome for access to that one site (optional `*://*/*`) when you click it. The page is only read when you explicitly select Grab; content-script badge detection still runs only on the supported boards.

See [Privacy and data handling](docs/PRIVACY.md) for the exact local and remote data flow.

## Scripts

```bash
npm test   # node --test src/*.test.js
```

The test suite covers status mapping, job URL normalization, network error handling, page detection, document policy and the capture workflow. There is no build, lint or install step.

## Release checklist

The extension is distributed as the repository folder (loaded unpacked or zipped for the Chrome Web Store) with `config.js` included. Before packaging or updating a store listing, follow [the release checklist](docs/RELEASE_CHECKLIST.md). In particular, verify that `config.js`, the app host permission, the privacy URL and the listing copy all describe the same deployed release.

## Related repository

Web app, API and database migrations: [RohanGottipati/JobMaxxing](https://github.com/RohanGottipati/JobMaxxing)
