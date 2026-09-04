# JobMaxxing Chrome Extension

Capture a job posting while you are viewing it and save it to the same account used by the [JobMaxxing web app](https://github.com/RohanGottipati/JobMaxxing).

The extension does **not** fill or submit employer application forms. It records the role, job-description snapshot and optional copies of the files you submitted.

## What it does

- Detects job pages on LinkedIn, Workday, Greenhouse, Lever and Ashby
- Captures company, role, location, job URL, description, deadline and recruiting season when available
- Supports manual entry on other pages after optional host permission is granted
- Saves PDF or DOCX resume and cover-letter copies with the application
- Detects duplicate job URLs and job descriptions
- Opens from Chrome's toolbar as a compact capture popup
- Uses the same Supabase account as the web app
- Opens the saved application in the web app
- Can request server-side job analysis when AI consent is enabled
- Includes local follow-up alarms, JSON/CSV export and PDF combining

## Local setup

1. Apply the latest migrations and start the JobMaxxing web app.

2. Copy the example configuration:

```bash
cp config.example.js config.js
```

3. Add the same public Supabase settings used by the web app:

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-key";
export const APP_URL = "http://localhost:3000";
```

`SUPABASE_ANON_KEY` is intended for browser use and remains protected by Supabase Auth, RLS and Storage policies. Never place a service-role key or Gemini key in the extension.

4. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository folder.

5. Select the JobMaxxing toolbar icon to open the popup, then sign in with your JobMaxxing email and password. The extension stores its own session, separate from the web app.

## User flow

1. Open a supported job posting and select the JobMaxxing toolbar icon.
2. Select **Grab this posting**.
3. Review the extracted fields and optionally attach the exact resume and cover letter you used.
4. Save the application.
5. Use **Open in JobMaxxing** to edit details, run a career match or manage the saved documents.

If the current page is already tracked, the popup offers to update or open the existing application instead of silently creating another copy.

## Permissions

The packaged manifest requests access only to supported job-board hosts, Supabase, localhost and `jobmaxxing.app`. Storage keeps the extension session and local preferences, active-tab and scripting access capture the posting you request, alarms power local follow-ups, and tab access opens JobMaxxing or inspects the current page. Other sites use Chrome optional host permissions and are requested only when manual capture needs them.

## Tests

```bash
npm test
```

The test suite covers status mapping, job URL normalization, network error handling, page detection, document policy and the capture workflow.

## Related repository

Web app, API and database migrations: [RohanGottipati/JobMaxxing](https://github.com/RohanGottipati/JobMaxxing)
