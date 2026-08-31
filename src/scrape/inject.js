(function () {
  'use strict';

  const BLOCK_TAGS = new Set([
    'P', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'LI', 'TABLE', 'TR',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'FOOTER', 'BLOCKQUOTE', 'PRE', 'DD', 'DT',
  ]);

  function extractFormatted(root) {
    let out = '';
    const walk = (node, depth) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.textContent.replace(/\s+/g, ' ');
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
        if (tag === 'BR') { out += '\n'; return; }
        if (tag === 'LI') {
          out += '\n' + '  '.repeat(Math.max(0, depth - 1)) + '• ';
          walk(child, depth);
          return;
        }
        const isList = tag === 'UL' || tag === 'OL';
        if (BLOCK_TAGS.has(tag)) out += '\n';
        walk(child, depth + (isList ? 1 : 0));
        if (BLOCK_TAGS.has(tag)) out += '\n';
      });
    };
    walk(root, 0);
    return normalizeText(out);
  }

  function normalizeText(s) {
    return (s || '')
      .split('\n')
      .map((line) => {
        const lead = line.match(/^[ \t]*/)[0];
        const body = line.slice(lead.length)
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/[ \t]+$/, '');
        return body ? lead + body : '';
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
  }

  function readDesc(el) {
    return el ? extractFormatted(el) : '';
  }

  function fromJsonLd(doc) {
    const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            return {
              title: item.title || '',
              company: item.hiringOrganization?.name || '',
              location: item.jobLocation?.address?.addressLocality || '',
              description: item.description
                ? readDesc(new DOMParser().parseFromString(item.description, 'text/html').body)
                : '',
            };
          }
        }
      } catch (_) {}
    }
    return null;
  }

  const ADAPTERS = {
    'linkedin.com': {
      scrape(doc) {
        const descEl = doc.querySelector('.jobs-description__content') || doc.querySelector('#job-details');
        const titleEl = doc.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
          doc.querySelector('.jobs-unified-top-card__job-title') || doc.querySelector('h1.t-24');
        const companyEl = doc.querySelector('.job-details-jobs-unified-top-card__company-name') ||
          doc.querySelector('.jobs-unified-top-card__company-name a');
        const locationEl = doc.querySelector('.job-details-jobs-unified-top-card__primary-description-without-tagline');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: companyEl ? companyEl.innerText.trim() : '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
    'myworkdayjobs.com': {
      scrape(doc) {
        const descEl = doc.querySelector('[data-automation-id="jobPostingDescription"]');
        const titleEl = doc.querySelector('[data-automation-id="jobPostingHeader"]');
        const locationEl = doc.querySelector('[data-automation-id="locations"]');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
    'greenhouse.io': {
      scrape(doc) {
        const descEl = doc.querySelector('#content') || doc.querySelector('.job__description');
        const titleEl = doc.querySelector('h1.app-title') || doc.querySelector('h1');
        const locationEl = doc.querySelector('.location');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
    'lever.co': {
      scrape(doc) {
        const sections = [...doc.querySelectorAll('.section-wrapper .section')];
        const titleEl = doc.querySelector('h2') || doc.querySelector('.posting-headline h2');
        const locationEl = doc.querySelector('.sort-by-location .location') || doc.querySelector('.posting-categories .location');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: sections.map(readDesc).filter(Boolean).join('\n\n'),
        };
      },
    },
    'ashbyhq.com': {
      scrape(doc) {
        const descEl = doc.querySelector('[class*="descriptionText"]') || doc.querySelector('[class*="jobDescription"]');
        const titleEl = doc.querySelector('h1');
        const locationEl = doc.querySelector('[class*="location"]');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
  };

  const IGNORE_TAGS = new Set(['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript']);

  function genericScrape(doc) {
    const sel = window.getSelection ? window.getSelection().toString().trim() : '';
    if (sel.length > 200) return sel;

    const cands = [...doc.querySelectorAll('div, article, section, main')]
      .filter((el) => !IGNORE_TAGS.has(el.tagName.toLowerCase()));
    let best = null;
    let bestScore = 0;
    for (const el of cands) {
      const t = el.innerText || '';
      const links = [...el.querySelectorAll('a')].reduce((a, x) => a + (x.innerText || '').length, 0);
      const score = t.length / (1 + links);
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (best && best.innerText.length > 300) return readDesc(best);
    return normalizeText(doc.body.innerText.slice(0, 20000));
  }

  function getAdapter() {
    const host = location.hostname;
    for (const [key, adapter] of Object.entries(ADAPTERS)) {
      if (host.endsWith(key)) return adapter;
    }
    return null;
  }

  function scrapePage() {
    const jsonLd = fromJsonLd(document);
    const adapter = getAdapter();
    const result = adapter ? adapter.scrape(document) : {};

    if (jsonLd) {
      if (jsonLd.title) result.title = jsonLd.title;
      if (jsonLd.company) result.company = jsonLd.company;
      if (jsonLd.location) result.location = jsonLd.location;
    }

    if (!result.title) {
      const og = document.querySelector('meta[property="og:title"]');
      result.title = og ? og.content : document.title;
    }

    if (!result.description) {
      const generic = genericScrape(document);
      const jd = (jsonLd && jsonLd.description) || '';
      result.description =
        ((generic.match(/\n/g) || []).length >= (jd.match(/\n/g) || []).length)
          ? generic : jd;
    }

    result.sourceHost = location.hostname;
    result.jobUrl = location.href;
    return result;
  }

  function isJobPage() {
    if (getAdapter()) return true;
    if (/\/(jobs?|careers?|apply)\//i.test(location.pathname)) return true;
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      try {
        const d = JSON.parse(s.textContent);
        const items = Array.isArray(d) ? d : [d];
        if (items.some((i) => i['@type'] === 'JobPosting')) return true;
      } catch (_) {}
    }
    return false;
  }

  globalThis.__jobMaxxingScrapePage = scrapePage;
  globalThis.__jobMaxxingIsJobPage = isJobPage;
})();
