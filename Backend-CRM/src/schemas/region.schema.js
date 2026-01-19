const { Type } = require('@sinclair/typebox');

// Response schemas
const regionResponse = {
  id: Type.Number(),
  name: Type.String(),
  code: Type.Optional(Type.String({ maxLength: 10 })),
  description: Type.Optional(Type.String()),
  country_id: Type.Number(),
  is_active: Type.Boolean(),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' })
};

// Request schemas
const regionListSchema = {
  description: 'Get all regions',
  tags: ['regions'],
  response: {
    200: Type.Object({
      success: Type.Boolean(),
      data: Type.Array(Type.Object(regionResponse))
    }),
    500: Type.Object({
      success: Type.Boolean(),
      message: Type.String(),
      error: Type.String()
    })
  }
};

const regionByCountrySchema = {
  description: 'Get regions by country ID',
  tags: ['regions'],
  params: Type.Object({
    countryId: Type.Number()
  }),
  response: {
    200: Type.Object({
      success: Type.Boolean(),
      data: Type.Array(Type.Object({
        id: Type.Number(),
        name: Type.String(),
        code: Type.Optional(Type.String()),
        description: Type.Optional(Type.String())
      }))
    }),
    400: Type.Object({
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
  regionListSchema,
  regionByCountrySchema
};
