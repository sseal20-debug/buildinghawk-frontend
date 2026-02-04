# Domain & Hosting Setup Guide

This guide walks you through deploying your Industrial Tracker to production with your own domain.

---

## Option 1: Railway (Recommended for Simplicity)

Railway provides managed PostgreSQL with PostGIS and easy deployment.

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Create a new project

### Step 2: Add PostgreSQL with PostGIS
1. In your project, click "New Service"
2. Select "Database" → "PostgreSQL"
3. Once created, click the database
4. Go to "Settings" → "Database Settings"
5. Run this SQL in the "Query" tab:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```

### Step 3: Deploy Backend
1. Click "New Service" → "GitHub Repo"
2. Select your repo and set root directory to `backend`
3. Add environment variables:
   - `DATABASE_URL` - Copy from PostgreSQL service
   - `GOOGLE_MAPS_API_KEY` - Your Google key
   - `NODE_ENV` - `production`
4. Railway auto-detects Node.js and deploys

### Step 4: Deploy Frontend
1. Click "New Service" → "GitHub Repo"
2. Select same repo, root directory: `frontend`
3. Add build settings:
   - Build command: `npm run build`
   - Start command: `npx serve dist -s`
4. Add environment variables:
   - `VITE_GOOGLE_MAPS_API_KEY`
   - `VITE_API_URL` - Your backend Railway URL

### Step 5: Add Custom Domain
1. Go to frontend service → Settings → Domains
2. Click "Add Custom Domain"
3. Enter your domain (e.g., `app.yourdomain.com`)
4. Railway provides DNS records to add to your registrar

### Railway Costs
- Hobby Plan: $5/month base + usage
- Estimated total: $20-40/month for this app

---

## Option 2: Render

Similar to Railway but with generous free tier.

### Step 1: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub

### Step 2: Create PostgreSQL Database
1. New → PostgreSQL
2. Name: `industrial-tracker-db`
3. Region: Oregon (or closest to you)
4. Plan: Starter ($7/mo) or higher for PostGIS support
5. After creation, run PostGIS setup via connection

### Step 3: Deploy Backend
1. New → Web Service
2. Connect your GitHub repo
3. Settings:
   - Root directory: `backend`
   - Build command: `npm install`
   - Start command: `npm start`
4. Environment variables (same as Railway)

### Step 4: Deploy Frontend
1. New → Static Site
2. Connect repo, root: `frontend`
3. Build command: `npm run build`
4. Publish directory: `dist`

### Step 5: Custom Domain
1. Go to your service → Settings → Custom Domains
2. Add your domain
3. Configure DNS at your registrar

---

## Option 3: DigitalOcean App Platform

Good middle ground with more control.

### Estimated Cost: $12-25/month

### Setup
1. Create App Platform app
2. Add PostgreSQL database (managed)
3. Deploy from GitHub
4. Add custom domain in settings

---

## Domain Configuration

Regardless of host, you'll need to configure DNS:

### If Using Subdomain (Recommended)
For `app.yourdomain.com`:

| Type | Name | Value |
|------|------|-------|
| CNAME | app | `your-app.railway.app` (or render URL) |

### If Using Root Domain
For `yourdomain.com`:

| Type | Name | Value |
|------|------|-------|
| A | @ | `IP from host` |
| CNAME | www | `your-app.railway.app` |

### SSL/HTTPS
- Railway, Render, and most modern hosts provide free SSL via Let's Encrypt
- Automatically enabled when you add a custom domain

---

## Environment Variables Checklist

### Backend (.env or host config)
```
DATABASE_URL=postgresql://...
GOOGLE_MAPS_API_KEY=AIza...
NODE_ENV=production
PORT=3001
JWT_SECRET=your-secret-key
FRONTEND_URL=https://app.yourdomain.com
```

### Frontend (.env or host config)
```
VITE_GOOGLE_MAPS_API_KEY=AIza...
VITE_API_URL=https://api.yourdomain.com
```

---

## Database Migration

After deploying, initialize your database:

### Option A: Direct Connection
```bash
# Connect using your DATABASE_URL
psql $DATABASE_URL -f backend/src/db/schema.sql
```

### Option B: Railway/Render Console
1. Go to database service
2. Open Query/Console tab
3. Paste schema.sql contents
4. Execute

---

## Post-Deployment Checklist

- [ ] Database schema created
- [ ] PostGIS extension enabled
- [ ] Backend health check passes (`/health` endpoint)
- [ ] Frontend loads and shows map
- [ ] Google Maps API working (no console errors)
- [ ] Custom domain SSL working (https)
- [ ] Google API key restrictions updated for production domain

---

## Updating Your Domain's Registrar

### Common Registrars

**Namecheap:**
1. Log in → Domain List → Manage
2. Advanced DNS
3. Add records per hosting provider instructions

**GoDaddy:**
1. My Products → Domains → DNS
2. Add records

**Google Domains:**
1. My domains → Manage → DNS
2. Custom records → Add

**Cloudflare (if using as DNS):**
1. Select domain → DNS
2. Add records
3. Ensure proxy status is "DNS only" for initial setup

---

## Recommended Architecture

```
                    ┌─────────────────────┐
                    │   Your Domain       │
                    │ app.yourdomain.com  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │    Cloudflare       │
                    │   (Optional CDN)    │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    │
┌─────────────────┐  ┌─────────────────┐           │
│    Frontend     │  │    Backend      │           │
│ (Static Site)   │  │  (Node.js API)  │           │
│   Render/Rail   │  │   Render/Rail   │           │
└─────────────────┘  └────────┬────────┘           │
                              │                    │
                    ┌─────────▼────────┐           │
                    │   PostgreSQL     │◄──────────┘
                    │   + PostGIS      │
                    │   (Managed DB)   │
                    └──────────────────┘
```

---

## Quick Start Commands

Once hosted, run these to initialize:

```bash
# SSH into your server or use Railway/Render shell

# Initialize database
npm run db:init

# Seed sample data (optional)
npm run db:seed

# Check health
curl https://api.yourdomain.com/health
```

---

## Monitoring & Logs

### Railway
- Built-in logs in dashboard
- Click on service → "View Logs"

### Render
- Dashboard → Service → Logs

### Setting Up Alerts
1. Railway: Settings → Notifications
2. Render: Dashboard → Settings → Notifications
3. Set up for: Deploy failures, high CPU/memory, errors

---

## Backup Strategy

### Database Backups
- Railway: Automatic daily backups (Pro plan)
- Render: Automatic backups included
- Manual: `pg_dump $DATABASE_URL > backup.sql`

### Recommended Schedule
- Daily automatic backups (via host)
- Weekly manual export to local/cloud storage
- Before major updates: manual snapshot
