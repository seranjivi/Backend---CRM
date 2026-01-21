const { pool } = require('../config/db');

class Country {
  static async findAll() {
    const query = `
      SELECT id, name, code, phone_code, is_active, 
             created_at, updated_at
      FROM countries 
      WHERE is_active = true 
      ORDER BY name ASC
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  static async findById(id) {
    const query = 'SELECT * FROM countries WHERE id = $1 AND is_active = true';
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  }

  static async getByRegionId(regionId) {
    const query = `
      SELECT c.id, c.name, c.code, c.phone_code
      FROM countries c
      INNER JOIN regions r ON c.region_id = r.id
      WHERE r.id = $1 AND c.is_active = true
      ORDER BY c.name ASC
    `;
    const { rows } = await pool.query(query, [regionId]);
    return rows;
  }
}

module.exports = Country;
