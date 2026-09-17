const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const service = require('./address.service');

// GET /address/provinces
router.get('/address/provinces', requireAuth, async (req, res, next) => {
  try {
    const provinces = await service.listProvinces();
    res.json({ provinces });
  } catch (err) { next(err); }
});

// GET /address/provinces/:province/cities
router.get('/address/provinces/:province/cities', requireAuth, async (req, res, next) => {
  try {
    const cities = await service.listCities(req.params.province);
    res.json({ cities });
  } catch (err) { next(err); }
});

// GET /address/cities/:city/barangays?province=
// province is required — resolving the city by (province, city) instead of
// city name alone is what avoids pulling barangays from a same-named town in
// a different province (see address.service.js's header comment).
router.get('/address/cities/:city/barangays', requireAuth, async (req, res, next) => {
  try {
    const { province } = req.query;
    if (!province || typeof province !== 'string') {
      return res.status(400).json({ error: 'province query param is required' });
    }
    const barangays = await service.listBarangays(province, req.params.city);
    res.json({ barangays });
  } catch (err) { next(err); }
});

// GET /address/zip-check?province=&city=&zip=
// Best-effort validation only — see address.service.js's checkZip comment
// for why this can't be an exact guarantee.
router.get('/address/zip-check', requireAuth, async (req, res, next) => {
  try {
    const { province, city, zip } = req.query;
    if (!province || !city || !zip) {
      return res.status(400).json({ error: 'province, city, and zip query params are required' });
    }
    if (!/^\d{4}$/.test(zip)) {
      return res.json({ valid: false, knownZips: [], reason: 'Zip code must be 4 digits' });
    }
    const result = service.checkZip({ province, city, zip });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
