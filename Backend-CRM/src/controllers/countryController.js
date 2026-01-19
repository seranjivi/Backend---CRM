const Country = require('../models/country.model');

const countryController = {
  /**
   * Get all countries
   * @param {Object} request
   * @param {Object} reply
   */
  async getCountries(request, reply) {
    try {
      const countries = await Country.findAll();
      return reply.send({
        success: true,
        data: countries,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Error fetching countries',
        error: error.message,
      });
    }
  },

  /**
   * Get country by ID
   * @param {Object} request
   * @param {Object} reply
   */
  async getCountryById(request, reply) {
    try {
      const { id } = request.params;
      const country = await Country.findById(id);
      
      if (!country) {
        return reply.status(404).send({
          success: false,
          message: 'Country not found',
        });
      }
      
      return reply.send({
        success: true,
        data: country,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Error fetching country',
        error: error.message,
      });
    }
  },
};

module.exports = countryController;
