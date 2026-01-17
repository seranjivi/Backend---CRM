/**
 * Role Model
 * Represents user roles in the system
 */
const Role = (fastify) => ({
  // Get the database client
  get db() {
    return fastify.pg;
  },
  
  // Get the database pool
  get pool() {
    return fastify.pg;
  },
  // Get all roles
  async getAll() {
    try {
      const result = await this.db.query('SELECT * FROM roles ORDER BY id');
      return result.rows;
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  },

  // Get role by ID
  async getById(id) {
    try {
      const result = await this.db.query('SELECT * FROM roles WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error) {
      console.error(`Error fetching role with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new role
  async create({ name, description, permissions }) {
    try {
      const result = await this.db.query(
        'INSERT INTO roles (name, description, permissions) VALUES ($1, $2, $3) RETURNING *',
        [name, description, permissions]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating role:', error);
      throw error;
    }
  },

  // Update a role
  async update(id, { name, description, permissions }) {
    try {
      const result = await this.db.query(
        'UPDATE roles SET name = $1, description = $2, permissions = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
        [name, description, permissions, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating role with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete a role
  async delete(id) {
    try {
      const result = await this.db.query('DELETE FROM roles WHERE id = $1 RETURNING *', [id]);
      return result.rows[0];
    } catch (error) {
      console.error(`Error deleting role with ID ${id}:`, error);
      throw error;
    }
  }
});

module.exports = Role;
