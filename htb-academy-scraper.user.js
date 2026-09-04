// ==UserScript==
// @name         HTB Academy → Obsidian Scraper
// @namespace    https://academy.hackthebox.com
// @version      3.0
// @description  Scrape HTB Academy module lessons by clicking through them, output one big Obsidian markdown file
// @match        https://academy.hackthebox.com/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM.setClipboard
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const setClipboard = (typeof GM_setClipboard === 'function')
    ? GM_setClipboard
    : (typeof GM !== 'undefined' && GM.setClipboard) ? GM.setClipboard : null;

  function copyText(text) {
    if (setClipboard) return setClipboard(text, 'text');
    return navigator.clipboard.writeText(text);
  }

  function waitForBody() {
    return new Promise(resolve => {
      if (document.body) return resolve();
      const obs = new MutationObserver(() => {
        if (document.body) { obs.disconnect(); resolve(); }
      });
      obs.observe(document.documentElement, { childList: true });
    });
  }

  waitForBody().then(init);

  function init() {
    if (document.getElementById('htb-scraper-toggle')) return;
    injectStyles();
    injectUI();
    new MutationObserver(() => {
      if (!document.getElementById('htb-scraper-toggle') && document.body) injectUI();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #htb-scraper-toggle {
        position: fixed !important; bottom: 20px !important; right: 20px !important;
        z-index: 2147483647 !important;
        width: 52px !important; height: 52px !important; border-radius: 50% !important;
        background: #9fef00 !important; color: #141d2b !important;
        border: 2px solid #141d2b !important; cursor: pointer !important;
        font-size: 20px !important; font-weight: 700 !important;
        box-shadow: 0 4px 16px rgba(0,0,0,.5) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        transition: transform .15s !important;
        font-family: monospace !important; line-height: 1 !important;
        padding: 0 !important; margin: 0 !important;
      }
      #htb-scraper-toggle:hover { transform: scale(1.1) !important; }

      #htb-scraper-panel {
        position: fixed !important; bottom: 84px !important; right: 20px !important;
        z-index: 2147483646 !important;
        width: 460px !important; max-height: 75vh !important; background: #1a2332 !important;
        border: 1px solid #9fef00 !important; border-radius: 12px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        color: #a4b1cd !important; box-shadow: 0 8px 32px rgba(0,0,0,.6) !important;
        display: none !important; flex-direction: column !important; overflow: hidden !important;
      }
      #htb-scraper-panel.open { display: flex !important; }

      .sp-header {
        padding: 14px 16px !important; background: #141d2b !important;
        border-bottom: 1px solid #2a3a4e !important; flex-shrink: 0 !important;
      }
      .sp-header h3 { margin: 0 !important; color: #9fef00 !important; font-size: 15px !important; font-weight: 600 !important; }
      .sp-header small { color: #6c7a8d !important; font-size: 11px !important; display: block !important; margin-top: 2px !important; }

      .sp-body { padding: 12px 16px !important; overflow-y: auto !important; flex: 1 !important; }

      .sp-actions {
        padding: 12px 16px !important; border-top: 1px solid #2a3a4e !important;
        display: flex !important; gap: 8px !important; flex-shrink: 0 !important; flex-wrap: wrap !important;
      }

      .sp-btn {
        padding: 8px 14px !important; border: none !important; border-radius: 6px !important;
        cursor: pointer !important; font-size: 13px !important; font-weight: 500 !important;
        transition: opacity .15s !important;
      }
      .sp-btn:hover { opacity: .85 !important; }
      .sp-btn-primary { background: #9fef00 !important; color: #141d2b !important; }
      .sp-btn-secondary { background: #2a3a4e !important; color: #a4b1cd !important; }
      .sp-btn-danger { background: #ff4444 !important; color: #fff !important; }
      .sp-btn:disabled { opacity: .4 !important; cursor: not-allowed !important; }

      .sp-lesson-item {
        display: flex !important; align-items: center !important; gap: 10px !important;
        padding: 6px 10px !important; margin: 3px 0 !important; border-radius: 6px !important;
        background: #141d2b !important; font-size: 12px !important;
      }
      .sp-status {
        width: 8px !important; height: 8px !important; border-radius: 50% !important;
        flex-shrink: 0 !important; background: #2a3a4e !important;
      }
      .sp-status.done { background: #9fef00 !important; }
      .sp-status.active { background: #f0c040 !important; }
      .sp-status.error { background: #ff4444 !important; }
      .sp-status.current { background: #4dabf7 !important; }
      .sp-name { flex: 1 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }

      .sp-progress {
        height: 4px !important; background: #2a3a4e !important; border-radius: 2px !important;
        margin: 10px 0 6px !important; overflow: hidden !important;
      }
      .sp-progress-bar {
        height: 100% !important; background: #9fef00 !important; width: 0% !important;
        transition: width .3s !important;
      }

      .sp-log {
        font-size: 11px !important; color: #6c7a8d !important; margin-top: 6px !important;
        max-height: 100px !important; overflow-y: auto !important;
        white-space: pre-wrap !important; word-break: break-word !important;
        background: #111820 !important; padding: 6px 8px !important; border-radius: 4px !important;
      }

      .sp-count {
        font-size: 12px !important; color: #9fef00 !important;
        text-align: center !important; padding: 4px !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── HTML → Markdown ─────────────────────────────────────────────────────────
  function htmlToMarkdown(container) {
    const md = [];
    function walk(node, ctx = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent;
        if (!ctx.pre) text = text.replace(/\s+/g, ' ');
        md.push(text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      const cl = node.classList;
      const children = () => Array.from(node.childNodes).forEach(c => walk(c, ctx));

      if (['script', 'style', 'svg', 'iframe', 'footer'].includes(tag)) return;
      if (node.id === 'htb-scraper-panel' || node.id === 'htb-scraper-toggle') return;
      if (cl.contains('sidebar-content') || cl.contains('desktop-sidebar-panel') ||
          cl.contains('syllabus-sections') || cl.contains('module-lab-navbar') ||
          cl.contains('module-lab-container') || cl.contains('navbar') ||
          cl.contains('intercom-app') || cl.contains('notification')) return;

      switch (tag) {
        case 'h1': md.push('\n# '); children(); md.push('\n\n'); break;
        case 'h2': md.push('\n## '); children(); md.push('\n\n'); break;
        case 'h3': md.push('\n### '); children(); md.push('\n\n'); break;
        case 'h4': md.push('\n#### '); children(); md.push('\n\n'); break;
        case 'h5': md.push('\n##### '); children(); md.push('\n\n'); break;
        case 'h6': md.push('\n###### '); children(); md.push('\n\n'); break;
        case 'p': md.push('\n'); children(); md.push('\n\n'); break;
        case 'br': md.push('\n'); break;
        case 'hr': md.push('\n---\n\n'); break;
        case 'strong': case 'b': md.push('**'); children(); md.push('**'); break;
        case 'em': case 'i': md.push('*'); children(); md.push('*'); break;
        case 'code':
          if (ctx.pre) { children(); break; }
          md.push('`'); children(); md.push('`');
          break;
        case 'pre': {
          const codeEl = node.querySelector('code');
          const lang = codeEl
            ? Array.from(codeEl.classList).find(c => c.startsWith('language-'))?.replace('language-', '') || ''
            : '';
          md.push('\n```' + lang + '\n');
          md.push((codeEl || node).textContent.replace(/^\n+|\n+$/g, ''));
          md.push('\n```\n\n');
          break;
        }
        case 'a': {
          const href = node.getAttribute('href');
          if (href && !href.startsWith('javascript:')) {
            const abs = href.startsWith('http') ? href : new URL(href, location.origin).href;
            md.push('['); children(); md.push('](' + abs + ')');
          } else {
            children();
          }
          break;
        }
        case 'img': {
          const alt = node.getAttribute('alt') || '';
          let src = node.getAttribute('src') || node.getAttribute('data-src') || '';
          if (src && !src.startsWith('http') && !src.startsWith('data:'))
            src = new URL(src, location.origin).href;
          if (src) md.push(`![${alt}](${src})`);
          break;
        }
        case 'ul': md.push('\n'); Array.from(node.children).forEach(li => {
          if (li.tagName === 'LI') {
            md.push('- ');
            Array.from(li.childNodes).forEach(c => walk(c, ctx));
            md.push('\n');
          }
        }); md.push('\n'); break;
        case 'ol': md.push('\n'); Array.from(node.children).forEach((li, i) => {
          if (li.tagName === 'LI') {
            md.push(`${i + 1}. `);
            Array.from(li.childNodes).forEach(c => walk(c, ctx));
            md.push('\n');
          }
        }); md.push('\n'); break;
        case 'blockquote': md.push('\n> '); children(); md.push('\n\n'); break;
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (rows.length === 0) break;
          rows.forEach((row, ri) => {
            const cells = Array.from(row.querySelectorAll('th, td'));
            md.push('| ' + cells.map(c => c.textContent.trim().replace(/\|/g, '\\|')).join(' | ') + ' |\n');
            if (ri === 0) md.push('| ' + cells.map(() => '---').join(' | ') + ' |\n');
          });
          md.push('\n');
          break;
        }
        default:
          if (cl.contains('alert') || cl.contains('callout')) {
            md.push('\n> [!note]\n> '); children(); md.push('\n\n');
          } else {
            children();
          }
      }
    }
    walk(container);
    return md.join('').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '').replace(/\s+$/, '\n');
  }

  // ── Read the syllabus sidebar to get section names ──────────────────────────
  function readSyllabus() {
    const sections = [];
    document.querySelectorAll('.syllabus-sections-inner').forEach(el => {
      const textEl = el.querySelector('.syllabus-sections-inner-text');
      const title = textEl
        ? textEl.textContent.trim()
        : el.textContent.trim().replace(/\s+/g, ' ');
      if (title && title.length > 1) {
        sections.push({ title, el });
      }
    });
    return sections;
  }

  // ── Get the current section title ───────────────────────────────────────────
  function getCurrentTitle() {
    const h = document.querySelector('.module-content h1, .module-content h2');
    if (h) return h.textContent.trim();
    const el = document.querySelector('#enumeration, [id]');
    if (el && el.tagName.match(/^H[1-3]$/)) return el.textContent.trim();
    return document.title.replace(/ \|.*$/, '').replace(/ - .*$/, '').trim();
  }

  // ── Get module name from breadcrumb or sidebar ──────────────────────────────
  function getModuleName() {
    const syllTitle = document.querySelector('.syllabus-title');
    if (syllTitle) return syllTitle.textContent.trim();
    return document.title.replace(/ \|.*$/, '').replace(/ - .*$/, '').trim() || 'HTB Module';
  }

  // ── Scrape the currently visible lesson content ─────────────────────────────
  function scrapeCurrentPage() {
    const content = document.querySelector('.module-content');
    if (!content) return '> [!error] Could not find .module-content on this page\n';
    return htmlToMarkdown(content);
  }

  // ── Find and click the Next button ──────────────────────────────────────────
  function findNextButton() {
    // look for navigation buttons — the "Next" one is typically the rightmost
    const navOptions = document.querySelectorAll('.navigation-option');
    for (const opt of navOptions) {
      const text = opt.textContent.toLowerCase();
      if (text.includes('next')) return opt;
    }
    // look for any button/link with "next" text
    const allBtns = document.querySelectorAll('button, a');
    for (const btn of allBtns) {
      const text = btn.textContent.trim().toLowerCase();
      if (text === 'next' || text === 'next section' || text === 'next →' || text.includes('next')) {
        if (btn.closest('#htb-scraper-panel')) continue;
        return btn;
      }
    }
    // look for a right-arrow style button at the bottom
    const primaryBtns = document.querySelectorAll('.primary-action-btn, .htb-button--primary');
    if (primaryBtns.length > 0) return primaryBtns[primaryBtns.length - 1];
    return null;
  }

  // ── Wait for page content to change after clicking Next ─────────────────────
  function waitForNavigation(oldUrl, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (location.href !== oldUrl && document.querySelector('.module-content')) {
          setTimeout(resolve, 800); // extra settle time for SPA rendering
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Navigation timeout'));
          return;
        }
        setTimeout(check, 300);
      };
      check();
    });
  }

  // ── State ───────────────────────────────────────────────────────────────────
  let panelOpen = false;
  let scraping = false;
  let stopRequested = false;
  let collectedLessons = []; // {title, url, md}

  // ── UI ──────────────────────────────────────────────────────────────────────
  function injectUI() {
    const toggle = document.createElement('button');
    toggle.id = 'htb-scraper-toggle';
    toggle.textContent = 'S';
    toggle.title = 'HTB Academy Scraper';
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.id = 'htb-scraper-panel';
    panel.innerHTML = `
      <div class="sp-header">
        <h3>HTB Academy → Obsidian</h3>
        <small>Clicks through each lesson, builds one markdown file</small>
      </div>
      <div class="sp-body">
        <div id="sp-lesson-list"></div>
        <div class="sp-progress" id="sp-progress" style="display:none">
          <div class="sp-progress-bar" id="sp-progress-bar"></div>
        </div>
        <div class="sp-count" id="sp-count"></div>
        <div class="sp-log" id="sp-log">Ready. Navigate to the FIRST section of a module, then click Start.</div>
      </div>
      <div class="sp-actions">
        <button class="sp-btn sp-btn-primary" id="sp-start">Start Scraping</button>
        <button class="sp-btn sp-btn-danger" id="sp-stop" style="display:none">Stop</button>
        <button class="sp-btn sp-btn-secondary" id="sp-copy" style="display:none">Copy All</button>
        <button class="sp-btn sp-btn-secondary" id="sp-scrape-one" title="Scrape just the current page">This Page</button>
      </div>
    `;
    document.body.appendChild(panel);

    toggle.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.classList.toggle('open', panelOpen);
    });

    const listEl = panel.querySelector('#sp-lesson-list');
    const progressEl = panel.querySelector('#sp-progress');
    const progressBar = panel.querySelector('#sp-progress-bar');
    const countEl = panel.querySelector('#sp-count');
    const logEl = panel.querySelector('#sp-log');
    const startBtn = panel.querySelector('#sp-start');
    const stopBtn = panel.querySelector('#sp-stop');
    const copyBtn = panel.querySelector('#sp-copy');
    const scrapeOneBtn = panel.querySelector('#sp-scrape-one');

    function log(msg) { logEl.textContent = msg; }

    function renderList() {
      listEl.innerHTML = '';
      collectedLessons.forEach((l, i) => {
        const item = document.createElement('div');
        item.className = 'sp-lesson-item';
        const esc = l.title.replace(/</g, '&lt;');
        item.innerHTML = `
          <div class="sp-status ${l.status || 'done'}"></div>
          <div class="sp-name" title="${esc}">${i + 1}. ${esc}</div>
        `;
        listEl.appendChild(item);
      });
      countEl.textContent = collectedLessons.length > 0
        ? `${collectedLessons.length} lesson(s) collected`
        : '';
    }

    // ── Start: scrape current page, click Next, repeat ────────────────────────
    async function startScraping() {
      if (scraping) return;
      scraping = true;
      stopRequested = false;
      collectedLessons = [];

      startBtn.style.display = 'none';
      stopBtn.style.display = '';
      copyBtn.style.display = 'none';
      scrapeOneBtn.style.display = 'none';
      progressEl.style.display = 'block';

      let pageNum = 0;

      while (!stopRequested) {
        pageNum++;
        const title = getCurrentTitle();
        const url = location.href;
        log(`Scraping page ${pageNum}: ${title}`);

        const md = scrapeCurrentPage();
        collectedLessons.push({ title, url, md, status: 'done' });
        renderList();
        progressBar.style.width = '100%';

        // find Next button
        const nextBtn = findNextButton();
        if (!nextBtn) {
          log(`No "Next" button found — reached the end after ${pageNum} lessons.`);
          break;
        }

        // click Next
        log(`Navigating to next section...`);
        const oldUrl = location.href;

        // mark next as active
        collectedLessons.push({ title: '...loading next...', url: '', md: '', status: 'active' });
        renderList();

        nextBtn.click();

        try {
          await waitForNavigation(oldUrl);
          // remove the placeholder
          collectedLessons.pop();
        } catch (e) {
          collectedLessons.pop();
          log(`Navigation failed: ${e.message}. Stopped after ${pageNum} lessons.`);
          break;
        }

        // small delay to be polite
        await new Promise(r => setTimeout(r, 1500));
      }

      scraping = false;
      startBtn.style.display = '';
      startBtn.textContent = 'Restart';
      stopBtn.style.display = 'none';
      scrapeOneBtn.style.display = '';
      if (collectedLessons.length > 0) copyBtn.style.display = '';
      renderList();
      log(`Done! ${collectedLessons.length} lesson(s) collected. Click "Copy All" to copy the full markdown.`);
    }

    // ── Build the combined output ─────────────────────────────────────────────
    function buildCombinedMarkdown() {
      const moduleName = getModuleName();
      const now = new Date().toISOString().split('T')[0];
      const parts = [];

      // frontmatter for the whole file
      parts.push('---');
      parts.push(`title: "${moduleName.replace(/"/g, '\\"')}"`);
      parts.push(`source: "${collectedLessons[0]?.url || location.href}"`);
      parts.push(`scraped: ${now}`);
      parts.push('tags:');
      parts.push('  - htb-academy');
      parts.push('---');
      parts.push('');
      parts.push(`# ${moduleName}`);
      parts.push('');

      // table of contents
      parts.push('## Table of Contents');
      parts.push('');
      collectedLessons.forEach((l, i) => {
        const anchor = l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        parts.push(`${i + 1}. [[#${anchor}|${l.title}]]`);
      });
      parts.push('');
      parts.push('---');
      parts.push('');

      // each lesson
      collectedLessons.forEach((l, i) => {
        if (i > 0) {
          parts.push('');
          parts.push('---');
          parts.push('');
        }
        parts.push(l.md);
      });

      return parts.join('\n');
    }

    startBtn.addEventListener('click', startScraping);

    stopBtn.addEventListener('click', () => {
      stopRequested = true;
      log('Stopping after current page...');
    });

    scrapeOneBtn.addEventListener('click', () => {
      const title = getCurrentTitle();
      const md = scrapeCurrentPage();
      const moduleName = getModuleName();
      const now = new Date().toISOString().split('T')[0];
      const full = [
        '---',
        `title: "${title.replace(/"/g, '\\"')}"`,
        `module: "${moduleName.replace(/"/g, '\\"')}"`,
        `source: "${location.href}"`,
        `scraped: ${now}`,
        'tags:',
        '  - htb-academy',
        '---',
        '',
        md
      ].join('\n');

      copyText(full);
      log(`Copied current page: "${title}"`);
    });

    copyBtn.addEventListener('click', () => {
      const full = buildCombinedMarkdown();
      copyText(full);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy All'; }, 2000);
      log(`Copied ${collectedLessons.length} lessons as one markdown file (${(full.length / 1024).toFixed(1)} KB)`);
    });
  }
})();
