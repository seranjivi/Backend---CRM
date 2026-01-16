// backend/src/routes/users.js
const { createUser } = require('../controllers/userController');
const { createUserSchema } = require('../schemas/user.schema');

module.exports = async function (fastify, options) {
  // Get all users (admin only)
  fastify.get('/', { 
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])] 
  }, async (request, reply) => {
    try {
      const { rows } = await fastify.pg.query(`
        SELECT 
          u.id, u.full_name, u.email, u.role, u.status, u.created_at, u.updated_at,
          COALESCE(json_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '[]') as regions
        FROM users u
        LEFT JOIN user_regions ur ON u.id = ur.user_id
        LEFT JOIN regions r ON ur.region_id = r.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `);
      
      return rows;
    } catch (error) {
      console.error('Get users error:', error);
      return reply.status(500).send({ message: 'Failed to fetch users' });
    }
  });

  // Create user (no authentication required for first user)
  // In src/routes/users.js
// In src/routes/users.js
fastify.post('/', {
  schema: createUserSchema
}, async (request, reply) => {
  // Directly create user without any authentication checks
  return createUser(fastify, request, reply);
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

  // Delete user (admin only)
  fastify.delete('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const { rowCount } = await fastify.pg.query(
        'DELETE FROM users WHERE id = $1',
        [id]
      );

      if (rowCount === 0) {
        return reply.status(404).send({ message: 'User not found' });
      }

      return { message: 'User deleted successfully' };
    } catch (error) {
      console.error('Delete user error:', error);
      return reply.status(500).send({ message: 'Failed to delete user' });
    }
  });
};