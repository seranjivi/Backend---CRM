// src/routes/sow.js
const {
    createSOW,
    getSOWById,
    getSOWsByOpportunity,
    updateSOW,
    listSOWs,
    deleteSOW
} = require('../controllers/sowController');

async function sowRoutes(fastify, options) {
    // Delete SOW by ID
    fastify.delete('/:id', {
        preValidation: [fastify.authenticate],
        handler: deleteSOW
    });

    // Create SOW with file uploads
    fastify.post('/', {
        preValidation: [fastify.authenticate],
        config: {
            payload: {
                maxFields: 1000, // Increased from 100 to 1000
                maxFileSize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5,
                allow: 'multipart/form-data'
            }
        }
    }, createSOW);

    // Get SOW by ID
    fastify.get('/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'integer' }
                },
                required: ['id']
            }
        },
        preValidation: [fastify.authenticate],
        handler: getSOWById
    });

    // Get SOWs by Opportunity
    // fastify.get('/opportunity/:opportunityId', {
    //     schema: {
    //         params: {
    //             type: 'object',
    //             properties: {
    //                 opportunityId: { type: 'integer' }
    //             },
    //             required: ['opportunityId']
    //         }
    //     },
    //     preValidation: [fastify.authenticate]
    // }, getSOWsByOpportunity);

    // List SOWs with filters
    fastify.get('/', {
    schema: {
        querystring: {
            type: 'object',
            properties: {
                page: { type: 'integer', minimum: 1, default: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
                sortBy: { 
                    type: 'string', 
                    enum: ['created_at', 'sow_title', 'contract_value', 'sow_id', 'opportunity_id', 'rfb_id'],
                    default: 'created_at'
                },
                sortOrder: { 
                    type: 'string', 
                    enum: ['asc', 'desc'],
                    default: 'desc'
                },
                opportunity_id: { type: 'integer' },
                rfb_id: { type: 'integer' },
                user_id: { type: 'integer' },
                search: { type: 'string' }
            }
        }
    },
    preValidation: [fastify.authenticate]
}, listSOWs);

    // Update SOW
// Add this route in sow.js
fastify.put('/:id', {
    schema: {
        params: {
            type: 'object',
            properties: {
                id: { type: 'integer' }
            },
            required: ['id']
        },
        consumes: ['multipart/form-data'],
        response: {
            200: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: { 
                        type: 'object',
                        properties: {
                            sow_id: { type: 'integer' },
                            sow_title: { type: 'string' },
                            status: { type: 'string' },
                            documents: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        original_filename: { type: 'string' },
                                        mime_type: { type: 'string' },
                                        size: { type: 'integer' },
                                        created_at: { type: 'string', format: 'date-time' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    preValidation: [fastify.authenticate],
    handler: updateSOW
});
}

module.exports = sowRoutes;