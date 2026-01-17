// backend/src/routes/users.js
const { register } = require('../controllers/userController');
const { createUserSchema } = require('../schemas/user.schema');

module.exports = async function (fastify, options) {
  // Get all users (admin only)
  fastify.get('/', { 
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])] 
  }, async (request, reply) => {
    try {
      const { rows } = await fastify.pg.query(`
        SELECT 
          u.id, 
          u.full_name, 
          u.email, 
          r.name as role, 
          u.status, 
          u.created_at, 
          u.updated_at,
          COALESCE(
            (
              SELECT json_agg(reg.name) 
              FROM user_regions ur2
              JOIN regions reg ON ur2.region_id = reg.id
              WHERE ur2.user_id = u.id
            ), 
            '[]'::json
          ) as regions
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        GROUP BY u.id, r.name
        ORDER BY u.created_at DESC
      `);
      
      return rows;
    } catch (error) {
      console.error('Get users error:', error);
      return reply.status(500).send({ message: 'Failed to fetch users' });
    }
  });

  // Get user by ID (admin only or own profile)
  fastify.get('/:id', { 
    preValidation: [fastify.authenticate] 
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const isAdmin = request.user.role && request.user.role.toLowerCase() === 'admin';
      
      // Non-admin users can only view their own profile
      if (!isAdmin && request.user.id !== id) {
        return reply.status(403).send({ 
          statusCode: 403,
          error: 'Forbidden',
          message: 'You can only view your own profile'
        });
      }

      const { rows } = await fastify.pg.query(
        `SELECT 
          u.id, 
          u.full_name, 
          u.email, 
          r.name as role, 
          u.status, 
          u.created_at, 
          u.updated_at,
          COALESCE(
            (
              SELECT json_agg(reg.name) 
              FROM user_regions ur2
              JOIN regions reg ON ur2.region_id = reg.id
              WHERE ur2.user_id = u.id
            ), 
            '[]'::json
          ) as regions
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
        GROUP BY u.id, r.name`,
        [id]
      );

      if (rows.length === 0) {
        return reply.status(404).send({ message: 'User not found' });
      }

      return rows[0];
    } catch (error) {
      console.error('Get user by ID error:', error);
      return reply.status(500).send({ message: 'Failed to fetch user' });
    }
  });

  // Create user (admin only)
  fastify.post('/', {
    schema: createUserSchema,
  preValidation: [fastify.authenticate, fastify.authorize(['Admin'])]
  }, async (request, reply) => {
    return register(fastify, request, reply);
  });

  // Update user status (admin only)
  fastify.post('/:id/status', { 
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])] 
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;

    if (!['active', 'inactive'].includes(status)) {
      return reply.status(400).send({ message: 'Invalid status' });
    }

    try {
      const { rows } = await fastify.pg.query(
        'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );

      if (rows.length === 0) {
        return reply.status(404).send({ message: 'User not found' });
      }

      return { message: `User ${status} successfully` };
    } catch (error) {
      console.error('Update user status error:', error);
      return reply.status(500).send({ message: 'Failed to update user status' });
    }
  });

  // Update user (admin only or own profile)
  fastify.put('/:id', {
    preValidation: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;
    const { full_name, email, role_id, status, regions } = request.body;
    const isAdmin = request.user.role && request.user.role.toLowerCase() === 'admin';

    // Non-admin users can only update their own profile and can't change role/status
    if (!isAdmin) {
      if (request.user.id !== id) {
        return reply.status(403).send({ 
          statusCode: 403,
          error: 'Forbidden',
          message: 'You can only update your own profile'
        });
      }
      
      // Non-admins can't update these fields
      if (role_id || status) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'You are not authorized to update role or status'
        });
      }
    }

    const client = await fastify.pg.connect();
    try {
      await client.query('BEGIN');

      // Update user details
      const { rows: [updatedUser] } = await client.query(
        `UPDATE users 
         SET full_name = COALESCE($1, full_name),
             email = COALESCE($2, email),
             role_id = COALESCE($3, role_id),
             status = COALESCE($4, status),
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, full_name, email, status, created_at, updated_at`,
        [full_name, email, role_id, status, id]
      );

      if (!updatedUser) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ message: 'User not found' });
      }

      // Update user regions if provided and user is admin
      if (Array.isArray(regions) && isAdmin) {
        // Delete existing regions
        await client.query('DELETE FROM user_regions WHERE user_id = $1', [id]);
        
        // Insert new regions if any
        if (regions.length > 0) {
          const values = regions.map((regionId, index) => 
            `($${index * 2 + 1}, $${index * 2 + 2})`
          ).join(',');
          
          const params = [];
          regions.forEach(regionId => {
            params.push(id, regionId);
          });
          
          await client.query(
            `INSERT INTO user_regions (user_id, region_id) VALUES ${values}`,
            params
          );
        }
      }

      await client.query('COMMIT');
      
      // Get updated user with regions
      const { rows: [userWithRegions] } = await fastify.pg.query(
        `SELECT 
          u.*, 
          r.name as role,
          COALESCE(
            (SELECT json_agg(reg.name) 
             FROM user_regions ur
             JOIN regions reg ON ur.region_id = reg.id
             WHERE ur.user_id = u.id),
            '[]'::json
          ) as regions
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [id]
      );

      return userWithRegions;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update user error:', error);
      return reply.status(500).send({ message: 'Failed to update user' });
    } finally {
      client.release();
    }
  });

  // Delete user (admin only)
  fastify.delete('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    const { id } = request.params;
    const client = await fastify.pg.connect();

    try {
      await client.query('BEGIN');
      
      // First delete from user_regions to avoid foreign key constraint
      await client.query('DELETE FROM user_regions WHERE user_id = $1', [id]);
      
      // Then delete the user
      const { rowCount } = await client.query(
        'DELETE FROM users WHERE id = $1',
        [id]
      );

      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ message: 'User not found' });
      }

      await client.query('COMMIT');
      return { message: 'User deleted successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete user error:', error);
      return reply.status(500).send({ 
        message: 'Failed to delete user',
        error: error.message 
      });
    } finally {
      client.release();
    }
  });
};