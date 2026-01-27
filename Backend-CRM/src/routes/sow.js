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
    // fastify.get('/:id', {
    //     schema: {
    //         params: {
    //             type: 'object',
    //             properties: {
    //                 id: { type: 'integer' }
    //             },
    //             required: ['id']
    //         }
    //     },
    //     preValidation: [fastify.authenticate]
    // }, getSOWById);

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
    // fastify.put('/:id', {
    //     schema: {
    //         params: {
    //             type: 'object',
    //             properties: {
    //                 id: { type: 'integer' }
    //             },
    //             required: ['id']
    //         },
    //         body: {
    //             type: 'object',
    //             properties: {
    //                 sow_title: { type: 'string', minLength: 1, maxLength: 255 },
    //                 release_version: { type: 'string', maxLength: 50 },
    //                 contract_currency: { type: 'string', maxLength: 3 },
    //                 contract_value: { type: 'number', minimum: 0 },
    //                 target_kickoff_date: { type: 'string', format: 'date' },
    //                 linked_proposal_reference: { type: 'string', maxLength: 255 },
    //                 scope_overview: { type: 'string' }
    //             },
    //             minProperties: 1
    //         }
    //     },
    //     preValidation: [fastify.authenticate]
    // }, updateSOW);
}

module.exports = sowRoutes;