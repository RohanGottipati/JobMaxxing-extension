(function () {
  'use strict';

  if (window.__jobMaxxingContentLoaded) return;
  window.__jobMaxxingContentLoaded = true;

  const STATUS_OPTIONS = [
    ['saved', 'Saved'],
    ['applied', 'Applied'],
    ['oa', 'OA'],
    ['interview', 'Interview'],
    ['offer', 'Offer'],
    ['rejected', 'Rejected'],
    ['ghosted', 'Ghosted'],
  ];

  const SEASON_OPTIONS = ['', 'Summer 2027', 'Winter 2027', 'Full-time'];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function createPill(onClick) {
    const host = document.createElement('div');
    host.id = 'jobmaxxing-pill-host';
    host.style.cssText = 'all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483647;font-size:0;';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      button {
        display:flex;align-items:center;gap:6px;background:#1d4ed8;color:#fff;
        border:none;border-radius:24px;padding:10px 18px;font-size:14px;
        font-family:system-ui,sans-serif;font-weight:600;cursor:pointer;
        box-shadow:0 4px 16px rgba(29,78,216,0.35);transition:background 0.15s,transform 0.1s;
      }
      button:hover{background:#1e40af;transform:scale(1.04);}
      button:active{transform:scale(0.97);}
      svg{width:16px;height:16px;fill:currentColor;flex-shrink:0;}
    `;
    const btn = document.createElement('button');
    btn.innerHTML = `<svg viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z"/></svg>Track Job`;
    btn.addEventListener('click', onClick);
    shadow.appendChild(style);
    shadow.appendChild(btn);
    document.documentElement.appendChild(host);
    return { remove() { host.remove(); } };
  }

  function createPanel(scraped, onClose) {
    const host = document.createElement('div');
    host.id = 'jobmaxxing-panel-host';
    host.style.cssText = 'all:initial;position:fixed;top:0;right:0;width:420px;height:100vh;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      *,*::before,*::after{box-sizing:border-box;}
      .panel{display:flex;flex-direction:column;height:100vh;background:#fff;box-shadow:-4px 0 32px rgba(0,0,0,0.18);overflow:hidden;font-family:system-ui,-apple-system,sans-serif;}
      .hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#1d4ed8;color:#fff;flex-shrink:0;}
      .hdr h2{margin:0;font-size:16px;font-weight:700;}
      .cls{background:none;border:none;color:#fff;cursor:pointer;font-size:22px;line-height:1;padding:2px 6px;border-radius:4px;}
      .cls:hover{background:rgba(255,255,255,0.2);}
      .body{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;}
      label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px;}
      input,select,textarea{width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;font-family:inherit;color:#111827;background:#fff;}
      input:focus,select:focus,textarea:focus{outline:2px solid #1d4ed8;outline-offset:1px;border-color:transparent;}
      textarea{resize:vertical;min-height:160px;line-height:1.5;}
      .ftr{padding:14px 20px;border-top:1px solid #e5e7eb;display:flex;gap:10px;flex-shrink:0;}
      .save{flex:1;padding:10px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;}
      .save:hover{background:#1e40af;}
      .cancel{padding:10px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:14px;cursor:pointer;}
      .cancel:hover{background:#e5e7eb;}
      .msg{border-radius:6px;padding:10px 12px;font-size:13px;display:none;}
      .msg.error{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;}
      .msg.warn{background:#fef3c7;border:1px solid #f59e0b;color:#92400e;}
      .msg.ok{background:#ecfdf5;border:1px solid #34d399;color:#065f46;}
    `;

    const today = new Date().toISOString().slice(0, 10);
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="hdr"><h2>Save to JobMaxxing</h2><button class="cls" id="cls">&#x2715;</button></div>
      <div class="body">
        <div><label>Job Title</label><input id="p-title" type="text" value="${esc(scraped.title || '')}"></div>
        <div><label>Company</label><input id="p-company" type="text" value="${esc(scraped.company || '')}"></div>
        <div><label>Location</label><input id="p-location" type="text" value="${esc(scraped.location || '')}"></div>
        <div><label>Applied Date</label><input id="p-date" type="date" value="${today}"></div>
        <div><label>Status</label><select id="p-status">${STATUS_OPTIONS.map(([v, l]) => `<option value="${v}"${v === 'saved' ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label>Recruiting season</label><select id="p-season">${SEASON_OPTIONS.map((s) => `<option value="${esc(s)}">${s || 'Unassigned'}</option>`).join('')}</select></div>
        <div><label>Job Description</label><textarea id="p-desc">${esc(scraped.description || '')}</textarea></div>
        <div><label>Notes</label><textarea id="p-notes" style="min-height:60px"></textarea></div>
        <div class="msg" id="p-msg"></div>
      </div>
      <div class="ftr"><button class="cancel" id="p-cancel">Cancel</button><button class="save" id="p-save">Save Application</button></div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);

    function g(id) { return shadow.getElementById(id); }

    function close() {
      host.remove();
      document.removeEventListener('keydown', onKey);
      onClose?.();
    }

    function showMsg(text, kind) {
      const el = g('p-msg');
      el.textContent = text;
      el.className = `msg ${kind}`;
      el.style.display = 'block';
    }

    async function save() {
      const company = g('p-company').value.trim();
      const title = g('p-title').value.trim();
      if (!company || !title) {
        showMsg('Company and job title are required.', 'error');
        return;
      }

      const payload = {
        companyName: company,
        roleTitle: title,
        location: g('p-location').value.trim() || null,
        dateApplied: g('p-date').value || today,
        status: g('p-status').value,
        recruitingSeason: g('p-season').value || null,
        jobDescription: g('p-desc').value.trim() || null,
        notes: g('p-notes').value.trim() || null,
        sourceHost: scraped.sourceHost || location.hostname,
        jobUrl: scraped.jobUrl || location.href,
      };

      if (!contextValid()) {
        showMsg('Extension was updated — refresh this page and try again.', 'error');
        return;
      }

      const res = await safeSend({ type: 'SAVE_APPLICATION', app: payload });
      if (!res) {
        showMsg('Could not save — refresh this page and try again.', 'error');
        return;
      }
      if (res.error) {
        showMsg(res.error, 'error');
        return;
      }
      if (res.duplicate) {
        showMsg(`Duplicate: ${res.duplicate.roleTitle} at ${res.duplicate.companyName}`, 'warn');
        return;
      }
      if (res.analyzeError) {
        showMsg('Saved. Job analysis could not start — open JobMaxxing to run it manually.', 'ok');
      } else if (res.analyzed) {
        showMsg('Saved and job analysis started. Open JobMaxxing to review.', 'ok');
      } else {
        showMsg('Saved to JobMaxxing.', 'ok');
      }
      setTimeout(close, 1200);
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
    }

    g('cls').addEventListener('click', close);
    g('p-cancel').addEventListener('click', close);
    g('p-save').addEventListener('click', save);
    document.addEventListener('keydown', onKey);
  }

  let pillInstance = null;
  let panelOpen = false;
  let lastUrl = location.href;

  function contextValid() {
    return Boolean(chrome.runtime && chrome.runtime.id);
  }

  async function safeSend(msg) {
    if (!contextValid()) {
      teardown();
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (_) {
      teardown();
      return null;
    }
  }

  function teardown() {
    try { navObserver.disconnect(); } catch (_) {}
    pillInstance?.remove();
    pillInstance = null;
  }

  function init() {
    if (!contextValid() || !globalThis.__jobMaxxingIsJobPage?.()) return;
    safeSend({ type: 'PAGE_DETECTED' });
    if (!pillInstance && !panelOpen) {
      pillInstance = createPill(openPanel);
    }
  }

  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    pillInstance?.remove();
    pillInstance = null;
    const scraped = globalThis.__jobMaxxingScrapePage?.() ?? {};
    createPanel(scraped, () => {
      panelOpen = false;
      if (globalThis.__jobMaxxingIsJobPage?.()) pillInstance = createPill(openPanel);
    });
  }

  const navObserver = new MutationObserver(() => {
    if (!contextValid()) { teardown(); return; }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      pillInstance?.remove();
      pillInstance = null;
      panelOpen = false;
      setTimeout(init, 800);
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  init();
})();
