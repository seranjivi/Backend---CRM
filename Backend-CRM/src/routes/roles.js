const Role = require('../models/role.model');

module.exports = async function (fastify, options) {
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
      console.error('Error fetching role:', error);
      return reply.status(500).send({ 
        status: 'error',
        message: 'Failed to fetch role',
        error: error.message 
      });
    }
  });

  // Create new role
  fastify.post('/', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    try {
      const role = await roleModel.create(request.body);
      return reply.status(201).send({
        data: role,
        status: 'success',
        message: 'Role created successfully'
      });
    } catch (error) {
      console.error('Error creating role:', error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to create role',
        error: error.message
      });
    }
  });

  // Update role
  fastify.put('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    try {
      const role = await roleModel.update(request.params.id, request.body);
      if (!role) {
        return reply.status(404).send({
          status: 'error',
          message: 'Role not found'
        });
      }
      return {
        data: role,
        status: 'success',
        message: 'Role updated successfully'
      };
    } catch (error) {
      console.error('Error updating role:', error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to update role',
        error: error.message
      });
    }
  });

  // Delete role
  fastify.delete('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    try {
      const role = await roleModel.delete(request.params.id);
      if (!role) {
        return reply.status(404).send({
          status: 'error',
          message: 'Role not found'
        });
      }
      return {
        data: role,
        status: 'success',
        message: 'Role deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting role:', error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to delete role',
        error: error.message
      });
    }
  });
};
