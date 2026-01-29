const { getSalesPerformance } = require('../controllers/salesPerformanceController');

const salesPerformanceRoutes = async (fastify, options) => {
    fastify.get('/sales-performance', getSalesPerformance);
};

module.exports = salesPerformanceRoutes;
