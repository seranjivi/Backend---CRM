// backend/src/routes/auth.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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
      // Find user by email with required fields
      const { rows } = await fastify.pg.query(
        `SELECT id, email, password_hash, role_id, full_name, status 
         FROM users 
         WHERE email = $1`,
        [email]
      );
      
      console.log('Login attempt for email:', email);
      console.log('User found:', rows[0] ? { id: rows[0].id, email: rows[0].email } : 'Not found');

      if (rows.length === 0) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      const user = rows[0];
      
      // Debug log the stored hash and input password
      console.log('Stored password hash:', user.password_hash);
      console.log('Input password length:', password.length);
      
      // Use bcrypt to compare passwords
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      console.log('Password comparison result:', isPasswordValid);
      
      if (!isPasswordValid) {
        console.log('Password comparison failed');
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
        role_id: user.role_id  // Using role_id instead of role to match the database
      };
      
      console.log('Generating token with payload:', tokenPayload);
      
      const token = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1d' }
      );
      
      console.log('Generated token:', token);

      // Prepare user data (exclude sensitive information)
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
      const { rows } = await fastify.pg.query(
        `SELECT 
          u.id, 
          u.full_name, 
          u.email, 
          u.role, 
          u.status, 
          u.created_at, 
          u.updated_at,
          COALESCE(
            json_agg(
              json_build_object('id', r.id, 'name', r.name)
            ) FILTER (WHERE r.id IS NOT NULL), 
            '[]'
          ) as regions
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

      return {
        statusCode: 200,
        message: 'User profile retrieved successfully',
        data: rows[0]
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