import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJobUrl, findByJobUrl } from './util/job-url.js';

test('canonicalJobUrl standardizes Dayforce HCM job posting URLs', () => {
  const urlWithLocaleAndTracking =
    'https://jobs.dayforcehcm.com/en-US/qfg/candidateportal/jobs/17620?utm_source=intern_insider';
  assert.equal(
    canonicalJobUrl(urlWithLocaleAndTracking),
    'jobs.dayforcehcm.com/qfg?job=17620',
  );

  const urlWithoutLocale =
    'https://jobs.dayforcehcm.com/qfg/candidateportal/jobs/17620';
  assert.equal(
    canonicalJobUrl(urlWithoutLocale),
    'jobs.dayforcehcm.com/qfg?job=17620',
  );

  const dayforceComUrl =
    'https://jobs.dayforce.com/clientname/candidateportal/jobs/54321';
  assert.equal(
    canonicalJobUrl(dayforceComUrl),
    'jobs.dayforce.com/clientname?job=54321',
  );
});

test('canonicalJobUrl standardizes LinkedIn, Greenhouse, and other standard job URLs', () => {
  assert.equal(
    canonicalJobUrl('https://www.linkedin.com/jobs/view/123456789/?refId=foo'),
    'linkedin.com?job=123456789',
  );
  assert.equal(
    canonicalJobUrl('https://boards.greenhouse.io/company/jobs/987654'),
    'boards.greenhouse.io?job=987654',
  );
});

test('findByJobUrl matches applications by canonical URL regardless of query params', () => {
  const index = [
    {
      id: 'app-1',
      jobUrl:
        'https://jobs.dayforcehcm.com/en-US/qfg/candidateportal/jobs/17620',
    },
  ];
  const match = findByJobUrl(
    index,
    'https://jobs.dayforcehcm.com/en-US/qfg/candidateportal/jobs/17620?utm_source=intern_insider',
  );
  assert.ok(match);
  assert.equal(match.id, 'app-1');
});
