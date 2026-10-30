// Detects which documents an application asks for (resume, cover letter,
// transcript, …) from the captured job description, instruction lines found
// elsewhere on the page, and the page's file-upload fields. Pure functions so
// the side panel can re-run the analysis as the description is edited.

const NOT_LETTER_BEFORE = '(?<!\\p{L})';
const NOT_LETTER_AFTER = '(?!\\p{L})';

export const REQUIREMENT_DOCUMENTS = [
  { key: 'resume', label: 'Resume / CV', source: 'r[eé]sum[eé]s?|curriculum vitae|cvs?' },
  {
    key: 'coverLetter',
    label: 'Cover letter',
    source: 'cover[\\s-]*letters?|letters? of (?:interest|intent|motivation)|motivation(?:al)? letters?',
  },
  { key: 'transcript', label: 'Transcript', source: 'transcripts?|grade reports?|academic records?' },
  {
    key: 'enrollment',
    label: 'Proof of enrollment',
    source: 'proof of (?:enrol{1,2}ment|registration)|enrol{1,2}ment (?:verification|letter|confirmation)',
  },
  {
    key: 'portfolio',
    label: 'Portfolio / work samples',
    source: 'portfolios?|work samples?|design samples?|code samples?',
  },
  { key: 'writingSample', label: 'Writing sample', source: 'writing samples?' },
  {
    key: 'recommendation',
    label: 'Recommendation letter',
    source: '(?:recommendation|reference) letters?|letters? of (?:recommendation|reference)',
  },
  { key: 'references', label: 'References', source: 'references|referees|reference list' },
].map((doc) => ({
  ...doc,
  pattern: new RegExp(`${NOT_LETTER_BEFORE}(?:${doc.source})${NOT_LETTER_AFTER}`, 'giu'),
}));

const OPTIONAL_CUE =
  /\b(?:optional(?:ly)?|if (?:available|applicable|any|possible|you (?:have|wish|like|want|choose))|encouraged|welcome[ds]?|appreciated|nice to have|preferred|a plus|bonus|recommended|may (?:also )?(?:include|submit|attach|upload|add|provide))\b/i;
const NOT_NEEDED_CUE =
  /\b(?:not (?:required|necessary|needed|mandatory|accepted)|no need|(?:do|does) not (?:need|require|submit|send|include|attach)|don['’]t (?:need|submit|send|include|attach)|(?:will|are|is) not (?:be )?(?:reviewed|considered|accepted|read|required|needed))\b/i;
const NO_BEFORE = /\b(?:no|without)\s+(?:an?\s+|any\s+|your\s+)?$/i;
const REQUIRED_CUE =
  /\b(?:required|requires?|mandatory|must|need(?:s|ed)? to|please|submit(?:ted)?|upload(?:ed)?|attach(?:ed)?|include[ds]?|provide[ds]?|send|along with|accompanied by|together with)\b/i;
// "screen resumes", "review CVs": the posting is describing the job, not the application.
const NOT_APPLICATION_BEFORE =
  /\b(?:screen(?:s|ing)?|review(?:s|ing)?|sourc(?:e|es|ing)|read(?:s|ing)?|pars(?:e|es|ing)|evaluat(?:e|es|ing)|build(?:s|ing)?|writ(?:e|es|ing)|tailor(?:s|ing)?)\s+(?:\w+\s+){0,2}$/i;
const CONNECTOR = /,|;|\band\b|\bor\b|\bplus\b|\bas well as\b|&|\//i;
const CONNECTOR_ONLY =
  /^[\s,;/&+]*(?:(?:and|or|plus|as well as)\s+)?(?:(?:an?|the|your|any|a copy of|copies of|unofficial|official|updated|current|recent|most recent|up-to-date|academic|relevant)\s+)*$/i;
const BULLET = /^\s*(?:[•▪◦*\-–]|\d+[.)])\s+/;
const HEADING_HINT =
  /\b(?:apply|application|submit|submission|documents?|materials?|require(?:d|ments?)?|include|upload|attach|package|checklist)\b/i;

const COMBINED_PATTERNS = [
  /\b(?:single|one)\s+(?:combined\s+|merged\s+)?(?:pdf|file|document|attachment|upload)s?\b/i,
  /\b(?:combine|merge)[ds]?\b[^.]{0,80}?\b(?:into|as|in)\s+(?:a|one)\b/i,
  /\b(?:combined|merged)\s+(?:pdf|file|document)s?\b/i,
];
const NOT_COMBINED = /\b(?:do not|don['’]t|not|never)\s+(?:\w+\s+)?(?:combine|merge)/i;
const SEPARATE =
  /\bseparate(?:ly)?\b[^.]{0,40}?\b(?:files?|documents?|attachments?|uploads?|pdfs?)\b|\b(?:files?|documents?|attachments?|pdfs?)\b[^.]{0,30}?\bseparately\b/i;
const PDF =
  /\b(?:pdf (?:format|only|files? only)|(?:in|as) (?:a )?(?:single |one )?pdf|(?:single|one|combined|merged) pdf|pdfs? (?:is |are )?(?:required|preferred|only))\b/i;
const DOCUMENT_CONTEXT = /\b(?:documents?|materials?|attachments?|application)\b/i;

const RANK = {
  'required:form': 6,
  'required:page': 5,
  'optional:form': 4,
  'optional:page': 3,
  'not_needed:page': 2,
  'mentioned:page': 1,
};

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function excerpt(sentence, index) {
  const value = collapse(sentence);
  if (value.length <= 180) return value;
  const start = Math.max(0, index - 70);
  const end = Math.min(value.length, start + 180);
  return `${start > 0 ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`;
}

function cueStatus(text) {
  if (OPTIONAL_CUE.test(text)) return 'optional';
  if (NOT_NEEDED_CUE.test(text)) return 'not_needed';
  if (REQUIRED_CUE.test(text)) return 'required';
  return null;
}

function findMentions(sentence) {
  const mentions = [];
  for (const doc of REQUIREMENT_DOCUMENTS) {
    for (const match of sentence.matchAll(doc.pattern)) {
      mentions.push({ doc, start: match.index, end: match.index + match[0].length });
    }
  }
  return mentions
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((mention, index, all) => index === 0 || mention.start >= all[index - 1].end);
}

function splitSentences(text) {
  const sentences = [];
  let context = null;
  for (const rawLine of String(text || '').split('\n')) {
    const line = collapse(rawLine);
    if (!line) continue;
    const isBullet = BULLET.test(rawLine);
    const body = line.replace(BULLET, '');
    const isHeading = !isBullet && body.length <= 140 && /:$/.test(body) && HEADING_HINT.test(body);
    if (!isBullet && !isHeading) context = null;
    for (const sentence of body.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(•])/)) {
      sentences.push({ text: sentence, context: isBullet ? context : null });
    }
    if (isHeading) {
      const status = cueStatus(body);
      context = status === 'optional' || status === 'not_needed' ? status : 'required';
    }
  }
  return sentences;
}

function analyzeSentence({ text: sentence, context }) {
  const mentions = findMentions(sentence);
  if (!mentions.length) return [];

  // Split the text between two mentions at its first connector: the part
  // before it describes the earlier document, the rest the later one.
  const before = [];
  const after = [];
  mentions.forEach((mention, index) => {
    const next = mentions[index + 1];
    const gap = sentence.slice(mention.end, next ? next.start : sentence.length);
    if (!next) {
      after[index] = gap;
      return;
    }
    const connector = gap.match(CONNECTOR);
    const cut = connector ? connector.index : gap.length;
    after[index] = gap.slice(0, cut);
    before[index + 1] = gap.slice(cut);
  });
  before[0] = sentence.slice(0, mentions[0].start);

  const sentenceStatus = context || (REQUIRED_CUE.test(sentence) ? 'required' : 'mentioned');
  const own = mentions.map((mention, index) => {
    if (NOT_APPLICATION_BEFORE.test(before[index] || '')) return 'skip';
    if (NO_BEFORE.test(before[index] || '')) return 'not_needed';
    return cueStatus(`${before[index] || ''} ${after[index] || ''}`);
  });
  const statuses = [];
  for (let index = mentions.length - 1; index >= 0; index -= 1) {
    const next = mentions[index + 1];
    const gap = next ? sentence.slice(mentions[index].end, next.start) : '';
    const inherited = next && CONNECTOR_ONLY.test(gap) ? statuses[index + 1] : null;
    statuses[index] = own[index] || inherited || null;
  }
  return mentions
    .map((mention, index) => ({
      doc: mention.doc,
      status: statuses[index] || sentenceStatus,
      evidence: excerpt(sentence, mention.start),
    }))
    .filter((mention) => mention.status !== 'skip');
}

function fieldText(field) {
  const name = String(field?.name || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[\[\]_.\-]+/g, ' ');
  return collapse(`${field?.label || ''} ${name}`);
}

function cleanFieldLabel(label) {
  return collapse(String(label || '').replace(/[*✱]/g, '').replace(/\(\s*(?:required|optional)\s*\)/gi, ''));
}

function documentsIn(text) {
  return REQUIREMENT_DOCUMENTS.filter((doc) => new RegExp(doc.pattern.source, 'iu').test(text));
}

export function analyzeRequirements({ description = '', applicationText = [], fileFields = [] } = {}) {
  const best = new Map();
  const transcriptEvidence = [];
  const consider = (doc, status, source, evidence) => {
    const rank = RANK[`${status}:${source}`] || 0;
    const current = best.get(doc.key);
    if (!current || rank > current.rank) best.set(doc.key, { doc, status, source, evidence, rank });
    if (doc.key === 'transcript') transcriptEvidence.push(evidence);
  };

  let combined = null;
  let separate = false;
  let pdf = false;
  const otherUploads = [];

  for (const field of Array.isArray(fileFields) ? fileFields.slice(0, 30) : []) {
    const label = cleanFieldLabel(field?.label);
    const docs = documentsIn(fieldText(field));
    if (!docs.length) {
      if (label.length >= 3 && otherUploads.length < 4 && !otherUploads.includes(label)) {
        otherUploads.push(label);
      }
      continue;
    }
    const status = /\boptional\b/i.test(field?.label || '')
      ? 'optional'
      : field?.required || /[*✱]|\brequired\b/i.test(field?.label || '')
        ? 'required'
        : 'optional';
    const evidence = `Upload field: ${label || docs[0].label}`;
    docs.forEach((doc) => consider(doc, status, 'form', evidence));
    if (docs.length > 1 && !combined) {
      combined = { documents: docs.map((doc) => doc.label), evidence };
    }
  }

  const lines = [description, ...(Array.isArray(applicationText) ? applicationText : [])].join('\n');
  for (const sentence of splitSentences(lines)) {
    const mentions = analyzeSentence(sentence);
    mentions.forEach(({ doc, status, evidence }) => consider(doc, status, 'page', evidence));
    const hasContext = mentions.length > 0 || DOCUMENT_CONTEXT.test(sentence.text);
    if (!hasContext) continue;
    if (!pdf && PDF.test(sentence.text)) pdf = true;
    if (NOT_COMBINED.test(sentence.text) || SEPARATE.test(sentence.text)) {
      separate = true;
      continue;
    }
    if (!combined && COMBINED_PATTERNS.some((pattern) => pattern.test(sentence.text))) {
      combined = {
        documents: [...new Set(mentions.map(({ doc }) => doc.label))],
        evidence: excerpt(sentence.text, 0),
      };
    }
  }

  const items = REQUIREMENT_DOCUMENTS.filter((doc) => best.has(doc.key)).map((doc) => {
    const { status, source, evidence } = best.get(doc.key);
    const item = { key: doc.key, label: doc.label, status, source, evidence };
    if (doc.key === 'transcript') {
      const all = transcriptEvidence.join(' ');
      if (/\bunofficial\b/i.test(all)) item.detail = 'Unofficial accepted';
      else if (/\bofficial\b/i.test(all)) item.detail = 'Official copy';
    }
    return item;
  });

  return {
    items,
    combined,
    separate: separate && !combined,
    pdf,
    otherUploads,
  };
}

export const REQUIREMENT_STATUS_LABEL = {
  required: 'Required',
  optional: 'Optional',
  not_needed: 'Not needed',
  mentioned: 'Mentioned',
};
