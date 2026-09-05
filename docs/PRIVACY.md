# Privacy and data handling

Updated: September 4, 2026

This document describes version 1.2.1 of the JobMaxxing Chrome extension source. The operator of a packaged release must publish its own contact details, deployed privacy URL and any additional legal terms.

## Product boundary

The extension is a capture client for the JobMaxxing web app. It does not autofill or submit employer application forms, contact employers, send email, or sell a user's application data. The current source contains no advertising or third-party analytics integration.

## Data stored in Chrome

The extension uses `chrome.storage.local` for:

- the Supabase access token, refresh token, expiry and user identity needed to keep the user signed in;
- a display name and email used in the side panel;
- a recent-application index used for duplicate checks and recent items; and
- local preferences retained from supported extension workflows.

Signing out clears the stored session, display data and cached application index. Uninstalling the extension removes its Chrome-managed local storage.

## Job-page access

Content scripts on LinkedIn, Workday, Greenhouse, Lever and Ashby look for job-posting signals and may set a `NEW` badge. They do not send a job description to JobMaxxing merely because the page was opened.

After the user selects **Grab this posting**, the extension reads available page metadata, `JobPosting` structured data and visible job-description elements. The user can review and change the captured company, role, location, URL, description, deadline and recruiting season before saving. Manual entry is available when capture is not appropriate.

## Data sent to JobMaxxing and Supabase

The extension sends application fields to authenticated routes under `/api/extension/` at the configured `APP_URL`. PDF and DOCX application files are uploaded directly to a user-scoped path in the private `job-documents` Supabase Storage bucket. Each file is limited to 10 MB.

The extension uses a Supabase publishable key, which is intentionally public and does not bypass RLS. User JWTs identify the signed-in account. The matching web repository defines row-level and Storage policies that restrict records and files to their owner.

The extension can read and write Supabase session cookies for the configured JobMaxxing web origin and localhost so website and extension sign-in/sign-out state stay aligned. It does not read unrelated cookies.

## AI processing

Saving an application with a job description requests server-side parsing. Deterministic parsing runs on the JobMaxxing server without sending the description to an external AI model. When the web deployment has Gemini configured and the account has granted AI-processing consent, relevant job text may also be sent to Google Gemini for assisted extraction.

The Gemini key is held by the web server and is never included in the extension.

## Deletion

Deleting an application through JobMaxxing removes the record and attempts to remove the application-package files linked to it. The current web app does not provide self-service account deletion; the operator of a deployed instance is responsible for complete account-deletion requests and its own data-retention policy.

The matching public web summary is available at `/privacy` on the configured JobMaxxing deployment.
