// backend/src/routes/regions.js
module.exports = async function (fastify, options) {
  // Get all regions
  fastify.get('/', {
    preValidation: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { rows } = await fastify.pg.query(`
        SELECT id, name, created_at 
        FROM regions 
        ORDER BY name
      `);
      return rows;
    } catch (error) {
      console.error('Get regions error:', error);
      return reply.status(500).send({ message: 'Failed to fetch regions' });
    }
  });

  // Create region (admin only)
  fastify.post('/', {
    preValidation: [fastify.authenticate, fastify.authorize(['admin'])]
  }, async (request, reply) => {
    const { name } = request.body;

    if (!name) {
      return reply.status(400).send({ message: 'Region name is required' });
    }

    try {
      const { rows } = await fastify.pg.query(
        'INSERT INTO regions (name) VALUES ($1) RETURNING *',
        [name]
      );
      
      return reply.code(201).send(rows[0]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        return reply.status(400).send({ message: 'Region already exists' });
      }
      console.error('Create region error:', error);
      return reply.status(500).send({ message: 'Failed to create region' });
    }
  });
};