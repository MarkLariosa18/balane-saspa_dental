const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://postgres:JQd11mEIPFPFRwD2@db.ufdactybxwgxlpaownnl.supabase.co:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
