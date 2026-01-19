const { Type } = require('@sinclair/typebox');

// Response schemas
const countryResponse = {
  id: Type.Number(),
  name: Type.String(),
  code: Type.String({ maxLength: 5 }),
  phone_code: Type.Optional(Type.String()),
  is_active: Type.Boolean(),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' })
};

// Request schemas
const countryListSchema = {
  description: 'Get all countries',
  tags: ['countries'],
  response: {
    200: Type.Object({
      success: Type.Boolean(),
      data: Type.Array(Type.Object(countryResponse))
    }),
    500: Type.Object({
      success: Type.Boolean(),
      message: Type.String(),
      error: Type.String()
    })
  }
};

const countryGetSchema = {
  description: 'Get country by ID',
  tags: ['countries'],
  params: Type.Object({
    id: Type.Number()
  }),
  response: {
    200: Type.Object({
      success: Type.Boolean(),
      data: Type.Object(countryResponse)
    }),
    404: Type.Object({
      success: Type.Boolean(),
      message: Type.String()
    }),
    500: Type.Object({
      success: Type.Boolean(),
      message: Type.String(),
      error: Type.String()
    })
  }
};

module.exports = {
  countryListSchema,
  countryGetSchema
};
