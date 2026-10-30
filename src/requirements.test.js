import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeRequirements } from './requirements.js';

function statuses(result) {
  return Object.fromEntries(result.items.map((item) => [item.key, item.status]));
}

test('detects required documents listed in one sentence', () => {
  const result = analyzeRequirements({
    description: 'To apply, please submit your resume, cover letter, and unofficial transcript.',
  });
  assert.deepEqual(statuses(result), {
    resume: 'required',
    coverLetter: 'required',
    transcript: 'required',
  });
  assert.equal(result.items.find((item) => item.key === 'transcript').detail, 'Unofficial accepted');
});

test('separates optional and required documents in the same sentence', () => {
  const result = analyzeRequirements({
    description: 'Please submit your resume and, optionally, a cover letter.',
  });
  assert.deepEqual(statuses(result), { resume: 'required', coverLetter: 'optional' });

  const split = analyzeRequirements({ description: 'Resume is required, cover letter optional.' });
  assert.deepEqual(statuses(split), { resume: 'required', coverLetter: 'optional' });

  const shared = analyzeRequirements({ description: 'Resume and cover letter are optional.' });
  assert.deepEqual(statuses(shared), { resume: 'optional', coverLetter: 'optional' });
});

test('recognizes documents that are explicitly not needed', () => {
  const result = analyzeRequirements({
    description: 'Upload your resume. A cover letter is not required.\nNo transcripts please.',
  });
  assert.deepEqual(statuses(result), {
    resume: 'required',
    coverLetter: 'not_needed',
    transcript: 'not_needed',
  });
});

test('detects a single combined file requirement', () => {
  const result = analyzeRequirements({
    description:
      'Applications must include a resume, cover letter and transcript combined into one PDF document.',
  });
  assert.ok(result.combined);
  assert.deepEqual(result.combined.documents, ['Resume / CV', 'Cover letter', 'Transcript']);
  assert.equal(result.pdf, true);
  assert.equal(result.separate, false);
});

test('detects separate files and does not flag a combined requirement', () => {
  const result = analyzeRequirements({
    description: 'Please do not combine your resume and transcript; upload them as separate files.',
  });
  assert.equal(result.combined, null);
  assert.equal(result.separate, true);
});

test('bullets under an application heading inherit its requirement', () => {
  const result = analyzeRequirements({
    description: [
      'Required documents:',
      '• Resume',
      '• Transcript',
      'Optional materials:',
      '• Portfolio',
      'About us',
      'We value references from the community.',
    ].join('\n'),
  });
  assert.equal(statuses(result).resume, 'required');
  assert.equal(statuses(result).transcript, 'required');
  assert.equal(statuses(result).portfolio, 'optional');
  assert.equal(statuses(result).references, 'mentioned');
});

test('ignores résumés described as part of the job itself', () => {
  const result = analyzeRequirements({
    description: 'You will screen resumes and review CVs for open roles.',
  });
  assert.deepEqual(result.items, []);
});

test('uses upload fields from the application form', () => {
  const result = analyzeRequirements({
    fileFields: [
      { label: 'Resume/CV *', name: 'resume', required: false },
      { label: 'Cover Letter', name: 'cover_letter', required: false },
      { label: '', name: 'job_application[transcript]', required: true },
      { label: 'Additional documents', name: 'attachments', required: false },
    ],
  });
  assert.deepEqual(statuses(result), {
    resume: 'required',
    coverLetter: 'optional',
    transcript: 'required',
  });
  assert.equal(result.items[0].source, 'form');
  assert.deepEqual(result.otherUploads, ['Additional documents']);
});

test('an upload field asking for several documents means one combined file', () => {
  const result = analyzeRequirements({
    fileFields: [{ label: 'Resume, cover letter and transcript (single PDF)', required: true }],
  });
  assert.ok(result.combined);
  assert.equal(result.combined.documents.length, 3);
});

test('form requirements override weaker page mentions', () => {
  const result = analyzeRequirements({
    description: 'Cover letters are encouraged.',
    fileFields: [{ label: 'Cover letter', required: true }],
  });
  assert.equal(statuses(result).coverLetter, 'required');
});
