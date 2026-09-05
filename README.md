# JobMaxxing Chrome Extension

Capture and review a job posting in a persistent Chrome side panel, then save it to the same account used by the [JobMaxxing web app](https://github.com/RohanGottipati/JobMaxxing).

The extension does **not** fill or submit employer application forms. It records the role, job-description snapshot and optional copies of the files you submitted.

Current release source: **1.2.1**, Manifest V3, Chrome 114 or newer. The repository documents developer installation; it does not claim that this source version is published in the Chrome Web Store.

## What it does

- Detects individual job pages on LinkedIn, Workday, Greenhouse, Lever and Ashby
- Captures company, role, location, job URL, description, deadline and recruiting season when available
- Can recognize other pages with `JobPosting` structured data after the user opens the extension for that tab
- Supports manual entry when a page cannot be confirmed or extracted
- Saves PDF or DOCX resume and cover-letter copies with the application
- Detects duplicate job URLs and job descriptions
- Opens from Chrome's toolbar as a persistent side panel
- Uses the same Supabase account as the web app and mirrors website sign-in/sign-out state when possible
- Opens the saved application in the web app
- Requests deterministic server-side parsing after saving a job description; Gemini enrichment runs only when the server is configured and the account has granted AI consent
- Combines selected PDFs locally in the browser

## Local setup

1. Apply the latest migrations and start the JobMaxxing web app.

2. Copy the example configuration:

```bash
cp config.example.js config.js
```

3. Add the same public Supabase settings used by the web app:

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_your-key";
export const APP_URL = "http://localhost:3000";
```

Get the URL and publishable key from the Supabase project's **Connect** dialog or **Settings → API Keys**. Publishable keys are intended for public clients and remain constrained by grants, Supabase Auth, RLS and Storage policies. Existing `config.js` files may continue to export the legacy `SUPABASE_ANON_KEY` during migration, but new configuration should use `SUPABASE_PUBLISHABLE_KEY`.

Never place a Supabase secret/service-role key or Gemini key in the extension. For a production package, set `APP_URL` to the deployed HTTPS origin and make sure the exact origin is present in `host_permissions` in `manifest.json`.

4. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository folder.

5. Select the JobMaxxing toolbar icon to open the side panel, then sign in with your JobMaxxing email and password. The extension stores a local Supabase session and mirrors it to or from the configured website when Chrome cookie access is available.

## User flow

1. Open a supported job posting and select the JobMaxxing toolbar icon.
2. Select **Grab this posting**.
3. Review the extracted fields and optionally attach the exact resume and cover letter you used.
4. Save the application.
5. Use **Open in JobMaxxing** to edit details, run a career match or manage the saved documents.

If the current page is already tracked, the popup offers to update or open the existing application instead of silently creating another copy.

## Capture behavior

The five built-in job-board host patterns run a small detector that sets the extension badge when the current page looks like an individual posting. The full company, role and description snapshot is collected only after the user selects **Grab this posting**. A manual **Add application** action is available without scraping the page.

The extension uses the web app's eight statuses: Saved, Applied, Online Assessment, Interview, Final Round, Offer, Rejected and Withdrawn. Moving a Saved role forward sets the applied date when one is not already present.

## Permissions

- `storage` keeps the Supabase session, display details, recent-application index and local preferences in Chrome local storage.
- `activeTab` and `scripting` inspect and capture the page after user interaction.
- `tabs` reads the active tab, opens JobMaxxing and clears badge state when navigation starts.
- `cookies` mirrors the Supabase session between the extension and the configured JobMaxxing origin.
- `sidePanel` hosts the persistent interface; `alarms` supports previously configured local follow-up reminders.
- Host permissions are limited to the five supported job-board families, the configured Supabase project pattern, local development and the intended JobMaxxing app origin. The manifest no longer requests optional access to every website.

See [Privacy and data handling](docs/PRIVACY.md) for the exact local and remote data flow.

## Tests

```bash
npm test
```

The test suite covers status mapping, job URL normalization, network error handling, page detection, document policy and the capture workflow.

## Release checklist

Before packaging or updating a store listing, follow [the release checklist](docs/RELEASE_CHECKLIST.md). In particular, verify that `config.js`, the app host permission, the privacy URL and the listing copy all describe the same deployed release.

## Related repository

Web app, API and database migrations: [RohanGottipati/JobMaxxing](https://github.com/RohanGottipati/JobMaxxing)
