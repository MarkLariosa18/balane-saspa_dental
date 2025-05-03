require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Encryption setup
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

if (!supabaseUrl || !supabaseKey || !ENCRYPTION_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Verify encryption key length (32 bytes = 64 hex characters)
const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
if (keyBuffer.length !== 32) {
  console.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes (64 hex chars), got ${keyBuffer.length} bytes`);
  process.exit(1);
}

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

async function migratePatientData() {
  try {
    // Fetch all patients
    const { data: patients, error } = await supabase
      .from('patients')
      .select('*');
    
    if (error) throw error;

    if (!patients || patients.length === 0) {
      console.log('No patients found to migrate');
      return;
    }

    // Encrypt all fields except sex for each patient
    for (const patient of patients) {
      const encryptedData = {
        last_name: encrypt(patient.last_name),
        first_name: encrypt(patient.first_name),
        middle_name: patient.middle_name ? encrypt(patient.middle_name) : null,
        birthdate: encrypt(patient.birthdate),
        sex: patient.sex, // Keep unencrypted
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

      // Update the patient record
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



/*const bcrypt = require('bcrypt');

async function hashPassword(plainPassword) {
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  console.log(`Plain: ${plainPassword} -> Hashed: ${hashedPassword}`);
  return hashedPassword;
}

// Replace with your admin passwords
hashPassword('doctor').then(console.log); */
