require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const winston = require('winston');
// Optional: Use punycode.js if needed (uncomment after installing)
// const punycode = require('punycode/');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  logger.error('Missing Supabase credentials', { supabaseUrl, supabaseKey });
  throw new Error('SUPABASE_URL and SUPABASE_KEY are required');
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Encryption setup
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
if (!process.env.ENCRYPTION_KEY || encryptionKey.length !== 32) {
  logger.error('Invalid or missing ENCRYPTION_KEY', { keyLength: encryptionKey.length });
  throw new Error('ENCRYPTION_KEY must be a 32-byte hex string');
}

function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

// Generate 100 records for users (IDs 34–133)
const generateUsers = () => {
  const users = [];
  for (let i = 1; i <= 100; i++) {
    const id = 33 + i; // IDs 34–133
    const username = `user${id.toString().padStart(3, '0')}`;
    const password = `$2b$10$abc${id}xyz7890123456789abcdef0123456789abcdef0123456`;
    const created_at = new Date(`2025-05-08T08:00:00Z`).getTime() + (i - 1) * 15 * 60 * 1000;
    const remember_token = id % 2 === 0 ? `token${id.toString().padStart(3, '0')}abcdef1234567890abcdef1234567890abcdef1234567890` : null;
    users.push({
      id,
      username,
      password,
      created_at: new Date(created_at).toISOString(),
      remember_token,
      role: 'patient',
    });
  }
  logger.info('Generated users', { count: users.length, firstId: users[0]?.id, lastId: users[users.length - 1]?.id });
  return users;
};

// Generate 100 records for patients (IDs 34–133)
const generatePatients = () => {
  const patients = [];
  for (let i = 1; i <= 100; i++) {
    const id = 33 + i; // IDs 34–133
    const baseDate = new Date('1985-06-01');
    baseDate.setDate(baseDate.getDate() + (i - 1));
    const effectiveDate = new Date(`2025-05-08T08:00:00Z`).getTime() + (i - 1) * 15 * 60 * 1000;
    patients.push({
      id,
      last_name: encrypt(`LastName${id}`),
      first_name: encrypt(`FirstName${id}`),
      middle_name: id % 2 === 0 ? null : encrypt(`MiddleName${id}`),
      birthdate: encrypt(baseDate.toISOString().split('T')[0]),
      sex: id % 2 === 0 ? 'F' : 'M',
      nickname: id % 2 === 0 ? null : `nick${id.toString().padStart(3, '0')}`,
      religion: id % 2 === 0 ? encrypt(`Religion${id}`) : null,
      nationality: encrypt(`Nationality${id}`),
      home_address: id % 2 === 0 ? `home${id.toString().padStart(3, '0')}` : null,
      home_no: id % 2 === 0 ? `home_no${id.toString().padStart(3, '0')}` : null,
      occupation: id % 2 === 0 ? `occupation${id.toString().padStart(3, '0')}` : null,
      office_no: id % 2 === 0 ? `office${id.toString().padStart(3, '0')}` : null,
      dental_insurance: id % 2 === 0 ? `insurance${id.toString().padStart(3, '0')}` : null,
      fax_no: id % 2 === 0 ? `fax${id.toString().padStart(3, '0')}` : null,
      effective_date: new Date(effectiveDate).toISOString(),
      mobile_no: encrypt(`1234567890${id.toString().padStart(2, '0')}`),
      email: encrypt(`email${id}@example.com`),
    });
  }
  logger.info('Generated patients', { count: patients.length, firstId: patients[0]?.id, lastId: patients[patients.length - 1]?.id });
  return patients;
};

// Generate 100 records for appointments (IDs 34–133)
const generateAppointments = () => {
  const appointments = [];
  try {
    for (let i = 1; i <= 100; i++) {
      const id = 33 + i; // IDs 34–133
      const user_id = id; // Matches users.id
      const baseAppointmentDate = new Date('2025-05-20T10:00:00Z');
      baseAppointmentDate.setDate(baseAppointmentDate.getDate() + (i - 1));
      const created_at = new Date(`2025-05-08T08:00:00Z`).getTime() + (i - 1) * 15 * 60 * 1000;
      const status = ['confirmed', 'completed', 'cancelled'][i % 3];
      const service_id = 32 + ((i - 1) % 20); // Cycle through 32–51
      appointments.push({
        id,
        user_id,
        appointment_date: baseAppointmentDate.toISOString(),
        status,
        notes: i % 3 === 0 ? `Notes for appointment ${id}` : null,
        created_at: new Date(created_at).toISOString(),
        rescheduled_at: i % 10 === 0 ? new Date(created_at + 24 * 60 * 60 * 1000).toISOString() : null,
        service_id,
        pending_action: null,
        updated_at: status === 'completed' ? new Date(baseAppointmentDate.getTime() + 30 * 60 * 1000).toISOString() : new Date(created_at).toISOString(),
        cancel_reason: status === 'cancelled' ? encrypt(`Cancel reason ${id}`) : null,
        reject_reason: status === 'completed' && id % 2 === 0 ? encrypt(`Reject reason ${id}`) : null,
      });
    }
    logger.info('Generated appointments', { count: appointments.length, firstId: appointments[0]?.id, lastId: appointments[appointments.length - 1]?.id, serviceIds: [...new Set(appointments.map(a => a.service_id))] });
  } catch (error) {
    logger.error('Error generating appointments:', { error: error.message, stack: error.stack });
    throw error;
  }
  return appointments;
};

// Function to insert data into Supabase
async function insertData() {
  try {
    // Optional: Delete existing records to avoid conflicts
    logger.info('Deleting existing records for IDs 34–133');
    await supabase.from('appointments').delete().in('id', Array.from({length: 100}, (_, i) => 34 + i));
    await supabase.from('patients').delete().in('id', Array.from({length: 100}, (_, i) => 34 + i));
    await supabase.from('users').delete().in('id', Array.from({length: 100}, (_, i) => 34 + i));
    logger.info('Existing records deleted');

    const users = generateUsers();
    const patients = generatePatients();
    const appointments = generateAppointments();

    // Insert users
    logger.info('Inserting users');
    const { error: usersError } = await supabase.from('users').insert(users);
    if (usersError) {
      logger.error('Error inserting users:', { error: usersError });
      throw usersError;
    }
    logger.info('Successfully inserted users', { count: users.length });

    // Insert patients
    logger.info('Inserting patients');
    const { error: patientsError } = await supabase.from('patients').insert(patients);
    if (patientsError) {
      logger.error('Error inserting patients:', { error: patientsError });
      throw patientsError;
    }
    logger.info('Successfully inserted patients', { count: patients.length });

    // Insert appointments
    logger.info('Inserting appointments');
    const { error: appointmentsError } = await supabase.from('appointments').insert(appointments);
    if (appointmentsError) {
      logger.error('Error inserting appointments:', { error: appointmentsError });
      throw appointmentsError;
    }
    logger.info('Successfully inserted appointments', { count: appointments.length });
  } catch (error) {
    logger.error('Error during data insertion:', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Run the insertion
insertData();


/*
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Encryption config
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recommended for GCM
const AUTH_TAG_LENGTH = 16;

if (!supabaseUrl || !supabaseKey || !ENCRYPTION_KEY) {
  console.error('Missing required environment variables');
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
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Store iv, authTag, and ciphertext together: iv:tag:cipher
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function migratePatientData() {
  try {
    const { data: patients, error } = await supabase
      .from('patients')
      .select('*');
    
    if (error) throw error;

    if (!patients || patients.length === 0) {
      console.log('No patients found to migrate');
      return;
    }

    for (const patient of patients) {
      const encryptedData = {
        last_name: encrypt(patient.last_name),
        first_name: encrypt(patient.first_name),
        middle_name: patient.middle_name ? encrypt(patient.middle_name) : null,
        birthdate: encrypt(patient.birthdate),
        sex: patient.sex,
        nickname: patient.nickname ? encrypt(patient.nickname) : null,
        religion: patient.religion ? encrypt(patient.religion) : null,
        nationality: patient.nationality ? encrypt(patient.nationality) : null,
        home_address: encrypt(patient.home_address),
        home_no: patient.home_no ? encrypt(patient.home_no) : null,
        occupation: patient.occupation ? encrypt(patient.occupation) : null,
        office_no: patient.office_no ? encrypt(patient.office_no) : null,
        dental_insurance: patient.dental_insurance ? encrypt(patient.dental_insurance) : null,
        fax_no: patient.fax_no ? encrypt(patient.fax_no) : null,
        mobile_no: encrypt(patient.mobile_no),
        email: encrypt(patient.email)
      };

      const { error: updateError } = await supabase
        .from('patients')
        .update(encryptedData)
        .eq('id', patient.id);

      if (updateError) {
        console.error(`Failed to update patient ${patient.id}:`, updateError);
      } else {
        console.log(`Successfully updated patient ${patient.id}`);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migratePatientData();
*/


/*const bcrypt = require('bcrypt');

async function hashPassword(plainPassword) {
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  console.log(`Plain: ${plainPassword} -> Hashed: ${hashedPassword}`);
  return hashedPassword;
}

// Replace with your admin passwords
hashPassword('doctor').then(console.log); */
