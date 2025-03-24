const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { isAuthenticated } = require('../middleware/auth');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

if (!ENCRYPTION_KEY) {
  console.error('Missing ENCRYPTION_KEY in environment variables');
  process.exit(1);
}

const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
if (keyBuffer.length !== 32) {
  console.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes (64 hex chars), got ${keyBuffer.length} bytes`);
  process.exit(1);
}

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text) {
  if (!text) return null;
  const [ivText, encryptedText] = text.split(':');
  if (!ivText || !encryptedText) {
    console.warn(`Data appears unencrypted or invalid format: "${text}". Returning as-is.`);
    return text; // Return unencrypted text if no colon is found
  }
  try {
    console.log(`Attempting to decrypt (first pass): "${text}"`); // Debug log
    const iv = Buffer.from(ivText, 'hex');
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
    }
    const encrypted = Buffer.from(encryptedText, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    let decryptedString = decrypted.toString('utf8');

    // If the result still looks encrypted (contains a colon), attempt a second decryption
    if (decryptedString.includes(':')) {
      console.log(`First decryption produced encrypted output: "${decryptedString}". Attempting second pass.`);
      const [secondIvText, secondEncryptedText] = decryptedString.split(':');
      const secondIv = Buffer.from(secondIvText, 'hex');
      const secondEncrypted = Buffer.from(secondEncryptedText, 'hex');
      const secondDecipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, secondIv);
      let secondDecrypted = secondDecipher.update(secondEncrypted);
      secondDecrypted = Buffer.concat([secondDecrypted, secondDecipher.final()]);
      decryptedString = secondDecrypted.toString('utf8');

      // Validate the second decryption output
      if (!decryptedString || decryptedString.includes(':') || /[^ -~]/.test(decryptedString)) {
        console.warn(`Second decryption produced invalid output: "${decryptedString}". Returning original: "${text}"`);
        return text; // Fallback to original if still invalid
      }
      console.log(`Successfully decrypted (after second pass): "${text}" -> "${decryptedString}"`);
      return decryptedString;
    }

    // Validate single decryption output
    if (!decryptedString || /[^ -~]/.test(decryptedString)) {
      console.warn(`Single decryption produced invalid output: "${decryptedString}". Returning original: "${text}"`);
      return text; // Fallback to original if invalid
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
    return text; // Return original text on decryption failure
  }
}

// Username availability check endpoint (public)
router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== 'string') {
      console.log('Invalid username parameter:', username);
      return res.status(400).json({ error: 'invalid_request', message: 'Username is required and must be a string' });
    }
    console.log('Checking username availability:', username);
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', username);
    if (error) throw error;
    const exists = data && data.length > 0;
    console.log('Username exists:', exists);
    res.status(200).json({ exists });
  } catch (error) {
    console.error('Error in check-username:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error', details: error.message });
  }
});

// Full patient registration endpoint (public)
router.post('/', async (req, res) => {
  try {
    console.log('Received POST /patients request:', req.body);
    const { 
      username, 
      password, 
      last_name, 
      first_name, 
      middle_name, 
      birthdate, 
      sex, 
      nickname, 
      religion, 
      nationality, 
      home_address, 
      home_no, 
      occupation, 
      office_no, 
      dental_insurance, 
      fax_no, 
      mobile_no, 
      email
    } = req.body;
    
    if (!username || !password || !last_name || !first_name || !birthdate || !sex || !home_address || !mobile_no || !email) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'missing_fields', message: 'Required fields are missing' });
    }
    
    if (typeof username !== 'string' || 
        typeof password !== 'string' || 
        typeof birthdate !== 'string' || 
        !['M', 'F'].includes(sex) || 
        typeof email !== 'string' || 
        !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      console.log('Invalid data types or values');
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid data types or values' });
    }

    console.log('Checking if username exists...');
    const { data: usernameCheck, error: usernameCheckError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username);
    if (usernameCheckError) throw usernameCheckError;

    if (usernameCheck && usernameCheck.length > 0) {
      console.log('Username match found:', username);
      return res.status(400).json({ error: 'username_exists', message: 'Username already exists' });
    }
    console.log('No username match found, proceeding with email check');

    console.log('Checking if email exists...');
    const emailToCheck = email.toLowerCase();
    console.log('Email to check:', emailToCheck);
    const { data: emailCheck, error: emailCheckError } = await supabase
      .from('patients')
      .select('email');
    if (emailCheckError) throw emailCheckError;

    console.log('Fetched emails from database:', emailCheck);
    if (!emailCheck || emailCheck.length === 0) {
      console.log('No existing emails in database');
    } else {
      for (const patient of emailCheck) {
        if (patient.email) {
          const decryptedEmail = decrypt(patient.email);
          console.log('Comparing:', { stored: decryptedEmail, input: emailToCheck });
          if (decryptedEmail === emailToCheck) {
            console.log('Email match found:', emailToCheck);
            return res.status(400).json({ error: 'email_exists', message: 'Email already exists' });
          }
        } else {
          console.log('Skipping patient with null email');
        }
      }
    }
    console.log('No email match found, proceeding with registration');
    
    console.log('Hashing password...');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    console.log('Encrypting patient data (excluding sex)...');
    const encryptedData = {
      last_name: encrypt(last_name),
      first_name: encrypt(first_name),
      middle_name: middle_name ? encrypt(middle_name) : null,
      birthdate: encrypt(birthdate),
      sex: sex,
      nickname: nickname ? encrypt(nickname) : null,
      religion: religion ? encrypt(religion) : null,
      nationality: nationality ? encrypt(nationality) : null,
      home_address: encrypt(home_address),
      home_no: home_no ? encrypt(home_no) : null,
      occupation: occupation ? encrypt(occupation) : null,
      office_no: office_no ? encrypt(office_no) : null,
      dental_insurance: dental_insurance ? encrypt(dental_insurance) : null,
      fax_no: fax_no ? encrypt(fax_no) : null,
      mobile_no: encrypt(mobile_no),
      email: encrypt(emailToCheck)
    };
    
    console.log('Inserting user into users table...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{ 
        username, 
        password: hashedPassword,
        created_at: new Date().toISOString()
      }])
      .select('id')
      .single();
      
    if (userError) {
      console.error('User insertion error:', userError);
      if (userError.code === '23505') {
        return res.status(400).json({ error: 'username_exists', message: 'Username already exists' });
      }
      throw userError;
    }
    
    console.log('User inserted successfully, user_id:', userData.id);
    
    console.log('Inserting patient into patients table...');
    const { data: patientData, error: patientError } = await supabase
      .from('patients')
      .insert([{
        id: userData.id,
        last_name: encryptedData.last_name,
        first_name: encryptedData.first_name,
        middle_name: encryptedData.middle_name,
        birthdate: encryptedData.birthdate,
        sex: encryptedData.sex,
        nickname: encryptedData.nickname,
        religion: encryptedData.religion,
        nationality: encryptedData.nationality,
        home_address: encryptedData.home_address,
        home_no: encryptedData.home_no,
        occupation: encryptedData.occupation,
        office_no: encryptedData.office_no,
        dental_insurance: encryptedData.dental_insurance,
        fax_no: encryptedData.fax_no,
        mobile_no: encryptedData.mobile_no,
        email: encryptedData.email,
        effective_date: new Date().toISOString()
      }])
      .select('id')
      .single();
      
    if (patientError) {
      console.error('Patient insertion error:', patientError);
      console.log('Rolling back: Deleting user with id:', userData.id);
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', userData.id);
      if (deleteError) {
        console.error('Failed to delete user during rollback:', deleteError);
      }
      if (patientError.code === '23505') {
        return res.status(400).json({ error: 'email_exists', message: 'Email already exists (database constraint)' });
      }
      throw patientError;
    }
    
    console.log('Patient inserted successfully, patient_id:', patientData.id);
    
    res.status(201).json({ 
      success: true,
      message: 'Patient registered successfully',
      patient_id: patientData.id
    });
    
  } catch (error) {
    console.error('Error registering patient:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to register patient', details: error.message });
  }
});

// Fetch profile data (protected)
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    console.log(`Fetching profile for user_id: ${userId}`);

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }

    if (!data) {
      console.log(`No patient found for user_id: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'Patient profile not found' });
    }

    // Decrypt encrypted fields and construct response
    const profileData = {
      full_name: `${decrypt(data.first_name)} ${decrypt(data.last_name)}`,
      email: decrypt(data.email),
      phone: decrypt(data.mobile_no),
      dob: decrypt(data.birthdate),
      gender: data.sex === 'M' ? 'Male' : data.sex === 'F' ? 'Female' : '',
      address: decrypt(data.home_address),
      religion: decrypt(data.religion) || 'N/A',
      nationality: decrypt(data.nationality) || 'N/A',
      home_number: decrypt(data.home_no) || 'N/A',
      blood_type: 'N/A', // Not in schema, static default
      allergies: 'None', // Not in schema, static default
      medical_conditions: 'None', // Not in schema, static default
      emergency_contact: 'N/A' // Not in schema, static default
    };

    console.log('Profile data retrieved successfully:', profileData);
    res.status(200).json(profileData);
  } catch (error) {
    console.error('Error in /profile:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch profile', details: error.message });
  }
});

// Update profile (protected)
router.put('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const {
      fullName,
      dob,
      gender,
      address,
      religion,
      nationality,
      homeNumber,
      phone,
      email
    } = req.body;

    // Split fullName into first_name and last_name (assuming space-separated)
    const [first_name, ...lastNameParts] = fullName.split(' ');
    const last_name = lastNameParts.join(' ');

    // Encrypt updated fields
    const encryptedData = {
      first_name: encrypt(first_name),
      last_name: encrypt(last_name),
      birthdate: encrypt(dob),
      sex: gender === 'male' ? 'M' : gender === 'female' ? 'F' : 'O',
      home_address: encrypt(address),
      religion: religion && religion !== 'N/A' ? encrypt(religion) : null,
      nationality: nationality && nationality !== 'N/A' ? encrypt(nationality) : null,
      home_no: homeNumber && homeNumber !== 'N/A' ? encrypt(homeNumber) : null,
      mobile_no: encrypt(phone),
      email: encrypt(email)
    };

    const { data, error } = await supabase
      .from('patients')
      .update(encryptedData)
      .eq('id', userId)
      .select('id')
      .single();

    if (error) throw error;

    console.log(`Profile updated for user_id: ${userId}`);
    res.status(200).json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to update profile', details: error.message });
  }
});

// Update settings (protected, placeholder)
router.put('/settings', isAuthenticated, async (req, res) => {
  // Placeholder: Add settings table or logic if needed
  try {
    console.log('Settings update received:', req.body);
    // Example: Store settings in a separate table or ignore for now
    res.status(200).json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to save settings', details: error.message });
  }
});

// Change password (protected)
router.put('/change-password', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'missing_fields', message: 'Current and new passwords are required' });
    }

    // Fetch current password
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    if (!userData) {
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'invalid_password', message: 'Current password is incorrect' });
    }

    // Validate new password (enhanced password policy)
    const passwordErrors = [];
    if (newPassword.length < 8) passwordErrors.push('Password must be at least 8 characters long');
    if (!/[0-9]/.test(newPassword)) passwordErrors.push('Password must include at least one number');
    if (!/[!@#$%^&*]/.test(newPassword)) passwordErrors.push('Password must include at least one special character');
    if (!/[A-Z]/.test(newPassword)) passwordErrors.push('Password must include at least one uppercase letter');
    if (!/[a-z]/.test(newPassword)) passwordErrors.push('Password must include at least one lowercase letter');
    if (await bcrypt.compare(newPassword, userData.password)) {
      passwordErrors.push('New password must not be the same as the current password');
    }

    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: 'invalid_password',
        message: 'Password does not meet security requirements',
        details: passwordErrors,
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', userId);

    if (updateError) throw updateError;

    console.log(`Password updated for user_id: ${userId}`);

    // Invalidate session after password change
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        // Proceed with response even if session destruction fails
      }
      res.status(200).json({ success: true, message: 'Password changed successfully. Please log in again.' });
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to change password', details: error.message });
  }
});

module.exports = router;