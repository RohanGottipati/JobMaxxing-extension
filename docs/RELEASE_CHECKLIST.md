# Chrome extension release checklist

Updated: September 4, 2026

Use this checklist for a developer-distributed archive or Chrome Web Store submission. The repository's current version is 1.2.1 and requires Chrome 114 or newer because it uses the Side Panel API.

## 1. Configure the production targets

- Copy `config.example.js` to the ignored `config.js` file.
- Set `SUPABASE_URL` to the hosted project's HTTPS API URL.
- Set `SUPABASE_PUBLISHABLE_KEY` to an `sb_publishable_...` key. Never package a secret or legacy service-role key.
- Set `APP_URL` to the deployed JobMaxxing HTTPS origin.
- Replace or confirm the JobMaxxing origin under `host_permissions` in `manifest.json`.
- Remove the localhost host permission from the store build when local development access is not needed.
- Verify that the deployed `/api/health`, `/privacy`, sign-in, capture and application deep links work from a clean Chrome profile.

## 2. Verify the package

- Confirm `manifest.json` and `package.json` use the same version.
- Run `npm test`.
- Load the repository unpacked from `chrome://extensions` and check that Chrome reports no manifest or service-worker errors.
- Test sign-in from both the website and side panel, then test sign-out from both directions.
- Capture one supported posting, one structured-data posting outside the built-in list and one manual application.
- Upload one PDF and one DOCX, verify the saved package in the web app, then delete the fixture.
- Confirm the packaged archive contains `config.js`, runtime source, `vendor/pdf-lib.min.js` and icons, but excludes `.git`, local screenshots and developer secrets.

## 3. Store listing copy

Keep the short description aligned with `manifest.json`:

> Capture job postings, track application status, and save the resume and cover letter you submitted.

Suggested detailed description:

> JobMaxxing is a companion capture client for the JobMaxxing web app. Open an individual posting, review the extracted company, role, location, description and dates, then save it to your private application workspace. Attach the PDF or DOCX resume and cover letter used for the role, track all eight application statuses and open the saved record in the web app. JobMaxxing does not autofill or submit employer forms.

The listing must not advertise unavailable alarms, export tools, automatic application submission or a different website domain. Screenshots should show the current side panel, not the retired popup UI.

## 4. Privacy and permission disclosures

- Publish [PRIVACY.md](./PRIVACY.md) at an HTTPS URL controlled by the release operator.
- Disclose handling of authentication information, personally identifiable information, website content and uploaded documents.
- Explain each requested permission using the current behavior in the README.
- Confirm that no optional all-sites host permission is present.
- Recheck Supabase RLS, Storage policies and API grants before submission.

## 5. Release record

- Commit the tested source and create a version tag only after the packaged build is approved.
- Save the exact uploaded archive and store-listing text with the release record.
- After rollout, verify the installed version, deep links, privacy link and update path from the previous release.
