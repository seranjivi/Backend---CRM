const { getDashboardStats } = require('../controllers/dashboardController');

const dashboardRoutes = async (fastify, options) => {
  fastify.get('/dashboard/stats', getDashboardStats);
};

module.exports = dashboardRoutes;
