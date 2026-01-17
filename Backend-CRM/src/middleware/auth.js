// backend/src/middleware/auth.js
const fp = require('fastify-plugin');
const jwt = require('jsonwebtoken');

module.exports = fp(async function (fastify, options) {
  // Authentication middleware
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // Verify user exists and is active
      const { rows } = await fastify.pg.query(
        `SELECT u.id, u.email, u.status, u.role_id, r.name as role_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [decoded.id]
      );

      if (rows.length === 0) {
        throw new Error('User not found');
      }

      const user = rows[0];

      if (user.status !== 'active') {
        throw new Error('User account is not active');
      }

      // Attach user to request with role information
      request.user = {
        id: user.id,
        email: user.email,
        status: user.status,
        role_id: user.role_id,
        role: user.role_name
      };
    } catch (error) {
      console.error('Authentication error:', error.message);
      reply.code(401).send({ 
        statusCode: 401,
        error: 'Unauthorized',
        message: error.message || 'Invalid or expired token'
      });
    }
  });

  // Authorization middleware
  fastify.decorate('authorize', function (roles = []) {
    return function (request, reply, done) {
      try {
        if (!request.user) {
          throw new Error('Not authenticated');
        }

        // If user is admin, grant all access
        if (request.user.role && request.user.role.toLowerCase() === 'admin') {
          return done();
        }

        // Check if user has any of the required roles
        if (roles.length > 0 && !roles.some(role => 
          request.user.role && request.user.role.toLowerCase() === role.toLowerCase()
        )) {
          throw new Error('Insufficient permissions');
        }

        done();
      } catch (error) {
        console.error('Authorization error:', error.message);
        reply.code(403).send({ 
          statusCode: 403,
          error: 'Forbidden',
          message: error.message || 'Access denied',
          userRole: request.user?.role,
          requiredRoles: roles
        });
      }
    };
  });
});