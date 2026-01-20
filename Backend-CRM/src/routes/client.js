// src/routes/client.js
const { 
  createClient, 
  getClientById, 
  listClients,
  updateClient,
  deleteClient,
  importClients 
} = require('../controllers/clientController');

async function clientRoutes(fastify, options) {
  // Create a new client with contacts and addresses
  fastify.post('/', {
    preValidation: [fastify.authenticate, fastify.authorize(['clients:write'])],
    schema: {
      body: {
        type: 'object',
        required: ['client_name', 'user_id'],
        properties: {
          client_name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          website: { type: 'string' },
          industry: { type: 'string' },
          customer_type: { type: 'string' },
          tax_id: { type: 'string' },
          status: { type: 'string', default: 'active' },
          notes: { type: 'string' },
          user_id: { type: 'integer' },
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                phone: { type: 'string' },
                designation: { type: 'string' }
              },
              required: ['name']
            }
          },
          addresses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address_line1: { type: 'string' },
                address_line2: { type: 'string' },
                city: { type: 'string' },
                region_state: { type: 'string' },
                country: { type: 'string' },
                postal_code: { type: 'string' },
                is_primary: { type: 'boolean', default: false }
              },
              required: ['address_line1', 'country']
            }
          }
        }
      }
    }
  }, createClient);

  // List all clients with pagination and filtering
  fastify.get('/', {
    preValidation: [fastify.authenticate, fastify.authorize(['clients:read'])],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
          industry: { type: 'string' },
          search: { type: 'string' }
        }
      }
    }
  }, listClients);

  // Update client by ID
  fastify.put('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['clients:write'])],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        required: ['client_name', 'user_id'],
        properties: {
          client_name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          website: { type: 'string' },
          industry: { type: 'string' },
          customer_type: { type: 'string' },
          tax_id: { type: 'string' },
          status: { type: 'string' },
          notes: { type: 'string' },
          user_id: { type: 'integer' },
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                phone: { type: 'string' },
                designation: { type: 'string' }
              },
              required: ['name']
            }
          },
          addresses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address_line1: { type: 'string' },
                address_line2: { type: 'string' },
                city: { type: 'string' },
                region_state: { type: 'string' },
                country: { type: 'string' },
                postal_code: { type: 'string' },
                is_primary: { type: 'boolean' }
              },
              required: ['address_line1', 'country']
            }
          }
        }
      }
    }
  }, updateClient);

  // Get client by ID with contacts and addresses
  fastify.get('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['clients:read'])],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        },
        required: ['id']
      }
    }
  }, getClientById);

  // Delete client by ID
  fastify.delete('/:id', {
    preValidation: [fastify.authenticate, fastify.authorize(['clients:write'])],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        },
        required: ['id']
      }
    }
  }, deleteClient);

  // Import multiple clients
  fastify.post('/import', {
    preValidation: [fastify.authenticate, fastify.authorize(['clients:write'])],
    schema: {
      body: {
        type: 'object',
        required: ['clients'],
        properties: {
          clients: {
            type: 'array',
            items: {
              type: 'object',
              required: ['client_name', 'user_id'],
              properties: {
                client_name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                website: { type: 'string' },
                industry: { type: 'string' },
                customer_type: { type: 'string' },
                tax_id: { type: 'string' },
                status: { type: 'string', default: 'active' },
                notes: { type: 'string' },
                user_id: { type: 'integer' },
                contacts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string', format: 'email' },
                      phone: { type: 'string' },
                      designation: { type: 'string' }
                    },
                    required: ['name']
                  }
                },
                addresses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      address_line1: { type: 'string' },
                      address_line2: { type: 'string' },
                      city: { type: 'string' },
                      region_state: { type: 'string' },
                      country: { type: 'string' },
                      postal_code: { type: 'string' },
                      is_primary: { type: 'boolean', default: false }
                    },
                    required: ['address_line1', 'country']
                  }
                }
              }
            }
          }
        }
      }
    }
  }, importClients);
}

module.exports = clientRoutes;