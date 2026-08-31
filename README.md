# JobMaxxing Chrome Extension

Chrome extension forked from [JobTrack](https://github.com/zhao0524/JobTrack), rebranded for JobMaxxing and synced to your JobMaxxing account via authenticated API routes.

## Features

- **Track Job** pill on LinkedIn, Workday, Greenhouse, Lever, and Ashby
- Popup: Grab This Page, Add Manually, Combine PDFs, application count
- **Dashboard** (`options/options.html`): term rail, searchable list, reading pane, status/season edits
- Settings drawer: export/import JSON & CSV, follow-up reminders, refresh, wipe
- Duplicate detection and optional server-side job analysis (when AI consent is enabled)

## Setup

1. Copy `config.example.js` → `config.local.js`:

```js
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const APP_URL = 'https://jobmaxxing.app'; // or http://localhost:3000
```

2. Apply JobMaxxing migrations (`npm run db:push` in the web repo).

3. Load unpacked in Chrome → select this folder.

4. Sign in with your JobMaxxing email/password in the popup or dashboard.

## Usage

- **Popup** — quick capture, PDF merge, link to dashboard
- **Dashboard** — browse/filter applications; click **Open in JobMaxxing** for full AI workflows
- **Content pill** — capture directly from supported job boards

## Related repo

Web app and API: [JobMaxxing](https://github.com/RohanGottipati/JobMaxxing)
