# Google Maps API Setup Guide

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "Industrial Tracker" (or your preferred name)
4. Click "Create"

## Step 2: Enable Required APIs

Navigate to **APIs & Services → Library** and enable these APIs:

1. **Maps JavaScript API** - Core map rendering
2. **Places API** - Business search, autocomplete
3. **Geocoding API** - Address to coordinates (optional but useful)

For each API:
- Search for it
- Click on it
- Click "Enable"

## Step 3: Create API Key

1. Go to **APIs & Services → Credentials**
2. Click "Create Credentials" → "API Key"
3. Copy the key (you'll need it for both backend and frontend)

## Step 4: Restrict API Key (Important for Security!)

Click on your new API key to edit it:

### Application Restrictions
Choose "HTTP referrers (websites)" and add:
```
http://localhost:5173/*
http://localhost:3000/*
https://yourdomain.com/*
https://*.yourdomain.com/*
```

### API Restrictions
Select "Restrict key" and check only:
- Maps JavaScript API
- Places API
- Geocoding API

Click "Save"

## Step 5: Set Up Billing

Google Maps requires billing, but offers $200 free credit/month:

1. Go to **Billing** in Cloud Console
2. Link a billing account (or create one)
3. The first $200/month is free - for single user, you'll likely stay under this

### Cost Estimates

| API | Free Tier | Cost After |
|-----|-----------|------------|
| Maps JavaScript | $200/mo credit | $7 per 1,000 loads |
| Places Nearby | $200/mo credit | $32 per 1,000 requests |
| Places Details | $200/mo credit | $17 per 1,000 requests |

For a single user with moderate usage, expect **$0-50/month**.

## Step 6: Configure Your Application

### Backend (.env)
```env
GOOGLE_MAPS_API_KEY=AIzaSy...your-key-here
```

### Frontend (.env)
```env
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...your-key-here
```

## Step 7: Verify Setup

### Test in Browser Console
```javascript
// Open your app and run in browser console:
console.log(google.maps.version);  // Should show version like "3.55"
```

### Test Places API (Backend)
```bash
curl "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=33.7175,-117.8311&radius=100&key=YOUR_API_KEY"
```

## Troubleshooting

### "This page can't load Google Maps correctly"
- Check API key is correct in frontend .env
- Ensure Maps JavaScript API is enabled
- Check referrer restrictions match your URL

### "REQUEST_DENIED" from Places API
- Ensure Places API is enabled
- Check API key restrictions allow Places API
- Verify billing is set up

### Map loads but no satellite imagery
- This is normal for free tier - satellite is included
- Make sure `mapTypeId: 'hybrid'` is set

### Rate limiting errors
- You've exceeded quota
- Check usage in Cloud Console
- Consider caching responses

## Recommended Settings for Development

In Google Cloud Console → APIs & Services → Maps JavaScript API → Quotas:

- Keep default quotas for development
- Monitor usage in dashboard
- Set up billing alerts at $50, $100, $150

## Creating a Separate Key for Production

For production, create a second API key with stricter restrictions:

1. Create new key named "Industrial Tracker - Production"
2. Restrict to only your production domain
3. Use this key in production environment
4. Keep development key for localhost only

This way if one key is compromised, the other still works.
