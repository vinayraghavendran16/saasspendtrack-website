# SaaSSpendTrack — Deployment Guide

## Step 1: Create the GitHub repo

1. Go to https://github.com/new
2. Name it `saasspendtrack-website`
3. Set it to **Public** (Cloudflare Pages free tier works with both, but public is fine for a marketing site)
4. Click **Create repository**
5. Push the files:

```bash
cd saasspendtrack
git init
git add .
git commit -m "Initial launch"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/saasspendtrack-website.git
git push -u origin main
```

## Step 2: Connect to Cloudflare Pages

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create**
2. Select **Pages** → **Connect to Git**
3. Authorize Cloudflare to access your GitHub account
4. Select the `saasspendtrack-website` repo
5. Configure the build:
   - **Project name:** `saasspendtrack`
   - **Production branch:** `main`
   - **Build command:** *(leave empty — it's a static site)*
   - **Build output directory:** `/` *(root, since index.html is at the top level)*
6. Click **Save and Deploy**

Your site will be live at `saasspendtrack.pages.dev` within a minute.

## Step 3: Add custom domain (saasspendtrack.com)

1. In Cloudflare Pages dashboard, go to your project → **Custom domains**
2. Click **Set up a custom domain**
3. Enter `saasspendtrack.com`
4. If your domain is already on Cloudflare DNS:
   - It will auto-configure the CNAME record
5. If your domain is elsewhere:
   - Add a CNAME record: `saasspendtrack.com` → `saasspendtrack.pages.dev`
   - Or transfer the domain to Cloudflare for easiest management
6. Also add `www.saasspendtrack.com` and set up a redirect rule

## Files in this repo

```
saasspendtrack/
├── index.html      ← Main landing page
├── styles.css      ← All styles
├── DEPLOY.md       ← This file
└── _headers        ← Cloudflare security headers (optional)
```

## Updating the site

Every push to `main` triggers an automatic rebuild on Cloudflare Pages. Just edit, commit, and push.
