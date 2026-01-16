exports.createUserSchema = {
  body: {
    type: 'object',
    required: ['full_name', 'email', 'password'],
    properties: {
      full_name: { 
        type: 'string',
        minLength: 2,
        maxLength: 100
      },
      email: { 
        type: 'string',
        format: 'email'
      },
      password: {
        type: 'string',
        minLength: 6
      },
      role: {
        type: 'string',
        enum: ['admin', 'user'],
        default: 'user'
      },
      regions: {
        type: 'array',
        items: { type: 'number' },
        default: []
      }
    }
  }
};
