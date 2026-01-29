// backend/src/routes/auth.js
const bcrypt = require('bcrypt');

module.exports = async function (fastify, options) {
  // Login endpoint
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Email and password are required'
      });
    }

    try {
      // Find user by email with roles
      const { rows } = await fastify.pg.query(`
        SELECT 
          u.id, 
          u.full_name,
          u.email, 
          u.password_hash,
          u.status,
          ARRAY_REMOVE(ARRAY_AGG(r.name), NULL) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        WHERE u.email = $1
        GROUP BY u.id, u.full_name, u.email, u.password_hash, u.status
      `, [email]);

      if (rows.length === 0) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      const user = rows[0];
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);      
      if (!isPasswordValid) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      // Check if user is active
      if (user.status !== 'active') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Your account has been deactivated. Please contact an administrator.'
        });
      }

      // Generate JWT token with user data
      const tokenPayload = {
        id: user.id,
        email: user.email,
        roles: user.roles || []
      };
      
      const token = fastify.jwt.sign(
        tokenPayload,
        { expiresIn: '1d' }
      );

      // Remove sensitive data
      const { password_hash, ...userData } = user;
      
      return {
        statusCode: 200,
        message: 'Login successful',
        data: {
          user: userData,
          token
        }
      };
    } catch (error) {
      console.error('Login error:', error);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'An error occurred while processing your request'
      });
    }
  });

  // Get current user profile
  fastify.get('/me', { 
    preValidation: [fastify.authenticate] 
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
          COALESCE(
            json_agg(
              json_build_object('id', r.id, 'name', r.name)
            ) FILTER (WHERE r.id IS NOT NULL), 
            '[]'::json
          ) as regions,
          COALESCE(
            (SELECT ARRAY_AGG(r.name)
             FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             WHERE ur.user_id = u.id),
            ARRAY[]::varchar[]
          ) as roles
        FROM users u
        LEFT JOIN user_regions ur ON u.id = ur.user_id
        LEFT JOIN regions r ON ur.region_id = r.id
        WHERE u.id = $1
        GROUP BY u.id`,
        [request.user.id]
      );

      if (rows.length === 0) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found'
        });
      }

      // Remove any sensitive data
      const { password_hash, ...userData } = rows[0];

      return {
        statusCode: 200,
        message: 'User profile retrieved successfully',
        data: userData
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to retrieve user profile'
      });
    }
  });
};