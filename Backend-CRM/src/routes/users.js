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
      
      return {
        data: rows,
        status: 'success',
        message: 'Users retrieved successfully'
      };
    } catch (error) {
      console.error('Get users error:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to fetch users',
        error: error.message
      });
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
          status: 'error',
          message: 'You can only view your own profile',
          error: 'Forbidden'
        });
      }

      const { rows } = await fastify.pg.query(
        `SELECT 
          u.id, 
          u.full_name, 
          u.email, 
          r.name as role, 
          u.role_id,
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
        return reply.status(404).send({ 
          status: 'error',
          message: 'User not found'
        });
      }

      return {
        data: rows[0],
        status: 'success',
        message: 'User retrieved successfully'
      };
    } catch (error) {
      console.error('Get user by ID error:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to fetch user',
        error: error.message
      });
    }
  });

  // Create user (admin only)
  fastify.post('/', {
    schema: createUserSchema,
    preValidation: [fastify.authenticate, fastify.authorize(['Admin'])]
  }, async (request, reply) => {
    try {
      const user = await register(fastify, request, reply);
      return {
        data: user,
        status: 'success',
        message: 'User created successfully'
      };
    } catch (error) {
      console.error('Create user error:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to create user',
        error: error.message
      });
    }
  });

  // Update user status (admin only)
  fastify.post('/:id/status', { 
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])] 
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;

    if (!['active', 'inactive'].includes(status)) {
      return reply.status(400).send({ 
        status: 'error',
        message: 'Invalid status. Status must be either "active" or "inactive"'
      });
    }

    try {
      const { rows } = await fastify.pg.query(
        'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );

      if (rows.length === 0) {
        return reply.status(404).send({ 
          status: 'error',
          message: 'User not found' 
        });
      }

      return {
        data: { status },
        status: 'success',
        message: `User status updated to ${status} successfully`
      };
    } catch (error) {
      console.error('Update user status error:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to update user status',
        error: error.message
      });
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
          status: 'error',
          message: 'You can only update your own profile',
          error: 'Forbidden'
        });
      }
      
      // Non-admins can't update these fields
      if (role_id || status) {
        return reply.status(403).send({
          status: 'error',
          message: 'You are not authorized to update role or status',
          error: 'Forbidden'
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
         RETURNING id, full_name, email, status, created_at, updated_at, role_id`,
        [full_name, email, role_id, status, id]
      );

      if (!updatedUser) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ 
          status: 'error',
          message: 'User not found' 
        });
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

      return {
        data: userWithRegions,
        status: 'success',
        message: 'User updated successfully'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update user error:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to update user',
        error: error.message
      });
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
      
      // First get the user before deleting for the response
      const { rows: [user] } = await client.query(
        'SELECT id, email FROM users WHERE id = $1',
        [id]
      );

      if (!user) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ 
          status: 'error',
          message: 'User not found' 
        });
      }
      
      // Delete from user_regions to avoid foreign key constraint
      await client.query('DELETE FROM user_regions WHERE user_id = $1', [id]);
      
      // Then delete the user
      await client.query('DELETE FROM users WHERE id = $1', [id]);

      await client.query('COMMIT');
      
      return {
        data: { id: user.id, email: user.email },
        status: 'success',
        message: 'User deleted successfully'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete user error:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to delete user',
        error: error.message 
      });
    } finally {
      client.release();
    }
  });
};