const { createRFP, getAllRFPs, getRFPByOpportunityId, updateRFP, deleteRFP } = require('../controllers/rfpController');

module.exports = async function (fastify, options) {
  // Get all RFPs
  fastify.get('/', {
    preValidation: [fastify.authenticate],
    handler: async (request, reply) => {
      return getAllRFPs(fastify, request, reply);
    }
  });

  // Create new RFP with file uploads
  fastify.post('/', {
    preValidation: [fastify.authenticate],
    config: {
      payload: {
        maxFields: 100,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        allow: 'multipart/form-data'
      }
    },
    handler: async (request, reply) => {
      return createRFP(fastify, request, reply);
    }
  });
  
  // Get RFP by opportunity ID
  fastify.get('/by-opportunity/:opportunityId', {
    preValidation: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          opportunityId: { type: 'integer' }
        },
        required: ['opportunityId']
      }
    },
    handler: async (request, reply) => {
      return getRFPByOpportunityId(fastify, request, reply);
    }
  });
  fastify.put('/:id', {
    preValidation: [fastify.authenticate],
    config: {
      payload: {
        maxFields: 100,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,  // Allow multiple document uploads
        allow: 'multipart/form-data'
      }
    },
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        },
        required: ['id']
      }
    },
    handler: async (request, reply) => {
      return updateRFP(fastify, request, reply);
    }
  });

  // Delete RFP by ID
  fastify.delete('/:id', {
    preValidation: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        },
        required: ['id']
      }
    },
    handler: async (request, reply) => {
      return deleteRFP(fastify, request, reply);
    }
  });
};
