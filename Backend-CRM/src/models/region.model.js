const pool = require('../config/db');

/**
 * Region Model
 * Represents geographical regions in the system
 */
const Region = {
  // Get all regions with their countries
  async getAllWithCountries() {
    try {
      const query = `
        SELECT 
          r.id as region_id, 
          r.name as region_name, 
          r.code as region_code,
          c.id as country_id,
          c.name as country_name,
          c.code as country_code
        FROM regions r
        LEFT JOIN countries c ON r.id = c.region_id
        WHERE r.is_active = true AND (c.is_active = true OR c.id IS NULL)
        ORDER BY r.name, c.name
      `;
      const result = await pool.query(query);
      
      // Group countries by region
      const regionsMap = new Map();
      
      result.rows.forEach(row => {
        if (!regionsMap.has(row.region_id)) {
          regionsMap.set(row.region_id, {
            id: row.region_id,
            name: row.region_name,
            code: row.region_code,
            countries: []
          });
        }
        
        if (row.country_id) {
          regionsMap.get(row.region_id).countries.push({
            id: row.country_id,
            name: row.country_name,
            code: row.country_code
          });
        }
      });
      
      return Array.from(regionsMap.values());
    } catch (error) {
      console.error('Error fetching regions with countries:', error);
      throw error;
    }
  },

  // Get all regions
  async getAll() {
    try {
      const result = await pool.query('SELECT * FROM regions WHERE is_active = true ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('Error fetching regions:', error);
      throw error;
    }
  },

  // Get regions by country ID
  async getByCountryId(countryId) {
    try {
      const query = `
        SELECT id, name, code, description 
        FROM regions 
        WHERE country_id = $1 AND is_active = true 
        ORDER BY name
      `;
      const result = await pool.query(query, [countryId]);
      return result.rows;
    } catch (error) {
      console.error(`Error fetching regions for country ${countryId}:`, error);
      throw error;
    }
  },

  // Get region by ID
  async getById(id) {
    try {
      const result = await pool.query('SELECT * FROM regions WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error) {
      console.error(`Error fetching region with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new region
  async create({ name, code, description }) {
    try {
      const result = await pool.query(
        'INSERT INTO regions (name, code, description) VALUES ($1, $2, $3) RETURNING *',
        [name, code, description]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating region:', error);
      throw error;
    }
  },

  // Update a region
  async update(id, { name, code, description }) {
    try {
      const result = await pool.query(
        'UPDATE regions SET name = $1, code = $2, description = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
        [name, code, description, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating region with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a region
  async delete(id) {
    try {
      const result = await pool.query('DELETE FROM regions WHERE id = $1 RETURNING *', [id]);
      return result.rows[0];
    } catch (error) {
      console.error(`Error deleting region with ID ${id}:`, error);
      throw error;
    }
  }
};

module.exports = Region;
