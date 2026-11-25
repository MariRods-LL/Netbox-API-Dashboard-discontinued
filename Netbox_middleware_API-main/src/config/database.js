require("dotenv").config();
const { Pool } = require("pg");
const { getDatabaseConfig } = require("./appConfig");

let currentPool;
let currentSignature;

function getSignature(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password,
  });
}

function getPool() {
  const config = getDatabaseConfig();
  const signature = getSignature(config);

  if (!currentPool || currentSignature !== signature) {
    if (currentPool) {
      currentPool.end().catch((err) => console.error(err));
    }

    currentPool = new Pool({
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
    });
    currentSignature = signature;
  }

  return currentPool;
}

const fs = require('fs');
const path = require('path');

async function ensureDatabaseInitialized(schemaFilePath) {
  const config = getDatabaseConfig();
  const dbName = config.name || 'netbox_history';

  // Connect to the default 'postgres' database to create the target DB if it does not exist
  const adminPool = new Pool({
    host: config.host,
    port: config.port,
    database: 'postgres',
    user: config.user,
    password: config.password,
  });

  try {
    const { rows } = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rows || rows.length === 0) {
      console.log(`Database ${dbName} not found. Creating...`);
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database ${dbName} created.`);
    }
  } catch (err) {
    console.warn('Could not verify/create database:', err.message);
  } finally {
    await adminPool.end().catch(() => {});
  }

  // Apply schema SQL if provided
  const resolvedSchemaPath = schemaFilePath || path.resolve(__dirname, '..', '..', 'modelSQL_NetboxHistory.sql');

  if (!fs.existsSync(resolvedSchemaPath)) {
    console.warn(`Schema file not found at ${resolvedSchemaPath}. Skipping schema initialization.`);
    return;
  }

  const content = fs.readFileSync(resolvedSchemaPath, 'utf8');

  // Extract SQL statements included inside backticks in the provided SQL file
  const regex = /`([^`]+)`/g;
  let match;
  const statements = [];

  while ((match = regex.exec(content)) !== null) {
    const stmt = match[1].trim();
    if (stmt) statements.push(stmt.replace(/,$/, ''));
  }

  // Fallback: if no backticks found, try splitting by double newlines and run any statement that starts with CREATE
  if (statements.length === 0) {
    content
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .forEach((s) => {
        if (/^CREATE\s+/i.test(s)) {
          statements.push(s);
        }
      });
  }

  if (!statements.length) {
    console.warn('No SQL statements found in schema file.');
    return;
  }

  const targetPool = new Pool({
    host: config.host,
    port: config.port,
    database: dbName,
    user: config.user,
    password: config.password,
  });

  try {
    for (const stmt of statements) {
      try {
        await targetPool.query(stmt);
      } catch (err) {
        // Log and continue — CREATE TABLE IF NOT EXISTS is idempotent, but other errors should not prevent startup
        console.warn('Failed to run statement (continuing):', err.message);
      }
    }

    console.log('Schema initialization complete.');

    // Ensure an admin user exists (only when users table is present)
    try {
      const res = await targetPool.query("SELECT to_regclass('public.users') as exists");
      if (res && res.rows && res.rows[0] && res.rows[0].exists) {
        const usersCheck = await targetPool.query('SELECT id FROM users WHERE username = $1', ['admin']);
        if (!usersCheck.rows.length) {
          // Create the admin user with the default password 'admin' if no user exists
          const bcrypt = require('bcryptjs');
          const hash = bcrypt.hashSync('admin', 10);
          await targetPool.query(
            `INSERT INTO users (username, password_hash, role, active, created_at)
             VALUES ($1, $2, $3, TRUE, NOW())`,
            ['admin', hash, 'admin'],
          );
          console.log('Default admin user created (username=admin, password=admin).');
        } else {
          console.log('Admin user already exists.');
        }
      } else {
        console.log('Users table not found — skipping admin creation.');
      }
    } catch (err) {
      console.warn('Could not ensure admin user:', err.message);
    }
  } finally {
    await targetPool.end().catch(() => {});
  }
}


module.exports = {
  query(...args) {
    return getPool().query(...args);
  },
  getPool,
  ensureDatabaseInitialized,
};
