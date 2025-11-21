const axios = require('axios');

const DEFAULT_USER_AGENT = 'ChainSense/1.0 (https://example.com/contact)';
const USER_AGENT = process.env.GEOCODER_USER_AGENT || DEFAULT_USER_AGENT;

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';

async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    return null;
  }

  try {
    const response = await axios.get(NOMINATIM_BASE_URL, {
      params: {
        q: address,
        format: 'json',
        limit: 1,
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    const [result] = response.data || [];
    if (!result) {
      return null;
    }

    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
    };
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
}

module.exports = {
  geocodeAddress,
};
