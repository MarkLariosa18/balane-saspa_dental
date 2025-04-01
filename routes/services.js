const express = require('express');
const supabase = require('./supabase');
const router = express.Router();

// GET /api/services - Fetch all services
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/services requested');

    // Fetch all services from the "services" table using Supabase
    const { data, error } = await supabase
      .from('services')
      .select('id, name, description')
      .order('name', { ascending: true }); // Added ordering for consistency

    if (error) {
      console.error('Supabase error details:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return res.status(200).json({ success: true, services: [] }); // Modified response format
    }

    res.status(200).json({ success: true, services: data });
  } catch (error) {
    console.error('Error fetching services:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch services', error: error.message });
  }
});

// GET /api/services/all - Fetch all services (for appointment.html)
router.get('/all', async (req, res) => {
  try {
    console.log('GET /api/services/all requested');

    // Fetch all services from the "services" table using Supabase
    const { data, error } = await supabase
      .from('services')
      .select('id, name, description')
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase error details:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return res.status(200).json({ success: true, services: [] });
    }

    res.status(200).json({ success: true, services: data });
  } catch (error) {
    console.error('Error fetching services:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch services', error: error.message });
  }
});

// POST /api/services - Add a new service
router.post('/', async (req, res) => {
  const { name, description } = req.body;

  // Input validation
  if (!name || !description) {
    return res.status(400).json({ message: 'Name and description are required' });
  }

  try {
    console.log('POST /api/services requested:', req.body);

    // Insert data into the "services" table using Supabase
    const { data, error } = await supabase
      .from('services')
      .insert([{ name, description }])
      .select(); // Return the inserted row

    if (error) {
      console.error('Supabase error details:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }

    res.status(201).json({
      message: 'Service added successfully',
      service: data[0],
    });
  } catch (error) {
    console.error('Error adding service:', error.message);
    res.status(500).json({ message: 'Failed to add service', error: error.message });
  }
});

module.exports = router;