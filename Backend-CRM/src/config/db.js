const { Pool } = require('pg');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { 
    rejectUnauthorized: false 
  } : false,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  max: parseInt(process.env.DB_MAX_CLIENTS || '20', 10)
});

// Test the database connection with timeout
const testConnection = async () => {
  const client = await pool.connect().catch(err => {
    console.error('❌ Connection pool error:', err.message);
    console.error('Connection details:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      ssl: process.env.DB_SSL === 'true'
    });
    process.exit(1);
  });

  try {
    const res = await client.query('SELECT NOW()');
    console.log('✅ Successfully connected to PostgreSQL database');
    console.log('Database server time:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Database query error:', err.message);
    console.error('Error details:', err);
    process.exit(1);
  } finally {
    client.release();
  }
};

testConnection();

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Function to get a client from the pool
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

// Export the pool and query function for simple queries
const query = (text, params) => pool.query(text, params);

module.exports = {
  query,
  getClient,
  pool,
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false,
  max: process.env.DB_MAX_CLIENTS || 20,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT || 30000,
  connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT || 5000
};