exports.createUserSchema = {
  body: {
    type: 'object',
    required: ['full_name', 'email'],
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
        minLength: 6,
        default: 'Admin@123'
      },
      role: {
        type: 'string',
        enum: ['Admin', 'User', 'Manager'],
        default: 'User'
      },
      regions: {
        type: 'array',
        items: { type: 'number' },
        default: []
      }
    }
  }
};
