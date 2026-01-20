// backend/src/middleware/auth.js
const fp = require('fastify-plugin');
const jwt = require('jsonwebtoken');

// Define role-based access control (RBAC) configuration
const RBAC_CONFIG = {
  'Presales Member': {
    allowedModules: ['clients', 'opportunities'],
    permissions: {
      clients: ['read', 'write'],  // Full access to clients
      opportunities: ['read', 'write']  // Full access to opportunities
    }
  },
  'Presales Lead': {
    allowedModules: ['clients', 'opportunities'],
    permissions: {
      clients: ['read', 'write'],
      opportunities: ['read']
    }
  },
  'Sales Head': {
    allowedModules: ['clients'],  // Only clients module
    permissions: {
      clients: ['read', 'write'],  // Full access to clients
      opportunities: []  // No access to opportunities
    }
  },
  'Admin': {
    allowedModules: ['*'], // Access to all modules
    permissions: {
      '*': ['*'] // All permissions
    }
  }
};

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

      // Get role configuration
      const roleConfig = RBAC_CONFIG[user.role_name] || {
        allowedModules: [],
        permissions: {}
      };

      // Attach user to request with role information
      request.user = {
        id: user.id,
        email: user.email,
        status: user.status,
        role_id: user.role_id,
        role: user.role_name,
        permissions: roleConfig
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
  fastify.decorate('authorize', function (requiredPermissions = []) {
    return function (request, reply, done) {
      if (!request.user) {
        reply.code(401).send({ 
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required' 
        });
        return;
      }

      // If no specific permissions required, just check authentication
      if (requiredPermissions.length === 0) {
        done();
        return;
      }

      const { role, permissions } = request.user;
      const [module, action = '*'] = requiredPermissions[0].split(':');

      // Check if user's role has access to the module
      const hasModuleAccess = permissions.allowedModules.includes('*') || 
                             permissions.allowedModules.includes(module);

      // Check if user has the required permission
      const hasPermission = permissions.permissions[module]?.includes('*') || 
                          permissions.permissions[module]?.includes(action) ||
                          permissions.permissions['*']?.includes('*');

      if (!hasModuleAccess || !hasPermission) {
        console.log(`Access denied for ${role} to ${requiredPermissions[0]}`);
        reply.code(403).send({ 
          statusCode: 403,
          error: 'Forbidden',
          message: 'Insufficient permissions to access this resource',
          requiredPermission: requiredPermissions[0]
        });
        return;
      }
      
      done();
    };
  });
});