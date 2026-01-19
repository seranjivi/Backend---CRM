const { countryListSchema, countryGetSchema } = require('../schemas/country.schema');
const countryController = require('../controllers/countryController');

async function countryRoutes(fastify, options) {
  // Get all countries
  fastify.get('/', 
    { schema: countryListSchema },
    countryController.getCountries
  );

  // Get country by ID
  fastify.get('/:id', 
    { schema: countryGetSchema },
    countryController.getCountryById
  );
}

module.exports = countryRoutes;
