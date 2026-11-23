#!/usr/bin/env node
/*
 * Full site audit — runs against the static build in this repo.
 *   - Serves ./ on an ephemeral port
 *   - For every .html, in both desktop + mobile viewports:
 *     - Checks every text node >= 11px for WCAG AA contrast against
 *       its effective background (walks up until opaque) at the
 *       computed font-size-adjusted threshold (3:1 large / 4.5:1 body)
 *     - Captures every console error / page error / failed request
 *     - Verifies all in-page anchors resolve
 *     - Flags any element whose text visibly overflows its box
 *   - Writes audit-report.json and prints a pass/fail summary
 *
 * Usage: node audit.js
 * CI: exits non-zero when any FAIL is found. WARN never fails.
 */
const puppeteer = require('puppeteer');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const PAGES = [
  '/', '/pricing/', '/about/', '/faq/', '/compare/',
  '/compare/vendr-alternative/', '/compare/zluri-alternative/',
  '/compare/torii-alternative/', '/compare/spendflo-alternative/',
  '/compare/spendesk-alternative/', '/compare/ramp-alternative/',
  '/compare/productiv-alternative/', '/compare/bettercloud-alternative/',
  '/compare/zylo-alternative/',
  '/tools/', '/tools/saas-waste-calculator/', '/tools/templates/',
  '/blog/', '/blog/missed-saas-renewal/', '/blog/saas-budget-cfo-guide/',
  '/blog/saas-spend-audit/', '/blog/saas-vendor-negotiation/',
  '/blog/shadow-it-saas-sprawl/', '/blog/zluri-spendflo-alternative/',
  '/privacy.html',
];
const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile',  width: 390,  height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

// ---------- tiny static server ----------
const MIME = {
  '.html':'text/html;charset=utf-8', '.css':'text/css',
  '.js':'application/javascript', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.ico':'image/x-icon', '.json':'application/json',
  '.xml':'application/xml', '.txt':'text/plain', '.csv':'text/csv',
  '.webmanifest':'application/manifest+json',
};
function serve(root) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      const fp = path.join(root, urlPath);
      if (!fp.startsWith(root)) { res.writeHead(403); return res.end('403'); }
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); return res.end('404'); }
        res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

// ---------- contrast math ----------
function relLum([r,g,b]) {
  const f = c => { c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055, 2.4); };
  const [R,G,B] = [f(r),f(g),f(b)];
  return .2126*R + .7152*G + .0722*B;
}
function contrast(fg, bg) {
  const L1 = relLum(fg), L2 = relLum(bg);
  return (Math.max(L1,L2)+.05) / (Math.min(L1,L2)+.05);
}
function parseColor(str) {
  if (!str) return null;
  let m = str.match(/^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d*\.?\d+))?\)$/);
  if (!m) return null;
  return [+m[1], +m[2], +m[3], m[4]!==undefined ? +m[4] : 1];
}

// Runs inside the page. Returns {contrast:[], overflow:[]}
const PAGE_CHECK = `
(() => {
  function parse(s) {
    const m = s.match(/^rgba?\\((\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?)(?:,\\s*(\\d*\\.?\\d+))?\\)$/);
    return m ? [+m[1],+m[2],+m[3], m[4]!==undefined?+m[4]:1] : null;
  }
  function blend(fg, bg) {
    const a = fg[3];
    return [fg[0]*a+bg[0]*(1-a), fg[1]*a+bg[1]*(1-a), fg[2]*a+bg[2]*(1-a), 1];
  }
  function effectiveBg(el) {
    let bg = [255,255,255,1];
    let n = el;
    const stack = [];
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      const c = parse(s.backgroundColor);
      if (c && c[3] > 0) stack.push(c);
      // if any ancestor has a bg image we can't tell; treat as unknown
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      n = n.parentElement;
    }
    // stack is child-to-root; composite from root down
    for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg);
    return bg;
  }
  const results = { contrast: [], overflow: [] };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el) continue;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.1) continue;
    const fontSize = parseFloat(s.fontSize);
    if (fontSize < 10) continue;
    const key = el.tagName + '|' + (el.className||'') + '|' + Math.round(rect.top) + '|' + node.nodeValue.trim().slice(0,30);
    if (seen.has(key)) continue;
    seen.add(key);
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    if (!bg) continue;
    const fgOnBg = [fg[0]*fg[3]+bg[0]*(1-fg[3]), fg[1]*fg[3]+bg[1]*(1-fg[3]), fg[2]*fg[3]+bg[2]*(1-fg[3])];
    function lum([r,g,b]) {
      const f = c => { c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055, 2.4); };
      return .2126*f(r)+.7152*f(g)+.0722*f(b);
    }
    const L1 = lum(fgOnBg), L2 = lum(bg);
    const cr = (Math.max(L1,L2)+.05) / (Math.min(L1,L2)+.05);
    const weight = parseInt(s.fontWeight, 10) || 400;
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const threshold = isLarge ? 3.0 : 4.5;
    if (cr < threshold) {
      results.contrast.push({
        tag, cls: (el.className||'').toString().slice(0,80),
        text: node.nodeValue.trim().slice(0,60),
        fg: s.color, bg: 'rgb('+bg.slice(0,3).map(Math.round).join(',')+')',
        ratio: +cr.toFixed(2), need: threshold, fontSize, weight,
        y: Math.round(rect.top),
      });
    }
    // overflow check on same element
    if (el.scrollWidth > el.clientWidth + 2 && s.overflow !== 'visible' && s.overflowX !== 'scroll' && s.overflowX !== 'auto') {
      results.overflow.push({ tag, cls: (el.className||'').toString().slice(0,80), text: node.nodeValue.trim().slice(0,40), scrollW: el.scrollWidth, clientW: el.clientWidth });
    }
  }
  // Collect in-page hash targets to check anchors later
  results.anchors = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
  results.ids = Array.from(document.querySelectorAll('[id]')).map(e => e.id);
  return results;
})();
`;

(async () => {
  const { srv, port } = await serve(ROOT);
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`[audit] serving ${ROOT} on ${BASE}`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const report = { base: BASE, pages: {}, summary: { pages: 0, fails: 0, warns: 0 } };

  for (const url of PAGES) {
    const pageReport = { url, viewports: {} };
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      const consoleErrors = [];
      const pageErrors = [];
      const failedReqs = [];
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
      page.on('pageerror', err => pageErrors.push(err.message.slice(0, 200)));
      // Third-party scripts we don't control (and that work in real browsers)
      const IGNORE_HOSTS = [
        'ddwl4m2hdecbv.cloudfront.net',  // RB2B visitor ID — blocked by headless ORB
        'www.googletagmanager.com', 'www.google-analytics.com',
      ];
      const skipReq = (url) => IGNORE_HOSTS.some(h => url.includes(h));
      page.on('requestfailed', req => { if (!skipReq(req.url())) failedReqs.push({ url: req.url(), err: req.failure()?.errorText }); });
      page.on('response', res => { if (res.status() >= 400 && !skipReq(res.url())) failedReqs.push({ url: res.url(), status: res.status() }); });

      let status = 'ok';
      let result = null;
      try {
        const resp = await page.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 15000 });
        if (!resp || !resp.ok()) status = `http_${resp?.status()||'?'}`;
        await new Promise(r => setTimeout(r, 300)); // let any after-load CSS apply
        result = await page.evaluate(PAGE_CHECK);
      } catch (e) {
        status = 'error:' + e.message.slice(0, 100);
      }
      pageReport.viewports[vp.name] = {
        status,
        contrast: result?.contrast || [],
        overflow: result?.overflow || [],
        consoleErrors, pageErrors, failedReqs,
        anchors: result?.anchors || [],
        ids: result?.ids || [],
      };
      await page.close();
    }
    report.pages[url] = pageReport;
    report.summary.pages++;
    process.stdout.write('.');
  }
  console.log();

  // Broken in-page anchor check (local only, same-page #)
  for (const [url, p] of Object.entries(report.pages)) {
    for (const vpName of Object.keys(p.viewports)) {
      const v = p.viewports[vpName];
      v.brokenAnchors = (v.anchors || [])
        .filter(h => h && h.startsWith('#') && h.length > 1)
        .filter(h => !v.ids.includes(h.slice(1)));
    }
  }

  // Scoring
  let fails = 0, warns = 0;
  const failRows = [], warnRows = [];
  for (const [url, p] of Object.entries(report.pages)) {
    for (const [vpName, v] of Object.entries(p.viewports)) {
      // FAIL: HTTP non-ok, page errors, failed requests, broken anchors, contrast under threshold
      if (v.status !== 'ok') failRows.push({ url, vp: vpName, kind: 'load', detail: v.status });
      v.pageErrors.forEach(e => failRows.push({ url, vp: vpName, kind: 'js-error', detail: e }));
      v.failedReqs.forEach(r => failRows.push({ url, vp: vpName, kind: 'failed-request', detail: r }));
      v.brokenAnchors.forEach(a => failRows.push({ url, vp: vpName, kind: 'broken-anchor', detail: a }));
      v.contrast.forEach(c => failRows.push({ url, vp: vpName, kind: 'contrast', detail: `${c.tag}.${c.cls.split(' ')[0]||''} "${c.text}" ${c.ratio}:1 need ${c.need}:1 (${c.fg} on ${c.bg})` }));
      // WARN: console errors, overflow
      v.consoleErrors.forEach(e => warnRows.push({ url, vp: vpName, kind: 'console', detail: e }));
      v.overflow.forEach(o => warnRows.push({ url, vp: vpName, kind: 'overflow', detail: `${o.tag}.${o.cls.split(' ')[0]||''} "${o.text}" scroll ${o.scrollW}>${o.clientW}` }));
    }
  }
  fails = failRows.length; warns = warnRows.length;
  report.summary.fails = fails; report.summary.warns = warns;
  report.failRows = failRows; report.warnRows = warnRows;

  fs.writeFileSync(path.join(ROOT, 'audit-report.json'), JSON.stringify(report, null, 2));
  console.log(`\n[audit] pages: ${report.summary.pages}   FAIL: ${fails}   WARN: ${warns}`);
  if (fails) {
    console.log('\n--- FAILS ---');
    for (const r of failRows.slice(0, 80)) console.log(`  [${r.vp}] ${r.url}  ${r.kind}: ${r.detail}`);
    if (failRows.length > 80) console.log(`  ... +${failRows.length-80} more`);
  }
  if (warns) {
    console.log('\n--- WARNS (first 20) ---');
    for (const r of warnRows.slice(0, 20)) console.log(`  [${r.vp}] ${r.url}  ${r.kind}: ${r.detail}`);
    if (warnRows.length > 20) console.log(`  ... +${warnRows.length-20} more`);
  }

  await browser.close();
  srv.close();
  process.exit(fails > 0 ? 1 : 0);
})();
