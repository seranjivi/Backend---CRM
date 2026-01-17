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
      return { roles };
    } catch (error) {
      console.error('Error fetching roles:', error);
      return reply.status(500).send({ message: 'Failed to fetch roles' });
    }
  });

  // Get role by ID
  fastify.get('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    try {
      const role = await roleModel.getById(request.params.id);
      if (!role) {
        return reply.status(404).send({ message: 'Role not found' });
      }
      return role;
    } catch (error) {
      console.error(`Error fetching role with ID ${request.params.id}:`, error);
      return reply.status(500).send({ message: 'Failed to fetch role' });
    }
  });
};
