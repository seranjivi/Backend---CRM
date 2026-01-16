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
        'SELECT id, email, role, status FROM users WHERE id = $1',
        [decoded.id]
      );

      if (rows.length === 0) {
        throw new Error('User not found');
      }

      if (rows[0].status !== 'active') {
        throw new Error('User account is not active');
      }

      // Attach user to request
      request.user = rows[0];
    } catch (error) {
      console.error('Authentication error:', error.message);
      reply.code(401).send({ message: error.message || 'Invalid or expired token' });
    }
  });

  // Authorization middleware
  fastify.decorate('authorize', function (roles = []) {
    return function (request, reply, done) {
      try {
        if (!request.user) {
          throw new Error('Not authenticated');
        }

        if (roles.length > 0 && !roles.includes(request.user.role)) {
          throw new Error('Insufficient permissions');
        }

        done();
      } catch (error) {
        console.error('Authorization error:', error.message);
        reply.code(403).send({ message: error.message || 'Forbidden' });
      }
    };
  });
});