const Role = require('../models/role.model');

module.exports = async function (fastify, options) {
  // Initialize the Role model with the Fastify instance
  const roleModel = Role(fastify);
  // Get all roles
  fastify.get('/', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    try {
      const roles = await roleModel.getAll();
      return { 
        data: roles,
        status: 'success',
        message: 'Roles retrieved successfully'
      };
    } catch (error) {
      console.error('Error fetching roles:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to fetch roles',
        error: error.message 
      });
    }
  });

  // Get role by ID
  fastify.get('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    try {
      const role = await roleModel.getById(request.params.id);
      if (!role) {
        return reply.status(404).send({ 
          status: 'error',
          message: 'Role not found' 
        });
      }
      return { 
        data: role,
        status: 'success',
        message: 'Role retrieved successfully'
      };
    } catch (error) {
      console.error(`Error fetching role with ID ${request.params.id}:`, error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to fetch role',
        error: error.message 
      });
    }
  });
};
