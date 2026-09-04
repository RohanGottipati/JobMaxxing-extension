import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applicationPackagePath,
  DOCX_MIME_TYPE,
  MAX_DOCUMENT_FILE_SIZE,
  PDF_MIME_TYPE,
  safeDocumentFileName,
  validateDocumentFile,
} from './document-policy.js';
import { fromTrackApp, toTrackApp } from './mapping.js';
import { todayLocalDate } from './util/date.js';
import { defaultMergedPdfName } from './util/pdf-name.js';
import {
  captureEligibility,
  injectionFailure,
  TAB_CHANGED,
  UNSCRIPTABLE_TAB,
} from './util/tab-url.js';

test('accepts only bounded PDF and DOCX application documents', () => {
  assert.equal(validateDocumentFile({ name: 'resume.pdf', type: PDF_MIME_TYPE, size: 42 }), null);
  assert.equal(validateDocumentFile({ name: 'letter.docx', type: DOCX_MIME_TYPE, size: 42 }), null);
  assert.match(
    validateDocumentFile({ name: 'resume.pdf', type: 'text/plain', size: 42 }),
    /PDF or DOCX/,
  );
  assert.match(validateDocumentFile({ name: 'resume.pdf', type: PDF_MIME_TYPE, size: 0 }), /empty/);
  assert.match(
    validateDocumentFile({
      name: 'resume.pdf',
      type: PDF_MIME_TYPE,
      size: MAX_DOCUMENT_FILE_SIZE + 1,
    }),
    /10 MB/,
  );
});

test('builds a user-scoped application-package path with a safe filename', () => {
  assert.equal(safeDocumentFileName('../../My Resume (final).pdf'), 'My-Resume-final.pdf');
  assert.equal(
    applicationPackagePath('user-id', '../../My Resume (final).pdf', 'object-id'),
    'user-id/application-packages/object-id-My-Resume-final.pdf',
  );
});

test('uses the browser local date instead of a UTC slice', () => {
  assert.equal(todayLocalDate(new Date(2026, 8, 3, 23, 30)), '2026-09-03');
});

test('defaults merged PDFs to the signed-in first and last name', () => {
  assert.equal(
    defaultMergedPdfName({ fullName: 'rohan gottipati' }),
    'Rohan_Gottipati_Application.pdf',
  );
  assert.equal(
    defaultMergedPdfName({ fullName: 'Mary Jane van Dyke' }),
    'Mary_Dyke_Application.pdf',
  );
  assert.equal(
    defaultMergedPdfName({ email: 'rohan.gottipati@example.com' }),
    'Rohan_Gottipati_Application.pdf',
  );
  assert.equal(defaultMergedPdfName(), 'Application.pdf');
});

test('classifies scriptable tabs and expected Chrome injection failures', () => {
  assert.equal(captureEligibility('https://jobs.example.com/role').ok, true);
  assert.deepEqual(captureEligibility('chrome://extensions'), {
    ok: false,
    code: UNSCRIPTABLE_TAB,
    message: 'Not a job posting',
  });
  assert.equal(
    captureEligibility('https://chromewebstore.google.com/detail/example').code,
    UNSCRIPTABLE_TAB,
  );
  assert.equal(injectionFailure(new Error('No tab with id: 42')).code, TAB_CHANGED);
  assert.equal(
    injectionFailure(new Error('Cannot access contents of the page')).code,
    UNSCRIPTABLE_TAB,
  );
  assert.equal(
    injectionFailure({ message: 'Cannot access a chrome:// URL' }).code,
    UNSCRIPTABLE_TAB,
  );
  assert.equal(injectionFailure(new Error('Unexpected internal failure')), null);
});

test('starts Grab disabled while the active page is being verified', async () => {
  const popup = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');
  assert.match(popup, /id="btn-grab"[^>]*aria-busy="false"[^>]*disabled/);
  assert.match(popup, /Grab works only on individual job postings/);
});

test('round-trips referral and submitted package identifiers through API mapping', () => {
  const payload = fromTrackApp({
    id: 'application-id',
    title: 'Engineer',
    company: 'Example',
    status: 'applied',
    referralContact: 'Taylor',
    submittedFiles: { resume: { path: 'resume' } },
  });
  assert.equal(payload.referralContact, 'Taylor');
  assert.deepEqual(payload.submittedFiles, { resume: { path: 'resume' } });

  const application = toTrackApp({
    id: 'application-id',
    roleTitle: 'Engineer',
    companyName: 'Example',
    status: 'applied',
    referralContact: 'Taylor',
    submittedResumeVersionId: 'resume-version-id',
    submittedCoverLetterId: 'cover-letter-id',
  });
  assert.equal(application.referralContact, 'Taylor');
  assert.equal(application.submittedResumeVersionId, 'resume-version-id');
  assert.equal(application.submittedCoverLetterId, 'cover-letter-id');
});
