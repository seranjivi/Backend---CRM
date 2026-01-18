// Schema validation for opportunities
const opportunitySchema = {
    type: 'object',
    required: ['opportunity_name', 'client_name', 'close_date', 'amount'],
    properties: {
        opportunity_name: { 
            type: 'string',
            minLength: 1,
            maxLength: 255,
            errorMessage: 'Opportunity name is required and must be less than 255 characters'
        },
        client_name: { 
            type: 'string',
            minLength: 1,
            maxLength: 255,
            errorMessage: 'Client name is required and must be less than 255 characters'
        },
        close_date: { 
            type: 'string',
            format: 'date',
            errorMessage: 'Close date is required and must be a valid date (YYYY-MM-DD)'
        },
        amount: { 
            type: 'number',
            minimum: 0,
            errorMessage: 'Amount is required and must be a positive number'
        },
        amount_currency: { 
            type: 'string',
            default: 'USD',
            maxLength: 10,
            errorMessage: 'Currency code must be a string with max 10 characters'
        },
        opportunity_type: { 
            type: 'string',
            maxLength: 50,
            errorMessage: 'Opportunity type must be a string with max 50 characters'
        },
        lead_source: { 
            type: 'string',
            maxLength: 100,
            errorMessage: 'Lead source must be a string with max 100 characters'
        },
        triaged_status: { 
            type: 'string',
            maxLength: 50,
            errorMessage: 'Triaged status must be a string with max 50 characters'
        },
        pipeline_status: { 
            type: 'string',
            maxLength: 100,
            errorMessage: 'Pipeline status must be a string with max 100 characters'
        },
        win_probability: { 
            type: 'integer',
            minimum: 0,
            maximum: 100,
            errorMessage: 'Win probability must be an integer between 0 and 100'
        },
        user_id: { 
            type: 'integer',
            errorMessage: 'User ID must be an integer'
        },
        role_id: { 
            type: 'integer',
            errorMessage: 'Role ID must be an integer'
        }
    }
};

module.exports = {
    opportunitySchema
};
