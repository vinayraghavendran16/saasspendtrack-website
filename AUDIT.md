# Website audit

Automated contrast + console + link + layout check across every page
of the site. Runs locally against the static files in this repo.

## What it checks

For every `.html` file (listed in `audit.js`), on both desktop (1366px)
and mobile (390px) viewports:

- **Contrast** — every visible text node is checked against its
  effective background color (composited through ancestor opacities)
  at the WCAG AA threshold (4.5:1 body, 3:1 large text). The actual
  computed colors are reported, not declared ones, so inherited and
  cascade bugs surface.
- **Page errors** — every JS error, unhandled rejection, console
  error, failed network request (non-ignored).
- **Broken in-page anchors** — any `href="#foo"` with no matching
  `id="foo"` on the same page.
- **Overflow** — elements whose scroll width exceeds client width
  with hidden overflow (text clipped).

Third-party scripts we can't control (RB2B visitor-ID script on
CloudFront, Google Analytics) are allowlisted in `audit.js` because
they are blocked by Chrome's ORB protection in headless mode but
load fine for real users.

## Running it

```bash
node audit.js
```

Needs `puppeteer` (hoisted to the parent directory in this
workspace). The script spins up an ephemeral static server on
127.0.0.1, boots a headless Chrome, visits every page in both
viewports, writes `audit-report.json`, and prints a summary.

Exit code: **non-zero when any FAIL is found.** WARNs never fail.

## When to run it

Before every push that changes HTML, CSS, or any content that a page
depends on. It is fast (~30 seconds for 25 pages × 2 viewports) and
catches the class of bug that shipped on 2026-11-15 (invisible
headings on sub-pages caused by light-background sections inheriting
the dark-theme body color).

## Report format

`audit-report.json` holds the full per-page, per-viewport record.
Grep by `kind`:

- `contrast` — foreground/background pair below threshold
- `js-error` — thrown in-page
- `failed-request` — resource load failed (status ≥ 400 or network error)
- `broken-anchor` — `href="#foo"` with no matching id
- `console` (warn only) — console.error in the page
- `overflow` (warn only) — clipped text

Each row names the URL, viewport, element tag, class, surrounding
text, and the computed colors involved.
