// backend/src/middleware/auth.js
const fp = require('fastify-plugin');
const jwt = require('jsonwebtoken');

// Define role-based access control (RBAC) configuration
const RBAC_CONFIG = {
  'Presales Member': {
    allowedModules: ['clients', 'opportunities'],
    permissions: {
      clients: ['read', 'write'],
      opportunities: ['read', 'write']
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
    allowedModules: ['clients'],
    permissions: {
      clients: ['read', 'write'],
      opportunities: []
    }
  },
  'Admin': {
    allowedModules: ['*'],
    permissions: {
      '*': ['*']
    }
  }
};

// Helper function to merge permissions from multiple roles
const mergePermissions = (roles) => {
  const merged = {
    allowedModules: [],
    permissions: {}
  };

  // Get unique modules from all roles
  const allModules = new Set();
  roles.forEach(role => {
    const config = RBAC_CONFIG[role] || { allowedModules: [] };
    config.allowedModules.forEach(module => allModules.add(module));
  });
  merged.allowedModules = Array.from(allModules);

  // Merge permissions
  roles.forEach(role => {
    const config = RBAC_CONFIG[role] || { permissions: {} };
    Object.entries(config.permissions).forEach(([module, actions]) => {
      if (!merged.permissions[module]) {
        merged.permissions[module] = [];
      }
      actions.forEach(action => {
        if (!merged.permissions[module].includes(action)) {
          merged.permissions[module].push(action);
        }
      });
    });
  });

  // Handle wildcard permissions
  if (merged.permissions['*']?.includes('*')) {
    merged.allowedModules = ['*'];
  }

  return merged;
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
      
      // Get user with all their roles
      const { rows } = await fastify.pg.query(`
        SELECT 
          u.id, 
          u.email, 
          u.status,
          ARRAY_REMOVE(ARRAY_AGG(r.name), NULL) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        WHERE u.id = $1
        GROUP BY u.id
      `, [decoded.id]);

      if (rows.length === 0) {
        throw new Error('User not found');
      }

      const user = rows[0];

      if (user.status !== 'active') {
        throw new Error('User account is not active');
      }

      // Get merged permissions from all roles
      const mergedPermissions = mergePermissions(user.roles || []);

      // Attach user to request with role information
      request.user = {
        id: user.id,
        email: user.email,
        status: user.status,
        roles: user.roles,
        permissions: mergedPermissions
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

      // For each required permission, check if user has it
      for (const permission of requiredPermissions) {
        const [module, action = '*'] = permission.split(':');
        const { permissions } = request.user;

        // Check if user's role has access to the module
        const hasModuleAccess = 
          permissions.allowedModules.includes('*') || 
          permissions.allowedModules.includes(module);

        // Check if user has the required permission
        const hasPermission = 
          permissions.permissions['*']?.includes('*') ||
          permissions.permissions[module]?.includes('*') ||
          permissions.permissions[module]?.includes(action);

        if (!hasModuleAccess || !hasPermission) {
          console.log(`Access denied for roles [${request.user.roles.join(', ')}] to ${permission}`);
          reply.code(403).send({ 
            statusCode: 403,
            error: 'Forbidden',
            message: 'Insufficient permissions to access this resource',
            requiredPermission: permission
          });
          return;
        }
      }
      
      done();
    };
  });
});