// ==UserScript==
// @name         HTB Academy → Obsidian Scraper
// @namespace    https://academy.hackthebox.com
// @version      1.0
// @description  Scrape HTB Academy module lessons into Obsidian-compatible markdown files
// @match        https://academy.hackthebox.com/*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      academy.hackthebox.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── Styles ──────────────────────────────────────────────────────────────────
  GM_addStyle(`
    #htb-scraper-toggle {
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      width: 48px; height: 48px; border-radius: 50%;
      background: #9fef00; color: #141d2b; border: none; cursor: pointer;
      font-size: 22px; box-shadow: 0 4px 12px rgba(0,0,0,.4);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s;
    }
    #htb-scraper-toggle:hover { transform: scale(1.1); }

    #htb-scraper-panel {
      position: fixed; bottom: 80px; right: 20px; z-index: 99998;
      width: 420px; max-height: 70vh; background: #1a2332;
      border: 1px solid #9fef00; border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #a4b1cd; box-shadow: 0 8px 32px rgba(0,0,0,.6);
      display: none; flex-direction: column; overflow: hidden;
    }
    #htb-scraper-panel.open { display: flex; }

    #htb-scraper-panel .sp-header {
      padding: 14px 16px; background: #141d2b;
      border-bottom: 1px solid #2a3a4e; flex-shrink: 0;
    }
    #htb-scraper-panel .sp-header h3 {
      margin: 0; color: #9fef00; font-size: 15px; font-weight: 600;
    }
    #htb-scraper-panel .sp-header small {
      color: #6c7a8d; font-size: 11px;
    }

    #htb-scraper-panel .sp-body {
      padding: 12px 16px; overflow-y: auto; flex: 1;
    }

    #htb-scraper-panel .sp-actions {
      padding: 12px 16px; border-top: 1px solid #2a3a4e;
      display: flex; gap: 8px; flex-shrink: 0;
    }

    .sp-btn {
      padding: 8px 14px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 13px; font-weight: 500; transition: opacity .15s;
    }
    .sp-btn:hover { opacity: .85; }
    .sp-btn-primary { background: #9fef00; color: #141d2b; }
    .sp-btn-secondary { background: #2a3a4e; color: #a4b1cd; }
    .sp-btn:disabled { opacity: .4; cursor: not-allowed; }

    .sp-lesson-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; margin: 4px 0; border-radius: 6px;
      background: #141d2b; font-size: 13px;
    }
    .sp-lesson-item .sp-status {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: #2a3a4e;
    }
    .sp-lesson-item .sp-status.done { background: #9fef00; }
    .sp-lesson-item .sp-status.active { background: #f0c040; }
    .sp-lesson-item .sp-status.error { background: #ff4444; }
    .sp-lesson-item .sp-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-lesson-item .sp-copy-btn {
      padding: 4px 10px; border: 1px solid #9fef00; background: transparent;
      color: #9fef00; border-radius: 4px; font-size: 11px; cursor: pointer;
      display: none; transition: background .15s;
    }
    .sp-lesson-item .sp-copy-btn:hover { background: rgba(159,239,0,.15); }
    .sp-lesson-item.scraped .sp-copy-btn { display: inline-block; }

    .sp-progress {
      height: 3px; background: #2a3a4e; border-radius: 2px;
      margin: 10px 0 6px; overflow: hidden;
    }
    .sp-progress-bar {
      height: 100%; background: #9fef00; width: 0%;
      transition: width .3s;
    }

    .sp-log {
      font-size: 11px; color: #6c7a8d; margin-top: 4px;
      max-height: 60px; overflow-y: auto;
    }
  `);

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

      // skip unwanted elements
      if (['script', 'style', 'nav', 'button', 'svg', 'iframe'].includes(tag)) return;
      if (node.classList.contains('module-sidebar') ||
          node.classList.contains('training-module__sidebar') ||
          node.classList.contains('sidebar')) return;

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
            md.push('[');
            children();
            md.push('](' + href + ')');
          } else {
            children();
          }
          break;
        }
        case 'img': {
          const alt = node.getAttribute('alt') || '';
          const src = node.getAttribute('src') || '';
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
          // check for callout/alert boxes
          if (node.classList.contains('alert') || node.classList.contains('callout') ||
              node.classList.contains('card-body') && node.closest('.alert, .callout')) {
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

  // ── Sanitize filename ──────────────────────────────────────────────────────
  function sanitize(name) {
    return name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
  }

  // ── TOC parser ──────────────────────────────────────────────────────────────
  function parseTOC() {
    const lessons = [];

    // HTB Academy uses several possible sidebar selectors
    const sidebarSelectors = [
      '.training-module__sidebar a',
      '.module-sidebar a',
      '.sidebar-nav a',
      'nav.sidebar a',
      '.card-body .list-group a',
      '.syllabus a[href*="/section/"]',
      'a[href*="/module/"][href*="/section/"]',
      '.sidebar a[href*="/section/"]',
    ];

    for (const sel of sidebarSelectors) {
      const links = document.querySelectorAll(sel);
      if (links.length > 0) {
        links.forEach(a => {
          const href = a.href || a.getAttribute('href');
          if (!href) return;
          const url = href.startsWith('http') ? href : new URL(href, location.origin).href;
          if (!url.includes('academy.hackthebox.com')) return;
          const title = a.textContent.trim().replace(/\s+/g, ' ');
          if (title && !lessons.some(l => l.url === url)) {
            lessons.push({ title, url, md: null, status: 'pending' });
          }
        });
        break;
      }
    }

    // fallback: if we're on a section page, at least capture the current page
    if (lessons.length === 0 && location.pathname.includes('/section/')) {
      lessons.push({
        title: document.title.replace(/ \|.*$/, '').trim() || 'Current Lesson',
        url: location.href,
        md: null,
        status: 'pending',
      });
    }

    return lessons;
  }

  // ── Get module name ─────────────────────────────────────────────────────────
  function getModuleName() {
    const selectors = [
      '.training-module__title',
      '.module-title',
      'h1.module-name',
      '.breadcrumb-item:last-child',
      'h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text) return text;
      }
    }
    return document.title.replace(/ \|.*$/, '').trim() || 'HTB Module';
  }

  // ── Scrape a single lesson by fetching its page ─────────────────────────────
  function scrapeLessonPage(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: {
          'Accept': 'text/html',
        },
        onload(res) {
          if (res.status !== 200) {
            reject(new Error(`HTTP ${res.status}`));
            return;
          }
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(res.responseText, 'text/html');

            // find the main content area
            const contentSelectors = [
              '.training-module__content',
              '.module-content',
              '.content-section',
              'article.content',
              '.card-body .content',
              'main .content',
              '#content',
              '.markdown-content',
              'article',
              'main',
            ];

            let content = null;
            for (const sel of contentSelectors) {
              content = doc.querySelector(sel);
              if (content) break;
            }

            if (!content) {
              // fallback: grab the largest text block
              const divs = Array.from(doc.querySelectorAll('div, section'))
                .filter(d => d.textContent.trim().length > 200)
                .sort((a, b) => b.textContent.length - a.textContent.length);
              content = divs[0] || doc.body;
            }

            const markdown = htmlToMarkdown(content);
            resolve(markdown);
          } catch (e) {
            reject(e);
          }
        },
        onerror(err) { reject(err); },
        ontimeout() { reject(new Error('Timeout')); },
        timeout: 15000,
      });
    });
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  let panelOpen = false;
  let lessons = [];
  let scraping = false;

  const toggle = document.createElement('button');
  toggle.id = 'htb-scraper-toggle';
  toggle.textContent = '📋';
  toggle.title = 'HTB Academy Scraper';
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

  function log(msg) {
    logEl.textContent = msg;
  }

  function renderList() {
    listEl.innerHTML = '';
    if (lessons.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#6c7a8d">No lessons found. Navigate to a module page and click Scan TOC.</div>';
      return;
    }
    lessons.forEach((l, i) => {
      const item = document.createElement('div');
      item.className = 'sp-lesson-item' + (l.md ? ' scraped' : '');
      item.innerHTML = `
        <div class="sp-status ${l.status}"></div>
        <div class="sp-name" title="${l.title}">${i + 1}. ${l.title}</div>
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

        GM_setClipboard(full, 'text');
        btn.textContent = '✓ Copied';
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

      // rate-limit: 1 second between requests
      if (i < lessons.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
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

  copyAllBtn.addEventListener('click', () => {
    const moduleName = getModuleName();
    const scraped = lessons.filter(l => l.md && l.status === 'done');
    if (scraped.length === 0) { log('Nothing to copy'); return; }

    const combined = scraped.map((l, i) => {
      const fm = buildFrontmatter(l.title, moduleName, '', l.url);
      const separator = `\n\n---\n<!-- FILE: ${sanitize(l.title)}.md -->\n\n`;
      return (i > 0 ? separator : '') + fm + '\n' + l.md;
    }).join('');

    GM_setClipboard(combined, 'text');
    copyAllBtn.textContent = '✓ Copied All';
    setTimeout(() => { copyAllBtn.textContent = 'Copy All'; }, 2000);
    log(`Copied ${scraped.length} lessons to clipboard (split by --- markers)`);
  });

  // auto-scan on page load if we're on a module page
  if (location.pathname.includes('/module/')) {
    setTimeout(scanTOC, 1500);
  }
})();
