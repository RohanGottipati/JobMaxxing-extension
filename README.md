# JobMaxxing Chrome Extension

Chrome extension forked from [JobTrack](https://github.com/zhao0524/JobTrack), rebranded for JobMaxxing and synced to your JobMaxxing account via authenticated API routes.

## Features

- Job-page detection on LinkedIn, Workday, Greenhouse, Lever, and Ashby
- Popup: Grab This Page, Add Manually, Combine PDFs, application count
- Direct synchronization with the JobMaxxing web app
- Duplicate detection and optional server-side job analysis (when AI consent is enabled)

## Setup

1. Copy `config.example.js` → `config.js`:

```js
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const APP_URL = 'https://jobmaxxing.app'; // or http://localhost:3000
```

2. Apply JobMaxxing migrations (`npm run db:push` in the web repo).

3. Load unpacked in Chrome → select this folder.

4. Sign in with your JobMaxxing email/password in the popup.

## Usage

- **Popup** — quick capture, manual role entry, PDF merge, and a direct link to the web app
- **JobMaxxing web app** — browse, edit, and manage applications and use the full AI workflows
- **Popup capture** — use “Grab This Page” to capture supported job boards without overlaying the page

## Related repo

Web app and API: [JobMaxxing](https://github.com/RohanGottipati/JobMaxxing)
