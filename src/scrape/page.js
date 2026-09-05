// These functions are passed directly to chrome.scripting.executeScript. Keep
// all page-context helpers inside them because Chrome serializes each function
// without its module scope.
export function detectJobPostingPage() {
  function normalizedText(element) {
    return String(element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function visibleElements(selector) {
    return [...document.querySelectorAll(selector)].filter((element) => {
      if (element.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = window.getComputedStyle?.(element);
      return style?.display !== 'none' && style?.visibility !== 'hidden';
    });
  }

  function substantialText(selector, minimum = 180) {
    return visibleElements(selector).some((element) => normalizedText(element).length >= minimum);
  }

  function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  function collectJobPostings(value, results = []) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectJobPostings(item, results));
      return results;
    }
    const object = objectValue(value);
    if (!object) return results;
    const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']];
    if (
      types.some((type) => String(type || '').split(/[\/#]/).pop()?.toLowerCase() === 'jobposting')
    ) {
      results.push(object);
    }
    Object.values(object).forEach((child) => collectJobPostings(child, results));
    return results;
  }

  function samePage(value) {
    if (!value) return false;
    try {
      const candidate = new URL(String(value), location.href);
      const currentPath = location.pathname.replace(/\/+$/, '') || '/';
      const candidatePath = candidate.pathname.replace(/\/+$/, '') || '/';
      return candidate.hostname === location.hostname && candidatePath === currentPath;
    } catch {
      return false;
    }
  }

  const pageTitle = normalizedText(document.querySelector('h1')).toLowerCase();
  const nextDataScript = document.getElementById('__NEXT_DATA__');
  if (nextDataScript) {
    try {
      const nextData = JSON.parse(nextDataScript.textContent || '');
      const jobData = nextData?.props?.pageProps?.jobData;
      if (jobData?.jobTitle || jobData?.jobPostingId) {
        return { isJobPosting: true, signal: 'next-job-data', jobUrl: location.href };
      }
    } catch {
      // Ignore malformed and unrelated Next data blocks.
    }
  }

  const structuredPostings = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      collectJobPostings(JSON.parse(script.textContent || ''), structuredPostings);
    } catch {
      // Ignore malformed and unrelated structured-data blocks.
    }
  }
  const matchingStructuredPosting = structuredPostings.some((posting) => {
    if (structuredPostings.length === 1) return true;
    const postingTitle = String(posting.title || '').trim().toLowerCase();
    return samePage(posting.url) || Boolean(postingTitle && pageTitle.includes(postingTitle));
  });
  if (matchingStructuredPosting) {
    return { isJobPosting: true, signal: 'structured-data', jobUrl: location.href };
  }

  const host = location.hostname.toLowerCase();
  const path = location.pathname.toLowerCase();
  const hasHeading = pageTitle.length >= 3;
  const rules = [
    {
      host: 'linkedin.com',
      matches:
        /^\/jobs\/view\//.test(path) ||
        (new URLSearchParams(location.search).has('currentJobId') &&
          substantialText('.jobs-description__content, #job-details')),
    },
    {
      host: 'myworkdayjobs.com',
      matches:
        /\/job(?:\/|$)/.test(path) &&
        (substantialText('[data-automation-id="jobPostingDescription"]') ||
          Boolean(document.querySelector('[data-automation-id="jobPostingHeader"]'))),
    },
    {
      host: 'greenhouse.io',
      matches:
        hasHeading &&
        (substantialText('.job__description, [data-mapped="true"]') ||
          (/\/(?:jobs\/\d+|embed\/job_app)/.test(path) && substantialText('#content'))),
    },
    {
      host: 'lever.co',
      matches:
        Boolean(document.querySelector('.posting-headline h2')) &&
        substantialText('.section-wrapper .section'),
    },
    {
      host: 'ashbyhq.com',
      matches:
        hasHeading &&
        substantialText('[class*="descriptionText"], [class*="jobDescription"]'),
    },
    {
      host: 'dayforcehcm.com',
      matches:
        /\/jobs\/\d+/i.test(path) ||
        Boolean(
          document.querySelector(
            '[test-id="job-details-dayforce-jobs"], [test-id="job-detail-title"], [test-id="apply-button"]',
          ),
        ),
    },
    {
      host: 'dayforce.com',
      matches:
        /\/jobs\/\d+/i.test(path) ||
        Boolean(
          document.querySelector(
            '[test-id="job-details-dayforce-jobs"], [test-id="job-detail-title"], [test-id="apply-button"]',
          ),
        ),
    },
  ];
  if (
    rules.some(
      (rule) =>
        (host === rule.host || host.endsWith(`.${rule.host}`)) && rule.matches,
    )
  ) {
    return { isJobPosting: true, signal: 'supported-site', jobUrl: location.href };
  }

  const descriptionSelector = [
    '[itemprop="description"]',
    '#job-description',
    '#jobDescription',
    '[data-testid*="job-description" i]',
    '[data-qa*="job-description" i]',
    '[aria-label*="job description" i]',
    '[id*="job-description" i]',
    '[id*="jobDescription"]',
    '[class*="job-description" i]',
    '[class*="jobDescription"]',
    '[class*="job_description"]',
    '[test-id="job-detail-body"]',
    '[test-id="job-detail-header"]',
  ].join(',');
  const jobPath = /\/(?:jobs?|careers?|positions?|openings?|vacancies?|opportunities?)\/[^/?#]+/i.test(
    location.pathname,
  );
  if (hasHeading && substantialText(descriptionSelector, 240)) {
    return { isJobPosting: true, signal: 'description-container', jobUrl: location.href };
  }

  const mainText = visibleElements('main, article, [role="main"]')
    .map(normalizedText)
    .sort((left, right) => right.length - left.length)[0] || '';
  const sectionSignals = mainText.match(
    /\b(?:responsibilities|qualifications|requirements|about the role|what you(?:'ll| will) do|compensation|benefits)\b/gi,
  )?.length || 0;
  if (jobPath && hasHeading && mainText.length >= 500 && sectionSignals >= 2) {
    return { isJobPosting: true, signal: 'job-page-content', jobUrl: location.href };
  }

  return { isJobPosting: false, signal: null, jobUrl: location.href };
}

export function scrapePage() {
  const HARD_BREAK_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'TABLE', 'TR', 'DD', 'DT']);
  const PARAGRAPH_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE',
  ]);
  const REMOVE_FROM_DESCRIPTION = [
    'script',
    'style',
    'noscript',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'button',
    'input',
    'select',
    'textarea',
    'svg',
    'canvas',
    'iframe',
    '[hidden]',
    '[aria-hidden="true"]',
    '[style*="display:none" i]',
    '[style*="display: none" i]',
    '[style*="visibility:hidden" i]',
    '[style*="visibility: hidden" i]',
    '[class*="cookie" i]',
    '[id*="cookie" i]',
    '[class*="social" i]',
    '[class*="share" i]',
  ].join(',');

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map((line) => {
        const rawLead = line.match(/^[ \t]*/)?.[0] || '';
        const body = line.slice(rawLead.length).replace(/[ \t]+/g, ' ').trim();
        if (!body) return '';
        const indent = /^((?:•|-|\*) |\d+[.)] )/.test(body)
          ? ' '.repeat(Math.min(8, rawLead.replace(/\t/g, '  ').length))
          : '';
        return indent + body;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^([ \t]*(?:•|-|\*|\d+[.)]))[ \t]*\n+(?=[ \t]*\S)/gm, '$1 ')
      .replace(
        /^([ \t]*(?:•|-|\*|\d+[.)]) .*)\n\n(?=[ \t]*(?:•|-|\*|\d+[.)]) )/gm,
        '$1\n',
      )
      .trim();
  }

  function extractFormatted(root) {
    if (!root) return '';
    if (root.nodeType === 1 && root.matches?.(REMOVE_FROM_DESCRIPTION)) return '';

    let output = '';
    const newline = (count = 1) => {
      output = output.replace(/[ \t]+$/g, '');
      const trailing = output.match(/\n*$/)?.[0].length || 0;
      if (trailing < count) output += '\n'.repeat(count - trailing);
    };
    const appendText = (value, preserveWhitespace = false) => {
      const raw = String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
      const next = preserveWhitespace
        ? raw
        : raw.includes('\n')
          ? raw
              .split('\n')
              .map((line) => line.replace(/[ \t]+/g, ' ').trim())
              .join('\n')
              .replace(/^\n+|\n+$/g, '')
          : raw.replace(/\s+/g, ' ');
      if (!next.trim()) return;
      if (
        output &&
        !/[\s\n]$/.test(output) &&
        !/^[\s,.;:!?%)}\]]/.test(next)
      ) {
        output += ' ';
      }
      output += next;
    };
    const walk = (node, listDepth = 0, preserveWhitespace = false) => {
      const children = node.childNodes ? [...node.childNodes] : [...(node.children || [])];
      children.forEach((child) => {
        if (child.nodeType === 3) {
          appendText(child.textContent, preserveWhitespace);
          return;
        }
        if (child.nodeType !== 1) return;
        const tag = child.tagName;
        if (child.matches?.(REMOVE_FROM_DESCRIPTION)) return;
        const renderedStyle = child.ownerDocument === document
          ? window.getComputedStyle?.(child)
          : null;
        if (renderedStyle?.display === 'none' || renderedStyle?.visibility === 'hidden') return;
        if (tag === 'BR') {
          newline();
          return;
        }
        if (tag === 'LI') {
          newline();
          const siblings = [...(child.parentElement?.children || [])].filter(
            (element) => element.tagName === 'LI',
          );
          const ordered = child.parentElement?.tagName === 'OL';
          const marker = ordered ? `${siblings.indexOf(child) + 1}.` : '•';
          output += `${'  '.repeat(Math.max(0, listDepth - 1))}${marker} `;
          walk(child, listDepth, preserveWhitespace);
          newline();
          return;
        }
        if (tag === 'UL' || tag === 'OL') {
          newline();
          walk(child, listDepth + 1, preserveWhitespace);
          newline();
          return;
        }
        if (tag === 'TD' || tag === 'TH') {
          if (output && !/\n$/.test(output)) output += ' | ';
          walk(child, listDepth, preserveWhitespace);
          return;
        }
        const isRenderedBlock = /^(?:block|flex|grid|flow-root|table|table-row)$/.test(
          renderedStyle?.display || '',
        );
        const breaks = PARAGRAPH_TAGS.has(tag)
          ? 2
          : HARD_BREAK_TAGS.has(tag) || isRenderedBlock
            ? 1
            : 0;
        if (breaks) newline(breaks);
        walk(child, listDepth, preserveWhitespace || tag === 'PRE');
        if (breaks) newline(breaks);
      });
    };
    walk(root);
    return normalizeText(output);
  }

  function text(element) {
    return normalizeText(
      element?.innerText ||
        element?.textContent ||
        element?.getAttribute?.('alt') ||
        element?.getAttribute?.('title') ||
        '',
    );
  }

  function meta(selector) {
    return normalizeText(document.querySelector(selector)?.content || '');
  }

  function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  function stringValue(value) {
    if (typeof value === 'string') return normalizeText(value);
    if (Array.isArray(value)) return value.map(stringValue).find(Boolean) || '';
    const object = objectValue(value);
    return normalizeText(object?.name || object?.legalName || object?.alternateName || '');
  }

  function cleanCompanyName(value, allowPlatformName = false) {
    let candidate = normalizeText(value).split('\n')[0]?.trim() || '';
    candidate = candidate
      .replace(/^(?:company|employer)\s*:\s*/i, '')
      .replace(/^(?:careers?|jobs?)\s+(?:at|with)\s+/i, '')
      .replace(/^at\s+/i, '')
      .replace(/\s+(?:company\s+)?logo$/i, '')
      .replace(/\s*[|·]\s*(?:careers?|jobs?|job board)$/i, '')
      .replace(/\s+(?:careers?|jobs?)$/i, '')
      .trim();
    if (!candidate || candidate.length > 160) return '';
    if (
      /^(?:company|employer|careers?|jobs?|job board|careers? home|jobs? home|job search|search jobs?|search careers?|career opportunities|view (?:all )?jobs?|job details?|job postings?|job vacanc(?:y|ies)|career details?)$/i.test(candidate)
    ) {
      return '';
    }
    if (
      !allowPlatformName &&
      /^(?:linkedin(?: jobs)?|workday|greenhouse|lever|ashby|dayforce(?: hcm| jobs)?)(?: recruiting)?$/i.test(candidate)
    ) {
      return '';
    }
    return candidate;
  }

  function firstCompanyText(selectors) {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const metadataCandidate = cleanCompanyName(element.getAttribute?.('content'));
        if (metadataCandidate) return metadataCandidate;
        if (element.closest('[hidden], [aria-hidden="true"]')) continue;
        const style = window.getComputedStyle?.(element);
        if (style?.display === 'none' || style?.visibility === 'hidden') continue;
        const candidate = cleanCompanyName(
          text(element) || element.getAttribute?.('aria-label'),
        );
        if (candidate) return candidate;
      }
    }
    return '';
  }

  function companyFromPageTitle(roleTitle) {
    const pageTitle = meta('meta[property="og:title"]') || normalizeText(document.title);
    if (!pageTitle) return '';
    const parts = pageTitle
      .split(/\s+(?:\||—|–|-|at)\s+/i)
      .map((part) => cleanCompanyName(part))
      .filter(Boolean);
    const normalizedRole = normalizeText(roleTitle).toLowerCase();
    return parts.find((part) => {
      if (!normalizedRole) return true;
      const normalized = part.toLowerCase();
      return normalized !== normalizedRole &&
        !normalizedRole.includes(normalized) &&
        !normalized.includes(normalizedRole);
    }) || '';
  }

  function humanizeCompanySlug(value) {
    let decoded;
    try {
      decoded = decodeURIComponent(String(value || ''));
    } catch {
      decoded = String(value || '');
    }
    const words = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!words || /^(?:jobs?|careers?|embed|job_app)$/i.test(words)) return '';
    return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }

  function companyFromAtsUrl() {
    const host = location.hostname.toLowerCase();
    const segments = location.pathname.split('/').filter(Boolean);
    if (host === 'lever.co' || host.endsWith('.lever.co')) {
      return humanizeCompanySlug(segments[0]);
    }
    if (host === 'greenhouse.io' || host.endsWith('.greenhouse.io')) {
      const companySegment = segments[0] === 'embed' ? '' : segments[0];
      return humanizeCompanySlug(companySegment);
    }
    if (host === 'ashbyhq.com' || host.endsWith('.ashbyhq.com')) {
      return humanizeCompanySlug(segments[0]);
    }
    if (host === 'myworkdayjobs.com' || host.endsWith('.myworkdayjobs.com')) {
      const account = host.split('.')[0]?.replace(/\.wd\d*$/i, '');
      return humanizeCompanySlug(account);
    }
    if (
      host === 'dayforcehcm.com' ||
      host.endsWith('.dayforcehcm.com') ||
      host === 'dayforce.com' ||
      host.endsWith('.dayforce.com')
    ) {
      const match = location.pathname.match(
        /(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/([^/]+)\/candidateportal/i,
      );
      if (match) return humanizeCompanySlug(match[1]);
    }
    return '';
  }

  function genericCompany(roleTitle) {
    const visible = firstCompanyText([
      '[itemprop="hiringOrganization"] [itemprop="name"]',
      '[itemprop="hiringOrganization"]',
      '[data-automation-id="jobPostingCompany"]',
      '[data-automation-id="company"]',
      '[data-testid*="company-name" i]',
      '[data-testid*="companyName"]',
      '[data-qa*="company" i]',
      '[class*="company-name" i]',
      '[class*="companyName"]',
      '[class~="job-company"]',
      '[class~="employer-name"]',
    ]);
    if (visible) return visible;

    const brandedLogo = firstCompanyText([
      'img[itemprop="logo"][alt]',
      'header [class*="logo" i] img[alt]',
      'header img[src*="logo" i][alt]',
      '[class*="logo" i] img[alt]',
    ]);
    if (brandedLogo) return brandedLogo;

    const titleCompany = companyFromPageTitle(roleTitle);
    if (titleCompany) return titleCompany;

    const siteName = cleanCompanyName(meta('meta[property="og:site_name"]'));
    if (siteName) return siteName;
    const socialImageBrand = cleanCompanyName(meta('meta[property="og:image:alt"]'));
    if (socialImageBrand) return socialImageBrand;
    return companyFromAtsUrl();
  }

  function collectJobPostings(value, results = []) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectJobPostings(item, results));
      return results;
    }
    const object = objectValue(value);
    if (!object) return results;
    const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']];
    if (
      types.some((type) => String(type || '').split(/[\/#]/).pop()?.toLowerCase() === 'jobposting')
    ) {
      results.push(object);
    }
    Object.values(object).forEach((child) => collectJobPostings(child, results));
    return results;
  }

  function locationValue(value) {
    const locations = Array.isArray(value) ? value : value ? [value] : [];
    return locations
      .map((item) => {
        if (typeof item === 'string') return normalizeText(item);
        const locationObject = objectValue(item);
        const address = objectValue(locationObject?.address);
        if (!address) return stringValue(locationObject?.name);
        return [
          address.streetAddress,
          address.addressLocality,
          address.addressRegion,
          stringValue(address.addressCountry),
        ]
          .map(stringValue)
          .filter(Boolean)
          .join(', ');
      })
      .filter(Boolean)
      .join('; ');
  }

  function dateValue(value) {
    const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return '';
    const [year, month, day] = match[1].split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
      ? match[1]
      : '';
  }

  function formatPlainDescription(value) {
    const headings = [
      'about the role',
      'about you',
      'about us',
      "what you(?:[’']ll| will) do",
      'responsibilities',
      'qualifications',
      'requirements',
      'preferred qualifications',
      'benefits',
      'compensation',
      'salary',
    ].join('|');
    return normalizeText(
      String(value || '')
        .replace(/\s+(?=[•▪◦]\s*)/g, '\n')
        .replace(new RegExp(`(?:^|\\s+)(${headings})\\s*:\\s*`, 'gi'), '\n\n$1\n'),
    );
  }

  function htmlDescription(value) {
    if (!value) return '';
    const source = String(value).replace(/\r\n?/g, '\n');
    if (!/<[a-z][^>]*>/i.test(source)) {
      const decoded = new DOMParser().parseFromString(source, 'text/html').body.textContent || source;
      if (!/<[a-z][^>]*>/i.test(decoded)) return formatPlainDescription(decoded);
      const decodedMarkup = new DOMParser().parseFromString(decoded, 'text/html');
      return extractFormatted(decodedMarkup.body);
    }
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    return extractFormatted(parsed.body);
  }

  function descriptionScore(value) {
    const normalized = normalizeText(value);
    if (!normalized) return 0;
    const sectionSignals = normalized.match(
      /(?:^|\n)(?:about (?:the role|you|us)|what you(?:'ll| will) do|responsibilities|qualifications|requirements|preferred|benefits|compensation|salary)(?:\s|:|$)/gim,
    )?.length || 0;
    const boilerplateSignals = normalized.match(
      /(?:cookie preferences|privacy policy|sign in to apply|create (?:a|an) account|share this job)/gi,
    )?.length || 0;
    const lineBreaks = Math.min(100, normalized.match(/\n/g)?.length || 0);
    return Math.min(normalized.length, 80_000) +
      sectionSignals * 600 +
      lineBreaks * 8 -
      boilerplateSignals * 1_000;
  }

  function sameJobUrl(value) {
    if (!value) return false;
    try {
      const candidate = new URL(String(value), location.href);
      const currentPath = location.pathname.replace(/\/+$/, '') || '/';
      const candidatePath = candidate.pathname.replace(/\/+$/, '') || '/';
      return candidate.hostname === location.hostname && candidatePath === currentPath;
    } catch {
      return false;
    }
  }

  function structuredData() {
    const postings = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        collectJobPostings(JSON.parse(script.textContent || ''), postings);
      } catch {
        // Continue through malformed or unrelated structured-data blocks.
      }
    }
    const visibleTitle = text(document.querySelector('h1')) || meta('meta[property="og:title"]');
    return postings
      .map((job) => {
        const remoteLocation = stringValue(job.applicantLocationRequirements);
        const data = {
          title: stringValue(job.title),
          company: stringValue(job.hiringOrganization),
          location: locationValue(job.jobLocation) || remoteLocation,
          description: htmlDescription(job.description),
          deadline: dateValue(job.validThrough),
        };
        const titleMatches = data.title && visibleTitle
          ? visibleTitle.toLowerCase().includes(data.title.toLowerCase())
          : false;
        return {
          data,
          score:
            descriptionScore(data.description) +
            (sameJobUrl(job.url) ? 1_000_000 : 0) +
            (titleMatches ? 100_000 : 0),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.data || {};
  }

  function cleanLinkedInLocation(value) {
    return normalizeText(String(value || '').split('·', 1)[0]);
  }

  const adapters = {
    'linkedin.com': () => ({
      title: text(
        document.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
          document.querySelector('.jobs-unified-top-card__job-title') ||
          document.querySelector('h1.t-24'),
      ),
      company: text(
        document.querySelector('.job-details-jobs-unified-top-card__company-name a') ||
          document.querySelector('.job-details-jobs-unified-top-card__company-name') ||
          document.querySelector('.jobs-unified-top-card__company-name a') ||
          document.querySelector('.jobs-unified-top-card__company-name') ||
          document.querySelector('.topcard__org-name-link'),
      ),
      location: cleanLinkedInLocation(
        text(
          document.querySelector('.job-details-jobs-unified-top-card__primary-description-without-tagline') ||
            document.querySelector('.jobs-unified-top-card__bullet'),
        ),
      ),
      description: extractFormatted(
        document.querySelector('.jobs-description__content') || document.querySelector('#job-details'),
      ),
    }),
    'myworkdayjobs.com': () => ({
      title: text(document.querySelector('[data-automation-id="jobPostingHeader"]')),
      company: text(
        document.querySelector('[data-automation-id="company"]') ||
          document.querySelector('[data-automation-id="jobPostingCompany"]'),
      ),
      location: text(document.querySelector('[data-automation-id="locations"]')),
      description: extractFormatted(
        document.querySelector('[data-automation-id="jobPostingDescription"]'),
      ),
    }),
    'greenhouse.io': () => ({
      title: text(document.querySelector('h1.app-title') || document.querySelector('h1')),
      company: text(
        document.querySelector('.company-name') ||
          document.querySelector('.job__company') ||
          document.querySelector('#logo img[alt]'),
      ),
      location: text(document.querySelector('.location')),
      description: extractFormatted(
        document.querySelector('.job__description') ||
          document.querySelector('[data-mapped="true"]') ||
          document.querySelector('#content'),
      ),
    }),
    'lever.co': () => ({
      title: text(document.querySelector('.posting-headline h2') || document.querySelector('h2')),
      company: text(
        document.querySelector('.posting-headline .company') ||
          document.querySelector('.main-header-logo img[alt]'),
      ),
      location: text(
        document.querySelector('.posting-categories .location') ||
          document.querySelector('.sort-by-location .location'),
      ),
      description: [...document.querySelectorAll('.section-wrapper .section')]
        .map(extractFormatted)
        .filter(Boolean)
        .join('\n\n'),
    }),
    'ashbyhq.com': () => ({
      title: text(document.querySelector('h1')),
      company: text(
        document.querySelector('[class*="companyName"]') ||
          document.querySelector('[class*="organizationName"]') ||
          document.querySelector('header img[alt]'),
      ),
      location: text(document.querySelector('[class*="location"]')),
      description: extractFormatted(
        document.querySelector('[class*="descriptionText"]') ||
          document.querySelector('[class*="jobDescription"]'),
      ),
    }),
    'dayforcehcm.com': () => scrapeDayforce(),
    'dayforce.com': () => scrapeDayforce(),
  };

  function scrapeDayforce() {
    let nextData = null;
    try {
      const script = document.getElementById('__NEXT_DATA__');
      if (script) nextData = JSON.parse(script.textContent || '');
    } catch {
      // Ignore JSON parse errors
    }

    const pageProps = nextData?.props?.pageProps;
    const jobData = pageProps?.jobData;
    const queries = pageProps?.dehydratedState?.queries || [];
    const siteInfo = queries.find(
      (q) => Array.isArray(q?.queryKey) && q.queryKey[0] === 'site-info',
    )?.state?.data;

    const title =
      text(document.querySelector('[test-id="job-detail-title"]')) ||
      jobData?.jobTitle ||
      text(document.querySelector('h1'));

    const company =
      siteInfo?.candidateCorrespondenceClientName ||
      document.querySelector('[test-id="header-logo"] img')?.getAttribute('alt') ||
      '';

    const locations = (jobData?.postingLocations || [])
      .map((loc) =>
        loc.formattedAddress ||
        [loc.cityName, loc.stateCode, loc.isoCountryCode].filter(Boolean).join(', '),
      )
      .filter(Boolean)
      .join('; ');

    const location =
      locations ||
      text(
        document.querySelector('[test-id="job-detail-location-list"]') ||
          document.querySelector('[test-id="job-detail-location-name"]'),
      );

    const domDesc = [
      document.querySelector('[test-id="job-detail-header"]'),
      document.querySelector('[test-id="job-detail-body"]'),
      document.querySelector('[test-id="job-detail-footer"]'),
    ]
      .map(extractFormatted)
      .filter(Boolean)
      .join('\n\n');

    const dataDesc = jobData?.jobPostingContent
      ? (typeof jobData.jobPostingContent === 'string'
          ? htmlDescription(jobData.jobPostingContent)
          : htmlDescription(
              [
                jobData.jobPostingContent.jobDescriptionHeader,
                jobData.jobPostingContent.jobDescription,
                jobData.jobPostingContent.jobDescriptionFooter,
              ]
                .filter(Boolean)
                .join('\n\n'),
            ))
      : '';

    const description = domDesc || dataDesc;
    const deadline = dateValue(jobData?.postingExpiryTimestampUTC);

    return {
      title,
      company,
      location,
      description,
      deadline,
    };
  }

  function adapterData() {
    const host = location.hostname.toLowerCase();
    for (const [suffix, scrape] of Object.entries(adapters)) {
      if (host === suffix || host.endsWith(`.${suffix}`)) return scrape();
    }
    return {};
  }

  function commonDescription() {
    const selectors = [
      '[itemprop="description"]',
      '#job-description',
      '#jobDescription',
      '[data-testid*="job-description" i]',
      '[data-qa*="job-description" i]',
      '[data-automation-id="jobPostingDescription"]',
      '[aria-label*="job description" i]',
      '[id*="job-description" i]',
      '[id*="jobDescription"]',
      '[class*="job-description" i]',
      '[class*="jobDescription"]',
      '[class*="job_description"]',
      '[test-id="job-detail-body"]',
      '[test-id="job-detail-header"]',
    ];
    const candidates = [...new Set(selectors.flatMap((selector) => [
      ...document.querySelectorAll(selector),
    ]))].filter((element) => {
      if (element.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = window.getComputedStyle?.(element);
      return style?.display !== 'none' && style?.visibility !== 'hidden';
    });
    return candidates
      .map((element) => extractFormatted(element))
      .filter((value) => value.length >= 160)
      .sort((left, right) => descriptionScore(right) - descriptionScore(left))[0] || '';
  }

  function genericDescription() {
    const selected = window.getSelection?.().toString().trim() || '';
    if (selected.length > 200) return normalizeText(selected);
    const roughCandidates = [];
    for (const element of document.querySelectorAll('div, article, section, main')) {
      if (element.closest('[hidden], [aria-hidden="true"]')) continue;
      const value = element.innerText || element.textContent || '';
      if (value.length < 300) continue;
      const linkText = [...element.querySelectorAll('a')].reduce(
        (sum, link) => sum + (link.innerText || link.textContent || '').length,
        0,
      );
      const controlText = [...element.querySelectorAll('button, input, select, textarea')].reduce(
        (sum, control) => sum + (control.innerText || control.textContent || '').length + 20,
        0,
      );
      roughCandidates.push({ element, linkText, controlText, length: value.length });
    }
    const best = roughCandidates
      .sort((left, right) => right.length - left.length)
      .slice(0, 25)
      .map(({ element, linkText, controlText }) => {
        const value = extractFormatted(element);
        return {
          value,
          score: descriptionScore(value) - linkText * 2 - controlText * 4,
        };
      })
      .filter(({ value }) => value.length > 300)
      .sort((left, right) => right.score - left.score)[0];
    if (best) return best.value;
    return extractFormatted(document.body);
  }

  function selectedDescription() {
    const selected = window.getSelection?.().toString().trim() || '';
    return selected.length > 200 ? normalizeText(selected) : '';
  }

  function bestDescription(candidates) {
    return candidates
      .map(normalizeText)
      .filter((value) => value.length >= 160)
      .sort((left, right) => descriptionScore(right) - descriptionScore(left))[0] || '';
  }

  function truncateAtBoundary(value, maximum) {
    const normalized = normalizeText(value);
    if (normalized.length <= maximum) return normalized;
    const sliced = normalized.slice(0, maximum - 1);
    const boundary = Math.max(sliced.lastIndexOf('\n\n'), sliced.lastIndexOf('\n'));
    return `${(boundary >= maximum * 0.8 ? sliced.slice(0, boundary) : sliced).trimEnd()}…`;
  }

  function recruitingSeason(value) {
    const direct = String(value || '').match(/\b(winter|spring|summer|fall|autumn)\s+(20\d{2})\b/i);
    const reverse = String(value || '').match(/\b(20\d{2})\s+(winter|spring|summer|fall|autumn)\b/i);
    const season = direct?.[1] || reverse?.[2];
    const year = direct?.[2] || reverse?.[1];
    if (season && year) {
      const normalized = season.toLowerCase() === 'autumn' ? 'Fall' : `${season[0].toUpperCase()}${season.slice(1).toLowerCase()}`;
      return `${normalized} ${year}`;
    }
    const monthRange = String(value || '').match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:to|-)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/i,
    );
    if (monthRange) {
      const startMonth = monthRange[1].toLowerCase();
      const endMonth = monthRange[2].toLowerCase();
      const rangeYear = monthRange[3];
      if (/^(may|june|july)$/.test(startMonth) && /^(august|september)$/.test(endMonth)) {
        return `Summer ${rangeYear}`;
      }
      if (/^(january|february)$/.test(startMonth) && /^(april|may)$/.test(endMonth)) {
        return `Winter ${rangeYear}`;
      }
      if (/^(september|october)$/.test(startMonth) && /^(december)$/.test(endMonth)) {
        return `Fall ${rangeYear}`;
      }
    }
    const internYear = String(value || '').match(/\b(20\d{2})\s+intern(?:ship)?\b/i) ||
      String(value || '').match(/\bintern(?:ship)?\s+(?:cohort\s+)?(20\d{2})\b/i);
    if (internYear) {
      return `Summer ${internYear[1]}`;
    }
    return '';
  }

  const structured = structuredData();
  const adapter = adapterData();
  const selected = selectedDescription();
  const targetedDescription = bestDescription([
    structured.description,
    adapter.description,
    commonDescription(),
  ]);
  const title =
    structured.title ||
    adapter.title ||
    text(document.querySelector('[itemprop="title"], h1')) ||
    meta('meta[property="og:title"]') ||
    document.title;
  const description =
    selected ||
    targetedDescription ||
    genericDescription() ||
    meta('meta[name="description"]');
  const company =
    cleanCompanyName(structured.company, true) ||
    cleanCompanyName(adapter.company, true) ||
    genericCompany(title);
  const locationText = structured.location || adapter.location || '';

  return {
    title: normalizeText(title).slice(0, 200),
    company: normalizeText(company).slice(0, 200),
    location: normalizeText(locationText).slice(0, 200),
    description: truncateAtBoundary(description, 200_000),
    deadline: structured.deadline || adapter.deadline || '',
    recruitingSeason: recruitingSeason(`${title}\n${description}`),
    sourceHost: location.hostname,
    jobUrl: location.href,
  };
}
