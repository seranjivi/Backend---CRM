const { countryListSchema, countryGetSchema, countriesByRegionSchema } = require('../schemas/country.schema');
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

  // Get countries by region ID
  fastify.get('/by-region/:regionId',
    { schema: countriesByRegionSchema },
    countryController.getCountriesByRegionId
  );
}

module.exports = countryRoutes;
