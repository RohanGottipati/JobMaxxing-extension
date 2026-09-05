import assert from 'node:assert/strict';
import test from 'node:test';

import { detectJobPostingPage, scrapePage } from './scrape/page.js';

function createMockElement(tagName, attributes = {}, textContent = '', children = []) {
  const childNodes = children.length > 0 ? children : textContent ? [{ nodeType: 3, textContent }] : [];
  const element = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    attributes,
    getAttribute(name) {
      return attributes[name] || null;
    },
    textContent,
    innerText: textContent,
    children,
    childNodes,
    closest(selector) {
      if (selector.includes('hidden') && attributes.hidden) return element;
      return null;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const results = [];
      function match(el) {
        if (!el || !el.tagName) return;
        let matched = false;
        if (selector === el.tagName.toLowerCase()) matched = true;
        if (selector.startsWith('#') && el.attributes.id === selector.slice(1)) matched = true;
        if (selector.startsWith('.') && el.attributes.class?.split(/\s+/).includes(selector.slice(1))) matched = true;
        const attrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)(?:\*?=([\"']?)(.*?)\2)?\]/);
        if (attrMatch) {
          const [, attr, , val] = attrMatch;
          if (!val && el.attributes[attr] !== undefined) matched = true;
          else if (val && el.attributes[attr] === val) matched = true;
          else if (selector.includes('*=') && el.attributes[attr]?.includes(val)) matched = true;
        }
        if (matched) results.push(el);
        (el.children || []).forEach(match);
      }
      (this.children || []).forEach(match);
      return results;
    },
  };
  children.forEach((c) => {
    c.parentElement = element;
  });
  return element;
}

function setupMockDom({ location: loc, elements = [], title = '' }) {
  const root = createMockElement('html', {}, '', [
    createMockElement('head', {}, '', []),
    createMockElement('body', {}, '', elements),
  ]);

  const doc = {
    title,
    documentElement: root,
    body: root.children[1],
    querySelector(sel) {
      return root.querySelector(sel);
    },
    querySelectorAll(sel) {
      return root.querySelectorAll(sel);
    },
    getElementById(id) {
      return root.querySelector(`#${id}`);
    },
  };

  function setOwnerDocument(el) {
    if (!el || typeof el !== 'object') return;
    el.ownerDocument = doc;
    (el.children || []).forEach(setOwnerDocument);
  }
  setOwnerDocument(root);

  globalThis.location = new URL(loc);
  globalThis.document = doc;
  globalThis.window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    getSelection: () => ({ toString: () => '' }),
  };
  globalThis.DOMParser = class {
    parseFromString(str) {
      const parsedBody = createMockElement('body', {}, '', [
        { nodeType: 3, textContent: str.replace(/<[^>]+>/g, ' ') },
      ]);
      return { body: parsedBody };
    }
  };
}

test('detectJobPostingPage detects Dayforce job posting via __NEXT_DATA__', () => {
  const nextData = JSON.stringify({
    props: {
      pageProps: {
        jobData: {
          jobPostingId: '17620',
          jobTitle: '2027 Summer Actuarial Intern',
        },
      },
    },
  });

  const nextScript = createMockElement(
    'script',
    { id: '__NEXT_DATA__', type: 'application/json' },
    nextData,
  );
  const heading = createMockElement('h1', {}, '2027 Summer Actuarial Intern');

  setupMockDom({
    location: 'https://jobs.dayforcehcm.com/en-US/qfg/candidateportal/jobs/17620?utm_source=intern_insider',
    elements: [nextScript, heading],
    title: '2027 Summer Actuarial Intern',
  });

  const result = detectJobPostingPage();
  assert.equal(result.isJobPosting, true);
  assert.equal(result.signal, 'next-job-data');
});

test('detectJobPostingPage detects Dayforce job posting via route and DOM markers when hydrated', () => {
  const titleEl = createMockElement('div', { 'test-id': 'job-detail-title' }, 'Software Engineer Intern');
  const bodyEl = createMockElement(
    'div',
    { 'test-id': 'job-detail-body' },
    'Detailed description of the internship role and core responsibilities for students building software services.',
  );
  const applyBtn = createMockElement('button', { 'test-id': 'apply-button' }, 'Apply Now');
  const heading = createMockElement('h1', {}, 'Software Engineer Intern');

  setupMockDom({
    location: 'https://jobs.dayforcehcm.com/en-US/company/candidateportal/jobs/99999',
    elements: [titleEl, bodyEl, applyBtn, heading],
    title: 'Software Engineer Intern',
  });

  const result = detectJobPostingPage();
  assert.equal(result.isJobPosting, true);
  assert.equal(result.signal, 'supported-site');
});

test('scrapePage extracts complete Dayforce HCM job posting information', () => {
  const nextData = JSON.stringify({
    props: {
      pageProps: {
        jobData: {
          jobPostingId: '17620',
          jobTitle: '2027 Summer Actuarial Intern',
          postingExpiryTimestampUTC: '2026-09-22T23:59:59Z',
          postingLocations: [{ formattedAddress: 'Toronto, ON, Canada' }],
          jobPostingContent: {
            jobDescriptionHeader: 'Welcome to Questrade Financial Group.',
            jobDescription: 'Internship from May to August 2027. Work with actuarial teams.',
            jobDescriptionFooter: 'Equal Opportunity Employer.',
          },
        },
        dehydratedState: {
          queries: [
            {
              queryKey: ['site-info'],
              state: {
                data: {
                  candidateCorrespondenceClientName: 'Questrade Financial Group',
                },
              },
            },
          ],
        },
      },
    },
  });

  const nextScript = createMockElement(
    'script',
    { id: '__NEXT_DATA__', type: 'application/json' },
    nextData,
  );
  const heading = createMockElement('h1', {}, '2027 Summer Actuarial Intern');

  setupMockDom({
    location: 'https://jobs.dayforcehcm.com/en-US/qfg/candidateportal/jobs/17620?utm_source=intern_insider',
    elements: [nextScript, heading],
    title: '2027 Summer Actuarial Intern',
  });

  const scraped = scrapePage();
  assert.equal(scraped.title, '2027 Summer Actuarial Intern');
  assert.equal(scraped.company, 'Questrade Financial Group');
  assert.equal(scraped.location, 'Toronto, ON, Canada');
  assert.match(scraped.description, /Welcome to Questrade Financial Group/);
  assert.match(scraped.description, /Internship from May to August 2027/);
  assert.equal(scraped.deadline, '2026-09-22');
  assert.equal(scraped.recruitingSeason, 'Summer 2027');
  assert.equal(scraped.sourceHost, 'jobs.dayforcehcm.com');
  assert.equal(
    scraped.jobUrl,
    'https://jobs.dayforcehcm.com/en-US/qfg/candidateportal/jobs/17620?utm_source=intern_insider',
  );
});
