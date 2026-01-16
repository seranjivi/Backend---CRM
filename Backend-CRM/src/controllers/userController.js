const bcrypt = require('bcrypt');

// In src/controllers/userController.js
exports.createUser = async (fastify, request, reply) => {
  const { full_name, email, password, role = 'user', regions = [] } = request.body;
  
  try {
    // Check if user already exists
    const { rows: existingUser } = await fastify.pg.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.length > 0) {
      return reply.status(400).send({ 
        statusCode: 400,
        error: 'Bad Request',
        message: 'Email already in use'
      });
    }

    // Temporarily store password in plain text
    // TODO: Re-enable password hashing in production
    const password_hash = password; // Store plain text password for now

    // Start transaction
    const client = await fastify.pg.connect();
    try {
      await client.query('BEGIN');
      
      // Insert user
      const { rows: [user] } = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id, full_name, email, role, status, created_at`,
        [full_name, email, password_hash, role]
      );

      // If regions are provided, add user-region associations
      if (regions && regions.length > 0) {
        const regionValues = regions.map(regionId => `(${user.id}, ${regionId})`).join(',');
        await client.query(
          `INSERT INTO user_regions (user_id, region_id) 
           VALUES ${regionValues}`
        );
      }

      await client.query('COMMIT');
      
      // Remove password hash from response
      const { password_hash: _, ...userWithoutPassword } = user;
      
      return { 
        statusCode: 201,
        message: 'User created successfully',
        user: userWithoutPassword
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create user error:', error);
    return reply.status(500).send({ 
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to create user' 
    });
  }
};
