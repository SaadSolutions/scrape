// ==UserScript==
// @name         HTB Academy → Obsidian Scraper
// @namespace    https://academy.hackthebox.com
// @version      2.0
// @description  Scrape HTB Academy module lessons into Obsidian-compatible markdown files
// @match        https://academy.hackthebox.com/*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.setClipboard
// @grant        GM.xmlHttpRequest
// @connect      academy.hackthebox.com
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── Compat: Greasemonkey 4+ vs Tampermonkey ─────────────────────────────────
  const setClipboard = (typeof GM_setClipboard === 'function')
    ? GM_setClipboard
    : (typeof GM !== 'undefined' && GM.setClipboard) ? GM.setClipboard : null;

  function gmFetch(url) {
    return new Promise((resolve, reject) => {
      const doRequest = (typeof GM_xmlhttpRequest === 'function')
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
      if (!doRequest) { reject(new Error('No GM_xmlhttpRequest available')); return; }
      doRequest({
        method: 'GET',
        url,
        headers: { 'Accept': 'text/html' },
        onload(res) {
          if (res.status >= 200 && res.status < 400) resolve(res.responseText);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror(err) { reject(new Error('Network error')); },
        ontimeout() { reject(new Error('Timeout')); },
        timeout: 20000,
      });
    });
  }

  // ── Inject UI once body exists ──────────────────────────────────────────────
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
    // prevent double-init on SPA navigation
    if (document.getElementById('htb-scraper-toggle')) return;

    injectStyles();
    injectUI();

    // re-inject if SPA tears down the body (some frameworks do this)
    new MutationObserver(() => {
      if (!document.getElementById('htb-scraper-toggle') && document.body) {
        injectUI();
      }
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
        font-size: 24px !important; box-shadow: 0 4px 16px rgba(0,0,0,.5) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        transition: transform .15s !important;
        font-family: sans-serif !important; line-height: 1 !important;
        padding: 0 !important; margin: 0 !important;
      }
      #htb-scraper-toggle:hover { transform: scale(1.1) !important; }

      #htb-scraper-panel {
        position: fixed !important; bottom: 84px !important; right: 20px !important;
        z-index: 2147483646 !important;
        width: 440px !important; max-height: 70vh !important; background: #1a2332 !important;
        border: 1px solid #9fef00 !important; border-radius: 12px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        color: #a4b1cd !important; box-shadow: 0 8px 32px rgba(0,0,0,.6) !important;
        display: none !important; flex-direction: column !important; overflow: hidden !important;
      }
      #htb-scraper-panel.open { display: flex !important; }

      #htb-scraper-panel .sp-header {
        padding: 14px 16px !important; background: #141d2b !important;
        border-bottom: 1px solid #2a3a4e !important; flex-shrink: 0 !important;
      }
      #htb-scraper-panel .sp-header h3 {
        margin: 0 !important; color: #9fef00 !important; font-size: 15px !important; font-weight: 600 !important;
      }
      #htb-scraper-panel .sp-header small {
        color: #6c7a8d !important; font-size: 11px !important;
      }

      #htb-scraper-panel .sp-body {
        padding: 12px 16px !important; overflow-y: auto !important; flex: 1 !important;
      }

      #htb-scraper-panel .sp-actions {
        padding: 12px 16px !important; border-top: 1px solid #2a3a4e !important;
        display: flex !important; gap: 8px !important; flex-shrink: 0 !important;
      }

      .sp-btn {
        padding: 8px 14px !important; border: none !important; border-radius: 6px !important;
        cursor: pointer !important; font-size: 13px !important; font-weight: 500 !important;
        transition: opacity .15s !important;
      }
      .sp-btn:hover { opacity: .85 !important; }
      .sp-btn-primary { background: #9fef00 !important; color: #141d2b !important; }
      .sp-btn-secondary { background: #2a3a4e !important; color: #a4b1cd !important; }
      .sp-btn:disabled { opacity: .4 !important; cursor: not-allowed !important; }

      .sp-lesson-item {
        display: flex !important; align-items: center !important; gap: 10px !important;
        padding: 8px 10px !important; margin: 4px 0 !important; border-radius: 6px !important;
        background: #141d2b !important; font-size: 13px !important;
      }
      .sp-lesson-item .sp-status {
        width: 8px !important; height: 8px !important; border-radius: 50% !important; flex-shrink: 0 !important;
        background: #2a3a4e !important;
      }
      .sp-lesson-item .sp-status.done { background: #9fef00 !important; }
      .sp-lesson-item .sp-status.active { background: #f0c040 !important; }
      .sp-lesson-item .sp-status.error { background: #ff4444 !important; }
      .sp-lesson-item .sp-name {
        flex: 1 !important; overflow: hidden !important;
        text-overflow: ellipsis !important; white-space: nowrap !important;
      }
      .sp-lesson-item .sp-copy-btn {
        padding: 4px 10px !important; border: 1px solid #9fef00 !important;
        background: transparent !important; color: #9fef00 !important;
        border-radius: 4px !important; font-size: 11px !important; cursor: pointer !important;
        display: none !important; transition: background .15s !important;
      }
      .sp-lesson-item .sp-copy-btn:hover { background: rgba(159,239,0,.15) !important; }
      .sp-lesson-item.scraped .sp-copy-btn { display: inline-block !important; }

      .sp-progress {
        height: 3px !important; background: #2a3a4e !important; border-radius: 2px !important;
        margin: 10px 0 6px !important; overflow: hidden !important;
      }
      .sp-progress-bar {
        height: 100% !important; background: #9fef00 !important; width: 0% !important;
        transition: width .3s !important;
      }

      .sp-log {
        font-size: 11px !important; color: #6c7a8d !important; margin-top: 4px !important;
        max-height: 80px !important; overflow-y: auto !important;
        white-space: pre-wrap !important; word-break: break-word !important;
      }

      .sp-debug-btn {
        padding: 2px 8px !important; border: 1px solid #6c7a8d !important;
        background: transparent !important; color: #6c7a8d !important;
        border-radius: 3px !important; font-size: 10px !important; cursor: pointer !important;
        margin-left: auto !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── HTML → Markdown converter ───────────────────────────────────────────────
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
      const children = () => Array.from(node.childNodes).forEach(c => walk(c, ctx));

      if (['script', 'style', 'nav', 'button', 'svg', 'iframe', 'footer', 'header'].includes(tag)) return;
      if (node.closest && (
        node.classList.contains('module-sidebar') ||
        node.classList.contains('training-module__sidebar') ||
        node.classList.contains('sidebar') ||
        node.id === 'htb-scraper-panel' ||
        node.id === 'htb-scraper-toggle'
      )) return;

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
          const text = (codeEl || node).textContent;
          md.push(text.replace(/^\n+|\n+$/g, ''));
          md.push('\n```\n\n');
          break;
        }
        case 'a': {
          const href = node.getAttribute('href');
          if (href && !href.startsWith('javascript:')) {
            const absHref = href.startsWith('http') ? href : new URL(href, location.origin).href;
            md.push('['); children(); md.push('](' + absHref + ')');
          } else {
            children();
          }
          break;
        }
        case 'img': {
          const alt = node.getAttribute('alt') || '';
          let src = node.getAttribute('src') || node.getAttribute('data-src') || '';
          if (src && !src.startsWith('http')) src = new URL(src, location.origin).href;
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
        case 'blockquote':
          md.push('\n> ');
          children();
          md.push('\n\n');
          break;
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (rows.length === 0) break;
          rows.forEach((row, ri) => {
            const cells = Array.from(row.querySelectorAll('th, td'));
            md.push('| ' + cells.map(c => c.textContent.trim().replace(/\|/g, '\\|')).join(' | ') + ' |\n');
            if (ri === 0) {
              md.push('| ' + cells.map(() => '---').join(' | ') + ' |\n');
            }
          });
          md.push('\n');
          break;
        }
        case 'div': case 'section': case 'article': case 'main': case 'span': case 'figure': case 'figcaption':
          if (node.classList.contains('alert') || node.classList.contains('callout') ||
              (node.classList.contains('card-body') && node.closest('.alert, .callout'))) {
            md.push('\n> [!note]\n> ');
            children();
            md.push('\n\n');
          } else {
            children();
          }
          break;
        default:
          children();
      }
    }
    walk(container);

    return md.join('')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+/, '')
      .replace(/\s+$/, '\n');
  }

  // ── Frontmatter builder ─────────────────────────────────────────────────────
  function buildFrontmatter(title, module, section, url) {
    const now = new Date().toISOString().split('T')[0];
    return [
      '---',
      `title: "${title.replace(/"/g, '\\"')}"`,
      `module: "${module.replace(/"/g, '\\"')}"`,
      section ? `section: "${section.replace(/"/g, '\\"')}"` : null,
      `source: "${url}"`,
      `scraped: ${now}`,
      'tags:',
      '  - htb-academy',
      '---',
      ''
    ].filter(Boolean).join('\n');
  }

  function sanitize(name) {
    return name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
  }

  // ── TOC parser (broad selector strategy) ────────────────────────────────────
  function parseTOC() {
    const lessons = [];
    const seen = new Set();

    // strategy 1: find links whose href contains /module/ and /section/
    document.querySelectorAll('a[href*="/module/"][href*="/section/"]').forEach(a => {
      addLink(a);
    });

    // strategy 2: known sidebar classes from HTB
    if (lessons.length === 0) {
      const selectors = [
        '.ic-sections a',
        '.training-module__sidebar a',
        '.module-sidebar a',
        '.sidebar-nav a',
        '.card-body .list-group a',
        'nav.sidebar a',
        '.sidebar a',
      ];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(a => addLink(a));
        if (lessons.length > 0) break;
      }
    }

    // strategy 3: any internal link that looks like a lesson
    if (lessons.length === 0) {
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || a.getAttribute('href') || '';
        if (href.includes('/section/') || href.includes('/lesson/')) {
          addLink(a);
        }
      });
    }

    // strategy 4: current page as single lesson
    if (lessons.length === 0 && (
      location.pathname.includes('/section/') ||
      location.pathname.includes('/lesson/') ||
      location.pathname.includes('/module/')
    )) {
      lessons.push({
        title: document.title.replace(/ \|.*$/, '').replace(/ - .*$/, '').trim() || 'Current Lesson',
        url: location.href,
        md: null,
        status: 'pending',
      });
    }

    function addLink(a) {
      const href = a.href || a.getAttribute('href');
      if (!href) return;
      const url = href.startsWith('http') ? href : new URL(href, location.origin).href;
      if (!url.includes('academy.hackthebox.com')) return;
      if (seen.has(url)) return;
      seen.add(url);
      const title = a.textContent.trim().replace(/\s+/g, ' ');
      if (title && title.length > 1) {
        lessons.push({ title, url, md: null, status: 'pending' });
      }
    }

    return lessons;
  }

  // ── Get module name ─────────────────────────────────────────────────────────
  function getModuleName() {
    const selectors = [
      '.training-module__title',
      '.module-title',
      'h1.module-name',
      '.breadcrumb-item:nth-last-child(2)',
      'h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text && text.length > 2) return text;
      }
    }
    return document.title.replace(/ \|.*$/, '').replace(/ - .*$/, '').trim() || 'HTB Module';
  }

  // ── Scrape a single lesson ─────────────────────────────────────────────────
  async function scrapeLessonPage(url) {
    const html = await gmFetch(url);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const contentSelectors = [
      '.training-module__content',
      '.module-content',
      '.content-section',
      'article.content',
      '.card-body .content',
      'main .content',
      '#content',
      '.markdown-content',
      '.section-content',
      'article',
      'main',
    ];

    let content = null;
    for (const sel of contentSelectors) {
      content = doc.querySelector(sel);
      if (content && content.textContent.trim().length > 100) break;
      content = null;
    }

    if (!content) {
      const divs = Array.from(doc.querySelectorAll('div, section'))
        .filter(d => d.textContent.trim().length > 200)
        .sort((a, b) => b.textContent.length - a.textContent.length);
      content = divs[0] || doc.body;
    }

    return htmlToMarkdown(content);
  }

  // ── Debug: dump all classes/ids/links visible on page ───────────────────────
  function dumpPageStructure() {
    const info = [];
    info.push(`URL: ${location.href}`);
    info.push(`Title: ${document.title}`);
    info.push(`Body children: ${document.body ? document.body.children.length : 'NO BODY'}`);

    // collect all unique class names
    const classes = new Set();
    document.querySelectorAll('*').forEach(el => {
      el.classList.forEach(c => classes.add(c));
    });
    info.push(`\nAll classes (${classes.size}):\n${Array.from(classes).sort().join(', ')}`);

    // all IDs
    const ids = [];
    document.querySelectorAll('[id]').forEach(el => ids.push(el.id));
    info.push(`\nAll IDs (${ids.length}):\n${ids.join(', ')}`);

    // links with /module/ or /section/
    const links = [];
    document.querySelectorAll('a').forEach(a => {
      const h = a.href || '';
      if (h.includes('/module/') || h.includes('/section/') || h.includes('/lesson/') || h.includes('/course/')) {
        links.push(`${a.textContent.trim().substring(0, 40)} → ${h}`);
      }
    });
    info.push(`\nLesson-like links (${links.length}):\n${links.join('\n')}`);

    return info.join('\n');
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  let panelOpen = false;
  let lessons = [];
  let scraping = false;

  function injectUI() {
    const toggle = document.createElement('button');
    toggle.id = 'htb-scraper-toggle';
    toggle.textContent = 'S';
    toggle.title = 'HTB Academy Scraper — click to open';
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.id = 'htb-scraper-panel';
    panel.innerHTML = `
      <div class="sp-header">
        <h3>HTB Academy → Obsidian</h3>
        <small>Scrape lessons to Obsidian markdown</small>
      </div>
      <div class="sp-body" id="sp-body">
        <div id="sp-lesson-list"></div>
        <div class="sp-progress" id="sp-progress" style="display:none">
          <div class="sp-progress-bar" id="sp-progress-bar"></div>
        </div>
        <div class="sp-log" id="sp-log"></div>
      </div>
      <div class="sp-actions">
        <button class="sp-btn sp-btn-secondary" id="sp-scan">Scan TOC</button>
        <button class="sp-btn sp-btn-primary" id="sp-scrape-all" disabled>Scrape All</button>
        <button class="sp-btn sp-btn-secondary" id="sp-copy-all" disabled>Copy All</button>
        <button class="sp-debug-btn" id="sp-debug" title="Dump page structure to log for debugging">Debug</button>
      </div>
    `;
    document.body.appendChild(panel);

    toggle.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.classList.toggle('open', panelOpen);
      if (panelOpen && lessons.length === 0) scanTOC();
    });

    const listEl = panel.querySelector('#sp-lesson-list');
    const progressEl = panel.querySelector('#sp-progress');
    const progressBar = panel.querySelector('#sp-progress-bar');
    const logEl = panel.querySelector('#sp-log');
    const scanBtn = panel.querySelector('#sp-scan');
    const scrapeAllBtn = panel.querySelector('#sp-scrape-all');
    const copyAllBtn = panel.querySelector('#sp-copy-all');
    const debugBtn = panel.querySelector('#sp-debug');

    function log(msg) {
      logEl.textContent = msg;
    }

    function renderList() {
      listEl.innerHTML = '';
      if (lessons.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#6c7a8d;font-size:12px">No lessons found.<br>Navigate to a module page, then click <b>Scan TOC</b>.<br>If still empty, click <b>Debug</b> to inspect the page.</div>';
        return;
      }
      lessons.forEach((l, i) => {
        const item = document.createElement('div');
        item.className = 'sp-lesson-item' + (l.md ? ' scraped' : '');
        const escapedTitle = l.title.replace(/"/g, '&quot;').replace(/</g, '&lt;');
        item.innerHTML = `
          <div class="sp-status ${l.status}"></div>
          <div class="sp-name" title="${escapedTitle}">${i + 1}. ${escapedTitle}</div>
          <button class="sp-copy-btn" data-idx="${i}">Copy</button>
        `;
        listEl.appendChild(item);
      });
      listEl.querySelectorAll('.sp-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const lesson = lessons[idx];
          if (!lesson.md) return;

          const moduleName = getModuleName();
          const fm = buildFrontmatter(lesson.title, moduleName, '', lesson.url);
          const full = fm + '\n' + lesson.md;

          if (setClipboard) {
            setClipboard(full, 'text');
          } else {
            navigator.clipboard.writeText(full);
          }
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          log(`Copied: ${sanitize(lesson.title)}.md`);
        });
      });
    }

    function scanTOC() {
      lessons = parseTOC();
      renderList();
      scrapeAllBtn.disabled = lessons.length === 0;
      log(`Found ${lessons.length} lesson(s)`);
    }

    async function scrapeAll() {
      if (scraping) return;
      scraping = true;
      scrapeAllBtn.disabled = true;
      scanBtn.disabled = true;
      progressEl.style.display = 'block';

      for (let i = 0; i < lessons.length; i++) {
        const l = lessons[i];
        l.status = 'active';
        renderList();
        progressBar.style.width = `${((i) / lessons.length) * 100}%`;
        log(`Scraping (${i + 1}/${lessons.length}): ${l.title}`);

        try {
          l.md = await scrapeLessonPage(l.url);
          l.status = 'done';
        } catch (e) {
          l.status = 'error';
          l.md = `> [!error] Failed to scrape\n> ${e.message}\n`;
          log(`Error on "${l.title}": ${e.message}`);
        }

        renderList();

        if (i < lessons.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      progressBar.style.width = '100%';
      scraping = false;
      scrapeAllBtn.disabled = false;
      scanBtn.disabled = false;
      copyAllBtn.disabled = false;
      log(`Done! ${lessons.filter(l => l.status === 'done').length}/${lessons.length} scraped.`);
    }

    scanBtn.addEventListener('click', scanTOC);
    scrapeAllBtn.addEventListener('click', scrapeAll);

    debugBtn.addEventListener('click', () => {
      const dump = dumpPageStructure();
      log(dump);
      console.log('[HTB Scraper Debug]\n' + dump);
      if (setClipboard) setClipboard(dump, 'text');
      else navigator.clipboard.writeText(dump).catch(() => {});
    });

    copyAllBtn.addEventListener('click', () => {
      const moduleName = getModuleName();
      const scraped = lessons.filter(l => l.md && l.status === 'done');
      if (scraped.length === 0) { log('Nothing to copy'); return; }

      const combined = scraped.map((l, i) => {
        const fm = buildFrontmatter(l.title, moduleName, '', l.url);
        const separator = `\n\n---\n<!-- FILE: ${sanitize(l.title)}.md -->\n\n`;
        return (i > 0 ? separator : '') + fm + '\n' + l.md;
      }).join('');

      if (setClipboard) setClipboard(combined, 'text');
      else navigator.clipboard.writeText(combined);
      copyAllBtn.textContent = 'Copied All!';
      setTimeout(() => { copyAllBtn.textContent = 'Copy All'; }, 2000);
      log(`Copied ${scraped.length} lessons to clipboard (split by --- markers)`);
    });
  }
})();
