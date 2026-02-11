const { Pool } = require('pg');
require('dotenv').config();

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

// Create PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon
  },
  max: 20, // Max clients in pool
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 20000, // 20 seconds (important for free tier wake-up)
});

// Test DB connection (without crashing server)
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ Successfully connected to PostgreSQL');
    console.log('Database time:', res.rows[0].now);
    client.release();
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('⚠️ Server will continue running. DB might be sleeping (free tier).');
  }
};

// Run connection test
testConnection();

// Handle unexpected pool errors
pool.on('error', (err) => {
  console.error('❌ Unexpected DB pool error:', err.message);
});

// Helper function for queries
const query = (text, params) => pool.query(text, params);

// Helper function to get a client from the pool
const getClient = () => pool.connect();

// Export pool & helpers
module.exports = {
  pool,
  query,
  getClient,
};
