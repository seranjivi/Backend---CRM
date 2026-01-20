/**
 * Opportunity Routes
 * Defines all the API endpoints for opportunities
 */
const opportunityController = require('../controllers/opportunityController');

module.exports = async (fastify, options) => {
  const controller = opportunityController(fastify);

  // Get all opportunities
  fastify.get('/', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Get all opportunities',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'array' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.getAllOpportunities);

  // Get opportunity by ID
  fastify.get('/:id', {
    preValidation: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    }
  }, controller.getOpportunityById);

  // Create a new opportunity
  fastify.post('/', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Create a new opportunity',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['opportunity_name', 'client_name', 'close_date', 'amount'],
        properties: {
          opportunity_name: { type: 'string' },
          client_name: { type: 'string' },
          close_date: { type: 'string', format: 'date' },
          amount: { type: 'number' },
          amount_currency: { type: 'string', default: 'USD' },
          opportunity_type: { type: 'string' },
          lead_source: { type: 'string' },
          triaged_status: { type: 'string' },
          pipeline_status: { type: 'string' },
          win_probability: { type: 'number', minimum: 0, maximum: 100 },
          user_id: { type: 'number' },
          role_id: { type: 'number' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.createOpportunity);

  // Update an opportunity
  fastify.put('/:id', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Update an opportunity',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          opportunity_name: { type: 'string' },
          client_name: { type: 'string' },
          close_date: { type: 'string', format: 'date' },
          amount: { type: 'number' },
          amount_currency: { type: 'string' },
          opportunity_type: { type: 'string' },
          lead_source: { type: 'string' },
          triaged_status: { type: 'string' },
          pipeline_status: { type: 'string' },
          win_probability: { type: 'number', minimum: 0, maximum: 100 },
          user_id: { type: 'number' },
          role_id: { type: 'number' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.updateOpportunity);

  // Delete an opportunity
  fastify.delete('/:id', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Delete an opportunity',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.deleteOpportunity);

  // Get opportunities by user ID
  fastify.get('/user/:userId?', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Get opportunities by user ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'array' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.getOpportunitiesByUser);

  // Get opportunities by status
  fastify.get('/status/:status', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Get opportunities by status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          status: { type: 'string' }
        },
        required: ['status']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'array' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.getOpportunitiesByStatus);

fastify.get('/template', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Download opportunity import template',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'string',
          format: 'binary'
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.downloadTemplate);
  fastify.post('/import', {
    preValidation: [fastify.authenticate],
    schema: {
      tags: ['opportunities'],
      description: 'Import opportunities from file',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                success: { type: 'number' },
                failures: { type: 'number' },
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      row: { type: 'number' },
                      error: { type: 'string' },
                      data: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, controller.importOpportunities);
};
