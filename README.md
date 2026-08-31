# JobMaxxing Chrome Extension

Capture job postings from LinkedIn, Workday, Greenhouse, Lever, Ashby, and other sites — then save them to your [JobMaxxing](https://jobmaxxing.app) account with duplicate detection and optional server-side job analysis.

## Setup

1. Copy `config.example.js` to `config.local.js` and fill in the same Supabase credentials as the JobMaxxing web app:

```js
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const APP_URL = 'https://jobmaxxing.app'; // or http://localhost:3000 for local dev
```

2. Ensure the JobMaxxing database migration `20260831160000_extension_capture_fields.sql` has been applied (`supabase db push` from the main repo).

3. Load the extension in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select this folder

4. Sign in with the same email/password you use on JobMaxxing.

## Usage

- On supported job boards, click the blue **Track Job** pill → review the pre-filled form → **Save Application**
- On any page, open the popup → **Grab this page** or **Add manually**
- Recent applications appear in the popup; click one to open it in JobMaxxing
- When AI consent is enabled on your profile, saving triggers server-side job parsing automatically

## Architecture

- **Auth:** Supabase Auth REST API; session stored in `chrome.storage.local`
- **Data:** JobMaxxing API routes (`/api/extension/applications`) with Bearer JWT
- **AI:** Server-side only via `POST /api/extension/applications/[id]/analyze` — no Gemini key in the extension

## Related repo

Web app and database migrations live in [JobMaxxing](https://github.com/rohangottipati/JobMaxxing).
