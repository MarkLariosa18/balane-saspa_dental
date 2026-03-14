/**
 * Migration: Create Admin Account
 * Usage:
 *   node create-admin.js
 *   node create-admin.js --username admin --password yourpassword
 *
 * Requires the same .env as the main server (DATABASE_URL or individual DB_* vars).
 */

'use strict';

require('dotenv').config();

const pool     = require('./db');   // ← this line only, no new Pool()
const bcrypt   = require('bcrypt');
const readline = require('readline');


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
    });

    if (hidden && process.stdin.isTTY) {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      let input = '';
      process.stdin.on('data', function handler(ch) {
        ch = ch.toString();
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit();
        } else if (ch === '\u007f') {
          if (input.length > 0) { input = input.slice(0, -1); process.stdout.write('\b \b'); }
        } else {
          input += ch;
          process.stdout.write('*');
        }
      });
    } else {
      rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    }
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) result.username = args[++i];
    if (args[i] === '--password' && args[i + 1]) result.password = args[++i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🦷  Dental Clinic — Create Admin');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const args = parseArgs();

  // ── 1. Ensure admin table exists ────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin (
      id             SERIAL PRIMARY KEY,
      username       VARCHAR(100) NOT NULL UNIQUE,
      password       TEXT         NOT NULL,
      remember_token TEXT,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✔  admin table ready\n');

  // ── 2. Gather credentials ────────────────────────────────────────────────
  let username = args.username;
  let password = args.password;

  if (!username) {
    username = await prompt('Admin username: ');
    if (!username) { console.error('Username cannot be empty.'); process.exit(1); }
  }

  // Reject if username already taken
  const existing = await pool.query('SELECT id FROM admin WHERE username = $1', [username]);
  if (existing.rows.length) {
    console.error(`\n✖  Admin "${username}" already exists. Aborting.\n`);
    await pool.end();
    process.exit(1);
  }

  if (!password) {
    password = await prompt('Password (min 8 chars): ', true);
    if (!password || password.length < 8) {
      console.error('Password must be at least 8 characters.');
      process.exit(1);
    }
    const confirm = await prompt('Confirm password:       ', true);
    if (password !== confirm) {
      console.error('Passwords do not match.');
      process.exit(1);
    }
  } else if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  // ── 3. Hash & insert ────────────────────────────────────────────────────
  const hash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `INSERT INTO admin (username, password)
     VALUES ($1, $2)
     RETURNING id, username, created_at`,
    [username, hash]
  );

  const admin = result.rows[0];

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✔  Admin account created');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ID         : ${admin.id}`);
  console.log(`  Username   : ${admin.username}`);
  console.log(`  Created at : ${admin.created_at}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await pool.end();
}

main().catch((err) => {
  console.error('\n✖  Error:', err.message);
  pool.end().finally(() => process.exit(1));
});