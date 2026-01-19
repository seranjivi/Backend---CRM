// backend/src/routes/regions.js
const { regionListSchema, regionByCountrySchema } = require('../schemas/region.schema');
const regionController = require('../controllers/regionController');

async function regionRoutes(fastify, options) {
  // Get all regions
  fastify.get('/', 
    { 
      schema: regionListSchema,
      preValidation: [fastify.authenticate] 
    },
    regionController.getRegions
  );

  // Get regions by country ID
  fastify.get('/country/:countryId', 
    { 
      schema: regionByCountrySchema,
      preValidation: [fastify.authenticate] 
    },
    regionController.getRegionsByCountryId
  );

  // Create region (admin only)
  fastify.post('/', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    const { name, code, description, country_id } = request.body;

    if (!name || !country_id) {
      return reply.status(400).send({ 
        success: false,
        message: 'Region name and country ID are required' 
      });
    }

    try {
      const { rows } = await fastify.pg.query(
        `INSERT INTO regions (name, code, description, country_id) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [name, code, description, country_id]
      );
      
      return reply.code(201).send({
        success: true,
        data: rows[0]
      });
    } catch (error) {
      console.error('Create region error:', error);
      
      if (error.code === '23505') { // Unique violation
        return reply.status(400).send({ 
          success: false,
          message: 'Region with this name already exists for the specified country' 
        });
      }
      
      if (error.code === '23503') { // Foreign key violation
        return reply.status(400).send({ 
          success: false,
          message: 'Invalid country ID' 
        });
      }
      
      return reply.status(500).send({ 
        success: false,
        message: 'Failed to create region',
        error: error.message 
      });
    }
  });
};

module.exports = regionRoutes;