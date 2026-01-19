const Region = require('../models/region.model');

const regionController = {
  /**
   * Get all regions
   * @param {Object} request
   * @param {Object} reply
   */
  async getRegions(request, reply) {
    try {
      const regions = await Region.getAll();
      return reply.send({
        success: true,
        data: regions,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Error fetching regions',
        error: error.message,
      });
    }
  },

  /**
   * Get regions by country ID
   * @param {Object} request
   * @param {Object} reply
   */
  async getRegionsByCountryId(request, reply) {
    try {
      const { countryId } = request.params;
      
      // Validate countryId is a number
      if (isNaN(countryId)) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid country ID',
        });
      }

      const regions = await Region.getByCountryId(countryId);
      
      return reply.send({
        success: true,
        data: regions,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: 'Error fetching regions',
        error: error.message,
      });
    }
  },
};

module.exports = regionController;
