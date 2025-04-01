const express = require('express');
const supabase = require('./supabase');
const router = express.Router();
const crypto = require('crypto');
const WebSocket = require('ws');

// Load environment variables
require('dotenv').config();

// Encryption settings
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Validate and set encryption key from environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error('Missing ENCRYPTION_KEY in environment variables');
  process.exit(1);
}

const encryptionKey = Buffer.from(ENCRYPTION_KEY, 'hex');
if (encryptionKey.length !== 32) {
  console.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes (64 hex chars), got ${encryptionKey.length} bytes`);
  process.exit(1);
}
console.log('Encryption Key (hex):', ENCRYPTION_KEY.slice(0, 8) + '...');

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  console.log('Authentication check - Session:', req.session);
  if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

// Middleware to check admin role
const isAdmin = async (req, res, next) => {
  try {
    console.log('Checking admin for userId:', req.session.userId);
    const { data, error } = await supabase
      .from('admin')
      .select('id')
      .eq('id', req.session.userId)
      .single();
    if (error) throw error;
    if (!data) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Error checking admin role:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Encryption functions
function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Encryption failed');
  }
}

function decrypt(text) {
  if (!text) return null;
  const [ivText, encryptedText] = text.split(':');
  if (!ivText || !encryptedText) {
    console.warn(`Data appears unencrypted or invalid format: "${text}". Returning as-is.`);
    return text;
  }
  try {
    console.log(`Attempting to decrypt (first pass): "${text}"`);
    const iv = Buffer.from(ivText, 'hex');
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
    }
    const encrypted = Buffer.from(encryptedText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    let decryptedString = decrypted.toString('utf8');

    if (decryptedString.includes(':')) {
      console.log(`First decryption produced encrypted output: "${decryptedString}". Attempting second pass.`);
      const [secondIvText, secondEncryptedText] = decryptedString.split(':');
      const secondIv = Buffer.from(secondIvText, 'hex');
      const secondEncrypted = Buffer.from(secondEncryptedText, 'hex');
      const secondDecipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, secondIv);
      let secondDecrypted = secondDecipher.update(secondEncrypted);
      secondDecrypted = Buffer.concat([secondDecrypted, secondDecipher.final()]);
      decryptedString = secondDecrypted.toString('utf8');

      if (!decryptedString || decryptedString.includes(':') || /[^ -~]/.test(decryptedString)) {
        console.warn(`Second decryption produced invalid output: "${decryptedString}". Returning original: "${text}"`);
        return text;
      }
      console.log(`Successfully decrypted (after second pass): "${text}" -> "${decryptedString}"`);
      return decryptedString;
    }

    if (!decryptedString || /[^ -~]/.test(decryptedString)) {
      console.warn(`Single decryption produced invalid output: "${decryptedString}". Returning original: "${text}"`);
      return text;
    }
    console.log(`Successfully decrypted (single pass): "${text}" -> "${decryptedString}"`);
    return decryptedString;
  } catch (error) {
    console.error('Decryption failed:', {
      error: error.message,
      input: text,
      ivLength: ivText?.length,
      keySnippet: ENCRYPTION_KEY.slice(0, 8) + '...'
    });
    return text;
  }
}

// GET /api/appointments/booked - Fetch all booked appointments (excluding cancelled)
router.get('/booked', async (req, res) => {
  try {
    console.log('GET /api/appointments/booked requested');
    const { data, error } = await supabase
      .from('appointments')
      .select('id, appointment_date, notes')
      .neq('status', 'cancelled')
      .order('appointment_date', { ascending: true });

    if (error) throw error;

    const decryptedData = data.map(appointment => ({
      ...appointment,
      notes: appointment.notes ? decrypt(appointment.notes) : null
    }));

    res.status(200).json({ success: true, appointments: decryptedData });
  } catch (error) {
    console.error('Error fetching booked appointments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch booked appointments', error: error.message });
  }
});

// POST /api/appointments - Book a new appointment with double-booking check
router.post('/', isAuthenticated, async (req, res) => {
  const { user_id, appointment_date, service_id, notes } = req.body;

  try {
    if (!user_id || !appointment_date || !service_id) {
      return res.status(400).json({ message: 'User ID, appointment date, and service ID are required' });
    }

    const { data: serviceCheck, error: serviceError } = await supabase
      .from('services')
      .select('id')
      .eq('id', service_id)
      .single();
    if (serviceError) throw serviceError;
    if (!serviceCheck) {
      return res.status(404).json({ message: 'Selected service does not exist' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('appointments')
      .select('id')
      .eq('appointment_date', appointment_date)
      .neq('status', 'cancelled');
    if (existingError) throw existingError;
    if (existing.length > 0) {
      return res.status(409).json({ message: 'This time slot is already booked' });
    }

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert([{ 
        user_id, 
        appointment_date, 
        service_id, 
        notes: notes ? encrypt(notes) : null,
        status: 'pending' 
      }])
      .select()
      .single();
    if (appointmentError) throw appointmentError;

    const appointmentId = appointment.id;

    const { error: requestError } = await supabase
      .from('appointment_requests')
      .insert([{ appointment_id: appointmentId, user_id, action: 'confirm', status: 'pending' }]);
    if (requestError) throw requestError;

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ pending_action: 'confirm' })
      .eq('id', appointmentId);
    if (updateError) throw updateError;

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully, awaiting admin confirmation',
      appointment: {
        ...appointment,
        notes: appointment.notes ? decrypt(appointment.notes) : null
      }
    });
  } catch (error) {
    console.error('Error booking appointment:', error);
    res.status(500).json({ success: false, message: 'Failed to book appointment', error: error.message });
  }
});

// GET /api/appointments - Fetch upcoming appointments for the logged-in user or past appointments with query param
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const isPast = req.query.past === 'true';
    const dateFilter = req.query.date || new Date().toISOString().split('T')[0];
    console.log('Fetching appointments for userId:', req.session.userId, 'Past:', isPast, 'Date:', dateFilter);

    let query = supabase
      .from('appointments')
      .select(`
        id,
        appointment_date,
        status,
        notes,
        pending_action,
        services (name)
      `)
      .eq('user_id', req.session.userId)
      .order('appointment_date', { ascending: !isPast });

    if (isPast) {
      query = query.lte('appointment_date', dateFilter);
    } else {
      query = query.gte('appointment_date', dateFilter)
                  .in('status', ['pending', 'confirmed']);
    }

    const { data, error } = await query;
    if (error) throw error;

    const decryptedData = data.map(appointment => ({
      ...appointment,
      notes: appointment.notes ? decrypt(appointment.notes) : null
    }));

    res.status(200).json({ success: true, appointments: decryptedData });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch appointments', error: error.message });
  }
});

// GET /api/appointments/history/:userId - Fetch appointment history
router.get('/history/:userId?', isAuthenticated, async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: isAdminUser, error: adminError } = await supabase
      .from('admin')
      .select('id')
      .eq('id', req.session.userId)
      .single();
    if (adminError) throw adminError;

    let query = supabase
      .from('appointments')
      .select(`
        id,
        user_id,
        appointment_date,
        status,
        notes,
        services (name, description)
      `)
      .order('appointment_date', { ascending: false });

    if (!isAdminUser && userId && userId !== req.session.userId) {
      return res.status(403).json({ message: 'Forbidden: Cannot view other users\' history' });
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: appointments, error } = await query;
    if (error) throw error;

    const patientIds = [...new Set(appointments.map(app => app.user_id))];
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw patientError;

    console.log('Patients data before decryption:', patients);

    const patientMap = new Map(patients.map(p => [
      p.id,
      {
        first_name: decrypt(p.first_name),
        last_name: decrypt(p.last_name)
      }
    ]));

    const history = appointments.map(app => ({
      ...app,
      notes: app.notes ? decrypt(app.notes) : null,
      patients: patientMap.get(app.user_id) || { first_name: null, last_name: null }
    }));

    res.status(200).json({ success: true, history });
  } catch (error) {
    console.error('Error fetching appointment history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch appointment history', error: error.message });
  }
});

// DELETE /api/appointments/:id - Request cancellation
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { cancel_reason } = req.body; // Expecting camelCase or snake_case
    if (!cancel_reason) return res.status(400).json({ message: 'Cancellation reason is required' });

    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', req.params.id)
      .eq('patient_id', req.session.userId)
      .single();
    if (fetchError) throw fetchError;
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      return res.status(400).json({ message: 'Cannot cancel this appointment' });
    }

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'pending_cancellation', cancel_reason })
      .eq('id', req.params.id)
      .eq('patient_id', req.session.userId);
    if (error) throw error;

    res.status(200).json({ message: 'Cancellation requested' });
  } catch (error) {
    console.error('Error requesting cancellation:', error);
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/appointments/:id - Edit an existing appointment
router.put('/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { appointment_date, notes } = req.body;

  console.log('PUT /api/appointments/:id called with:', { id, userId: req.session.userId, body: req.body });

  try {
    if (!appointment_date) {
      return res.status(400).json({ success: false, message: 'Appointment date is required' });
    }

    const { data: appointmentCheck, error: checkError } = await supabase
      .from('appointments')
      .select('id, user_id, appointment_date, notes, status, pending_action')
      .eq('id', id)
      .eq('user_id', req.session.userId)
      .single();

    if (checkError) throw new Error(`Supabase error: ${checkError.message}`);
    if (!appointmentCheck) {
      return res.status(404).json({ success: false, message: 'Appointment not found or not authorized' });
    }

    if (!['pending', 'confirmed'].includes(appointmentCheck.status)) {
      return res.status(400).json({ success: false, message: 'Cannot edit completed or cancelled appointment' });
    }

    if (appointmentCheck.pending_action) {
      return res.status(400).json({ success: false, message: `Cannot edit: ${appointmentCheck.pending_action} request pending` });
    }

    const { data: conflictCheck, error: conflictError } = await supabase
      .from('appointments')
      .select('id')
      .eq('appointment_date', appointment_date)
      .neq('id', id)
      .neq('status', 'cancelled');

    if (conflictError) throw conflictError;
    if (conflictCheck.length > 0) {
      return res.status(409).json({ success: false, message: 'Time slot already booked' });
    }

    const updatedData = {
      appointment_date,
      notes: notes ? encrypt(notes) : null,
      updated_at: new Date().toISOString()
    };

    const { data: updatedAppointment, error: updateError } = await supabase
      .from('appointments')
      .update(updatedData)
      .eq('id', id)
      .select('id, user_id, appointment_date, notes, status, services (name)')
      .single();

    if (updateError) throw updateError;

    const decryptedAppointment = {
      ...updatedAppointment,
      notes: updatedAppointment.notes ? decrypt(updatedAppointment.notes) : null
    };

    res.status(200).json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: decryptedAppointment
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ success: false, message: 'Failed to update appointment', error: error.message });
  }
});

// GET /api/appointments - Fetch all appointments for the user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, services(name)')
      .eq('patient_id', req.session.userId)
      .order('appointment_date', { ascending: true });
    if (error) throw error;
    res.json({ appointments: data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/appointments/requests - Fetch all pending requests (admin only)
router.get('/requests', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('appointment_requests')
      .select(`
        id,
        appointment_id,
        user_id,
        action,
        status,
        created_at,
        appointments (appointment_date, notes, services (name))
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const patientIds = [...new Set(requests.map(req => req.user_id))];
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw patientError;

    console.log('Patients data before decryption:', patients);

    const patientMap = new Map(patients.map(p => [
      p.id,
      {
        first_name: decrypt(p.first_name),
        last_name: decrypt(p.last_name)
      }
    ]));

    const enrichedRequests = requests.map(req => ({
      ...req,
      appointments: {
        ...req.appointments,
        notes: req.appointments.notes ? decrypt(req.appointments.notes) : null
      },
      patients: patientMap.get(req.user_id) || { first_name: null, last_name: null },
      admin: { username: 'Admin' }
    }));

    res.status(200).json({ success: true, requests: enrichedRequests });
  } catch (error) {
    console.error('Error fetching appointment requests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch appointment requests', error: error.message });
  }
});

// POST /api/appointments/requests/:requestId/approve - Approve a request (admin only)
router.post('/requests/:requestId/approve', isAuthenticated, isAdmin, async (req, res) => {
  const { requestId } = req.params;
  try {
    const { data: requestCheck, error: checkError } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();
    if (checkError) throw checkError;
    if (!requestCheck) {
      return res.status(404).json({ message: 'Request not found or already processed' });
    }

    const request = requestCheck;

    if (request.action === 'cancel') {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', pending_action: null })
        .eq('id', request.appointment_id);
      if (updateError) throw updateError;
    } else if (request.action === 'confirm') {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'confirmed', pending_action: null })
        .eq('id', request.appointment_id);
      if (updateError) throw updateError;
    }

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    if (requestUpdateError) throw requestUpdateError;

    res.status(200).json({ success: true, message: `${request.action} request approved successfully` });
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ success: false, message: 'Failed to approve request', error: error.message });
  }
});

// POST /api/appointments/requests/:requestId/reject - Reject a request (admin only)
router.post('/requests/:requestId/reject', isAuthenticated, isAdmin, async (req, res) => {
  const { requestId } = req.params;
  try {
    const { data: requestCheck, error: checkError } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();
    if (checkError) throw checkError;
    if (!requestCheck) {
      return res.status(404).json({ message: 'Request not found or already processed' });
    }

    const request = requestCheck;

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ pending_action: null })
      .eq('id', request.appointment_id);
    if (updateError) throw updateError;

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    if (requestUpdateError) throw requestUpdateError;

    res.status(200).json({ success: true, message: `${request.action} request rejected successfully` });
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ success: false, message: 'Failed to reject request', error: error.message });
  }
});

// GET /api/appointments/all - Fetch all appointments (including cancelled) for admin
router.get('/all', isAuthenticated, isAdmin, async (req, res) => {
  try {
    console.log('GET /api/appointments/all requested');
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        user_id,
        appointment_date,
        status,
        notes,
        services (name)
      `)
      .order('appointment_date', { ascending: true });

    if (error) throw error;

    const patientIds = [...new Set(appointments.map(app => app.user_id))];
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw patientError;

    console.log('Patients data before decryption:', patients);

    const patientMap = new Map(patients.map(p => [
      p.id,
      {
        first_name: decrypt(p.first_name),
        last_name: decrypt(p.last_name)
      }
    ]));

    const enrichedAppointments = appointments.map(app => ({
      ...app,
      notes: app.notes ? decrypt(app.notes) : null,
      patients: patientMap.get(app.user_id) || { first_name: null, last_name: null }
    }));

    res.status(200).json({ success: true, appointments: enrichedAppointments });
  } catch (error) {
    console.error('Error fetching all appointments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch appointments', error: error.message });
  }
});

// POST /api/appointments/:id/confirm - Confirm an appointment (admin only)
router.post('/:id/confirm', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: appointmentCheck, error: checkError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('status', 'pending')
      .single();
    
    if (checkError) throw checkError;
    if (!appointmentCheck) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appointment not found or not in pending status' 
      });
    }

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ 
        status: 'confirmed',
        pending_action: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({ 
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('appointment_id', id)
      .eq('status', 'pending');

    if (requestUpdateError) console.warn('Error updating request status:', requestUpdateError);

    res.status(200).json({ 
      success: true, 
      message: 'Appointment confirmed successfully' 
    });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to confirm appointment', 
      error: error.message 
    });
  }
});

// POST /api/appointments/:id/reject - Reject an appointment (admin only)
router.post('/:id/reject', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: appointmentCheck, error: checkError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('status', 'pending')
      .single();
    
    if (checkError) throw checkError;
    if (!appointmentCheck) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appointment not found or not in pending status' 
      });
    }

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ 
        status: 'rejected',
        pending_action: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({ 
        status: 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('appointment_id', id)
      .eq('status', 'pending');

    if (requestUpdateError) console.warn('Error updating request status:', requestUpdateError);

    res.status(200).json({ 
      success: true, 
      message: 'Appointment rejected successfully' 
    });
  } catch (error) {
    console.error('Error rejecting appointment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reject appointment', 
      error: error.message 
    });
  }
});

// GET /api/appointments/pending-action - Fetch appointments with pending actions (admin only)
router.get('/pending-action', isAuthenticated, isAdmin, async (req, res) => {
  try {
    console.log('GET /api/appointments/pending-action requested');
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        user_id,
        appointment_date,
        status,
        notes,
        pending_action,
        cancel_reason,
        services (name)
      `)
      .eq('status', 'pending_cancellation') // Updated to match new status
      .order('appointment_date', { ascending: true });

    if (error) throw error;

    const patientIds = [...new Set(appointments.map(app => app.user_id))];
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw patientError;

    console.log('Patients data before decryption:', patients);

    const patientMap = new Map(patients.map(p => [
      p.id,
      {
        first_name: decrypt(p.first_name),
        last_name: decrypt(p.last_name)
      }
    ]));

    const enrichedAppointments = appointments.map(app => ({
      ...app,
      notes: app.notes ? decrypt(app.notes) : null,
      patients: patientMap.get(app.user_id) || { first_name: null, last_name: null }
    }));

    res.status(200).json(enrichedAppointments);
  } catch (error) {
    console.error('Error fetching pending action appointments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending action appointments', error: error.message });
  }
});

// PUT /api/appointments/:id/action - Process a pending action (admin only)
router.put('/:id/action', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const { data: appointmentCheck, error: checkError } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', id)
      .single();
    if (checkError) throw checkError;
    if (!appointmentCheck) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointmentCheck.status !== 'pending_cancellation') {
      return res.status(400).json({ message: 'No pending cancellation for this appointment' });
    }

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (updateError) throw updateError;

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({ 
        status: status === 'cancelled' ? 'approved' : 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('appointment_id', id)
      .eq('status', 'pending');
    if (requestUpdateError) console.warn('Error updating request status:', requestUpdateError);

    if (req.app.get('wss')) {
      console.log(`Broadcasting ${status} action for appointment ${id} via WebSocket`);
      req.app.get('wss').clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'cancel_response',
            requestId: id,
            status: status
          }));
        }
      });
    } else {
      console.warn('WebSocket server not found, cannot broadcast action result');
    }

    res.status(200).json({ success: true, message: `Appointment ${status} successfully` });
  } catch (error) {
    console.error('Error processing appointment action:', error);
    res.status(500).json({ success: false, message: 'Failed to process appointment action', error: error.message });
  }
});

// GET /api/appointments/:id/status - Get appointment status
router.get('/:id/status', isAuthenticated, async (req, res) => {
  console.log(`Received request for appointment status, ID: ${req.params.id}`);
    try {
        const { data: appointment, error } = await supabase
            .from('appointments')
            .select('status')
            .eq('id', req.params.id)
            .eq('patient_id', req.session.userId)
            .single();
        if (error) throw error;
        if (!appointment) 
            return res.status(404).json({ message: 'Appointment not found' });
        res.json({ status: appointment.status });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/appointments/:id/undo-cancel - Undo a cancellation request
router.post('/:id/undo-cancel', isAuthenticated, async (req, res) => {
  try {
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', req.params.id)
      .eq('patient_id', req.session.userId)
      .single();
    if (fetchError) throw fetchError;
    if (!appointment || appointment.status !== 'pending_cancellation') {
      return res.status(400).json({ message: 'No pending cancellation to undo' });
    }

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'pending', cancel_reason: null })
      .eq('id', req.params.id)
      .eq('patient_id', req.session.userId);
    if (error) throw error;

    res.status(200).json({ message: 'Cancellation request undone' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Test encryption/decryption route
router.get('/test-encryption', async (req, res) => {
  try {
    const originalText = 'John Smith';
    const encrypted = encrypt(originalText);
    const decryptedOnce = decrypt(encrypted);
    const decryptedTwice = decrypt(decryptedOnce);
    res.status(200).json({
      original: originalText,
      encrypted: encrypted,
      decryptedOnce: decryptedOnce,
      decryptedTwice: decryptedTwice,
      successOnce: originalText === decryptedOnce,
      successTwice: originalText === decryptedTwice
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;