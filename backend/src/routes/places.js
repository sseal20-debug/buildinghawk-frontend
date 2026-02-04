import { Router } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// GET /api/places/nearby - Find businesses near a location
router.get('/nearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 50 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', radius);
    url.searchParams.set('type', 'establishment');
    url.searchParams.set('key', GOOGLE_API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message);
      return res.status(500).json({
        error: 'Google Places API error',
        details: data.error_message
      });
    }

    // Transform results to simpler format
    const places = (data.results || []).map(place => ({
      place_id: place.place_id,
      name: place.name,
      address: place.vicinity,
      types: place.types,
      business_status: place.business_status,
      location: {
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng
      }
    }));

    res.json({
      places,
      count: places.length
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/places/details/:placeId - Get detailed business info
router.get('/details/:placeId', async (req, res, next) => {
  try {
    const { placeId } = req.params;

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'name,formatted_address,formatted_phone_number,website,business_status,types,opening_hours');
    url.searchParams.set('key', GOOGLE_API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return res.status(404).json({ error: 'Place not found' });
    }

    res.json(data.result);
  } catch (err) {
    next(err);
  }
});

// GET /api/places/autocomplete - Address autocomplete
router.get('/autocomplete', async (req, res, next) => {
  try {
    const { input } = req.query;

    if (!input || input.length < 3) {
      return res.status(400).json({ error: 'Input must be at least 3 characters' });
    }

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('types', 'address');
    url.searchParams.set('components', 'country:us');
    // Bias results to Orange County area
    url.searchParams.set('location', '33.7175,-117.8311');
    url.searchParams.set('radius', '50000');
    url.searchParams.set('key', GOOGLE_API_KEY);

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: 'Autocomplete error' });
    }

    const predictions = (data.predictions || []).map(p => ({
      place_id: p.place_id,
      description: p.description,
      main_text: p.structured_formatting?.main_text,
      secondary_text: p.structured_formatting?.secondary_text
    }));

    res.json(predictions);
  } catch (err) {
    next(err);
  }
});

// GET /api/places/geocode - Get coordinates for a place_id or address
router.get('/geocode', async (req, res, next) => {
  try {
    const { place_id, address } = req.query;

    if (!place_id && !address) {
      return res.status(400).json({ error: 'place_id or address is required' });
    }

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    let lat, lng;

    if (place_id) {
      // Get location from place details
      const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
      url.searchParams.set('place_id', place_id);
      url.searchParams.set('fields', 'geometry,formatted_address');
      url.searchParams.set('key', GOOGLE_API_KEY);

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.result?.geometry?.location) {
        return res.status(404).json({ error: 'Location not found' });
      }

      lat = data.result.geometry.location.lat;
      lng = data.result.geometry.location.lng;

      res.json({
        lat,
        lng,
        formatted_address: data.result.formatted_address
      });
    } else {
      // Geocode address string
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('key', GOOGLE_API_KEY);

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
        return res.status(404).json({ error: 'Address not found' });
      }

      const result = data.results[0];
      lat = result.geometry.location.lat;
      lng = result.geometry.location.lng;

      res.json({
        lat,
        lng,
        formatted_address: result.formatted_address
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
