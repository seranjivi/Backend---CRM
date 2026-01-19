const {
    createSOW,
    getSOWById,
    getSOWsByOpportunity,
    updateSOW,
    listSOWs
} = require('../controllers/sowController');

async function sowRoutes(fastify, options) {
    // Create SOW
    fastify.post('/', {
        schema: {
            body: {
                type: 'object',
                required: ['opportunity_id', 'rfb_id', 'user_id', 'sow_title'],
                properties: {
                    opportunity_id: { type: 'integer' },
                    rfb_id: { type: 'integer' },
                    user_id: { type: 'integer' },
                    sow_title: { type: 'string', minLength: 1, maxLength: 255 },
                    release_version: { type: 'string', maxLength: 50 },
                    contract_currency: { type: 'string', default: 'USD', maxLength: 3 },
                    contract_value: { type: 'number', default: 0, minimum: 0 },
                    target_kickoff_date: { type: 'string', format: 'date' },
                    linked_proposal_reference: { type: 'string', maxLength: 255 },
                    scope_overview: { type: 'string' }
                }
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
        }
    }, getSOWById);

    // Get SOWs by Opportunity
    fastify.get('/opportunity/:opportunityId', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    opportunityId: { type: 'integer' }
                },
                required: ['opportunityId']
            }
        }
    }, getSOWsByOpportunity);

    // List SOWs with pagination and filters
    fastify.get('/', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'integer', minimum: 1, default: 1 },
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
                    sortBy: { 
                        type: 'string', 
                        enum: ['created_at', 'sow_title', 'sow_status', 'contract_value'],
                        default: 'created_at'
                    },
                    sortOrder: { 
                        type: 'string', 
                        enum: ['asc', 'desc'],
                        default: 'desc'
                    },
                    status: { 
                        type: 'string',
                        enum: ['Draft', 'Submitted', 'In Review', 'Approved', 'Rejected', 'Active', 'Completed', 'Cancelled']
                    },
                    opportunity_id: { type: 'integer' },
                    rfb_id: { type: 'integer' },
                    user_id: { type: 'integer' },
                    search: { type: 'string' }
                }
            }
        }
    }, listSOWs);

    // Update SOW
    fastify.put('/:id', {
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
                properties: {
                    sow_title: { type: 'string', minLength: 1, maxLength: 255 },
                    release_version: { type: 'string', maxLength: 50 },
                    contract_currency: { type: 'string', maxLength: 3 },
                    contract_value: { type: 'number', minimum: 0 },
                    target_kickoff_date: { type: 'string', format: 'date' },
                    linked_proposal_reference: { type: 'string', maxLength: 255 },
                    scope_overview: { type: 'string' },
                    sow_status: { 
                        type: 'string',
                        enum: ['Draft', 'Submitted', 'In Review', 'Approved', 'Rejected', 'Active', 'Completed', 'Cancelled']
                    }
                },
                minProperties: 1
            }
        }
    }, updateSOW);
}

module.exports = sowRoutes;