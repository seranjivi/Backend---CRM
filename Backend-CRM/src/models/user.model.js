const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Number of salt rounds for password hashing
const SALT_ROUNDS = 10;

/**
 * User Model
 * Handles all database operations for users
 */
const User = {
  // Get all users with their roles
  async getAll() {
    try {
      const query = `
        SELECT 
          u.*, 
          r.name as role_name,
          r.permissions as role_permissions,
          array_agg(reg.name) as region_names,
          array_agg(ur.region_id) as region_ids
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN user_regions ur ON u.id = ur.user_id
        LEFT JOIN regions reg ON ur.region_id = reg.id
        GROUP BY u.id, r.id
        ORDER BY u.created_at DESC
      `;
      const result = await pool.query(query);
      return result.rows.map(user => ({
        ...user,
        region_ids: user.region_ids.filter(Boolean), // Remove null values
        region_names: user.region_names.filter(Boolean) // Remove null values
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  // Get user by ID with role and regions
  async getById(id) {
    try {
      const query = `
        SELECT 
          u.*, 
          r.name as role_name,
          r.permissions as role_permissions,
          array_agg(reg.name) as region_names,
          array_agg(ur.region_id) as region_ids
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN user_regions ur ON u.id = ur.user_id
        LEFT JOIN regions reg ON ur.region_id = reg.id
        WHERE u.id = $1
        GROUP BY u.id, r.id
      `;
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) return null;
      
      const user = result.rows[0];
      return {
        ...user,
        region_ids: user.region_ids.filter(Boolean), // Remove null values
        region_names: user.region_names.filter(Boolean) // Remove null values
      };
    } catch (error) {
      console.error(`Error fetching user with ID ${id}:`, error);
      throw error;
    }
  },

  // Get user by email
  async getByEmail(email) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error fetching user with email ${email}:`, error);
      throw error;
    }
  },

  // Create a new user
  async create({ fullName, email, password, roleId, status = 'active', regionIds = [] }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      
      // Insert user
      const userQuery = `
        INSERT INTO users (full_name, email, password, role_id, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const userResult = await client.query(userQuery, [
        fullName,
        email,
        hashedPassword,
        roleId,
        status
      ]);
      
      const user = userResult.rows[0];
      
      // Add user-region relationships if regionIds are provided
      if (regionIds && regionIds.length > 0) {
        const regionValues = regionIds.map(regionId => `('${user.id}', '${regionId}')`).join(',');
        await client.query(`
          INSERT INTO user_regions (user_id, region_id)
          VALUES ${regionValues}
        `);
      }
      
      await client.query('COMMIT');
      
      // Return the created user with their role and regions
      return this.getById(user.id);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating user:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Update a user
  async update(id, { fullName, email, roleId, status, regionIds }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update user
      const updateFields = [];
      const values = [id];
      let paramCount = 1;
      
      if (fullName) {
        paramCount++;
        updateFields.push(`full_name = $${paramCount}`);
        values.push(fullName);
      }
      
      if (email) {
        paramCount++;
        updateFields.push(`email = $${paramCount}`);
        values.push(email);
      }
      
      if (roleId) {
        paramCount++;
        updateFields.push(`role_id = $${paramCount}`);
        values.push(roleId);
      }
      
      if (status) {
        paramCount++;
        updateFields.push(`status = $${paramCount}`);
        values.push(status);
      }
      
      // Only update if there are fields to update
      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        const query = `
          UPDATE users 
          SET ${updateFields.join(', ')}
          WHERE id = $1
          RETURNING *
        `;
        await client.query(query, values);
      }
      
      // Update user-region relationships if regionIds are provided
      if (Array.isArray(regionIds)) {
        // First, delete existing user-region relationships
        await client.query('DELETE FROM user_regions WHERE user_id = $1', [id]);
        
        // Then, insert the new ones if there are any
        if (regionIds.length > 0) {
          const regionValues = regionIds.map(regionId => `('${id}', '${regionId}')`).join(',');
          await client.query(`
            INSERT INTO user_regions (user_id, region_id)
            VALUES ${regionValues}
          `);
        }
      }
      
      await client.query('COMMIT');
      
      // Return the updated user with their role and regions
      return this.getById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Error updating user with ID ${id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Delete a user
  async delete(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // First, delete user-region relationships
      await client.query('DELETE FROM user_regions WHERE user_id = $1', [id]);
      
      // Then, delete the user
      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Error deleting user with ID ${id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Verify user password
  async verifyPassword(user, password) {
    try {
      return await bcrypt.compare(password, user.password);
    } catch (error) {
      console.error('Error verifying password:', error);
      throw error;
    }
  },

  // Update user password
  async updatePassword(id, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      const result = await pool.query(
        'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [hashedPassword, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating password for user with ID ${id}:`, error);
      throw error;
    }
  },

  // Update user status
  async updateStatus(id, status) {
    try {
      const result = await pool.query(
        'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating status for user with ID ${id}:`, error);
      throw error;
    }
  },

  // Get users by role
  async getByRole(roleId) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE role_id = $1', [roleId]);
      return result.rows;
    } catch (error) {
      console.error(`Error fetching users with role ID ${roleId}:`, error);
      throw error;
    }
  },

  // Get users by region
  async getByRegion(regionId) {
    try {
      const query = `
        SELECT u.* 
        FROM users u
        JOIN user_regions ur ON u.id = ur.user_id
        WHERE ur.region_id = $1
      `;
      const result = await pool.query(query, [regionId]);
      return result.rows;
    } catch (error) {
      console.error(`Error fetching users in region ID ${regionId}:`, error);
      throw error;
    }
  }
};

module.exports = User;
