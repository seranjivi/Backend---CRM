// init-db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const initDb = async () => {
  const client = await pool.connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create regions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS regions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create user_regions join table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_regions (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        region_id INTEGER REFERENCES regions(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, region_id)
      );
    `);

    // Create admin user (password: admin123)
    await client.query(`
      INSERT INTO users (full_name, email, password_hash, role, status)
      VALUES ('Admin User', 'admin@example.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'active')
      ON CONFLICT (email) DO NOTHING;
    `);

    // Insert some sample regions
    await client.query(`
      INSERT INTO regions (name)
      VALUES 
        ('North Region'),
        ('South Region'),
        ('East Region'),
        ('West Region')
      ON CONFLICT (name) DO NOTHING;
    `);

    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    client.release();
    await pool.end();
  }
};

initDb();