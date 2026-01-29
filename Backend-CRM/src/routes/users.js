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
        u.status, 
        u.created_at, 
        u.updated_at,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.name), NULL) as roles,
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
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id
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
    const userId = parseInt(id, 10);
    
    const userRoles = (request.user.roles || []).map(role => role.toLowerCase());
    const isAdmin = userRoles.includes('admin');
    
    // Non-admin users can only view their own profile
    if (!isAdmin && request.user.id !== userId) {
      return reply.status(403).send({ 
        status: 'error',
        message: 'You can only view your own profile',
        error: 'Forbidden'
      });
    }

    const { rows } = await fastify.pg.query(`
      SELECT 
        u.id, 
        u.full_name, 
        u.email, 
        u.status, 
        u.created_at, 
        u.updated_at,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.name), NULL) as roles,
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
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

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
    console.error('Get user error:', error);
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
      return reply.status(201).send({
        data: user,
        status: 'success',
        message: 'User created successfully'
      });
    } catch (error) {
      console.error('Create user error:', error);
      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({ 
        status: 'error',
        message: error.message || 'Failed to create user',
        ...(process.env.NODE_ENV === 'development' && { error: error.stack })
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
  const { full_name, email, roles, status, regions } = request.body;
  const userId = parseInt(id, 10);
  
  const userRoles = (request.user.roles || []).map(r => r.toLowerCase());
  const isAdmin = userRoles.includes('admin');

  // Non-admin users can only update their own profile and can't change roles/status
  if (!isAdmin) {
    if (request.user.id !== userId) {
      return reply.status(403).send({ 
        status: 'error',
        message: 'You can only update your own profile',
        error: 'Forbidden'
      });
    }
    
    // Non-admins can't update these fields
    if (roles || status) {
      return reply.status(403).send({
        status: 'error',
        message: 'You are not authorized to update roles or status',
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
           status = COALESCE($3, status),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, full_name, email, status, created_at, updated_at`,
      [full_name, email, status, userId]
    );

    if (!updatedUser) {
      await client.query('ROLLBACK');
      return reply.status(404).send({ 
        status: 'error',
        message: 'User not found' 
      });
    }

    // Update user roles if provided and user is admin
    if (Array.isArray(roles) && isAdmin) {
      // Delete existing roles
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      
      // Insert new roles if any
      if (roles.length > 0) {
        const roleValues = roles.map((_, i) => 
          `($${i * 2 + 1}, (SELECT id FROM roles WHERE name = $${i * 2 + 2} LIMIT 1))`
        ).join(',');
        
        const roleParams = [];
        roles.forEach(roleName => {
          roleParams.push(userId, roleName);
        });
        
        await client.query(
          `INSERT INTO user_roles (user_id, role_id) 
           VALUES ${roleValues} 
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          roleParams
        );
      }
    }

    // Update user regions if provided and user is admin
    if (Array.isArray(regions) && isAdmin) {
      // Delete existing regions
      await client.query('DELETE FROM user_regions WHERE user_id = $1', [userId]);
      
      // Insert new regions if any
      if (regions.length > 0) {
        const regionValues = regions.map((_, i) => 
          `($${i * 2 + 1}, $${i * 2 + 2})`
        ).join(',');
        
        const regionParams = [];
        regions.forEach(regionId => {
          regionParams.push(userId, regionId);
        });
        
        await client.query(
          `INSERT INTO user_regions (user_id, region_id) VALUES ${regionValues}`,
          regionParams
        );
      }
    }

    await client.query('COMMIT');
    
    // Get updated user with roles and regions
    const { rows: [userWithDetails] } = await fastify.pg.query(`
      SELECT 
        u.*,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.name), NULL) as roles,
        COALESCE(
          (SELECT json_agg(reg.name) 
           FROM user_regions ur
           JOIN regions reg ON ur.region_id = reg.id
           WHERE ur.user_id = u.id),
          '[]'::json
        ) as regions
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

    return {
      data: userWithDetails,
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