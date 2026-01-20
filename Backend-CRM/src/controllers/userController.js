const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Helper function to generate JWT token
const generateToken = (fastify, user) => {
  return fastify.jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role_id: user.role_id 
    },
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '1d' 
    }
  );
};

// Register a new user
exports.register = async (fastify, request) => {
  const { full_name: fullName, email, role: roleName = 'User', status = 'active', regionIds = [] } = request.body;
  const password = 'Admin@123'; // Auto-generate default password
  
  // Validate required fields
  if (!fullName || !email) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Full name and email are required'
    });
  }

  try {
    // Check if user already exists
    const { rows: [existingUser] } = await fastify.pg.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser) {
      throw { 
        statusCode: 400,
        error: 'Bad Request',
        message: 'Email already in use'
      };
    }

    // Get role ID from role name
    const { rows: [role] } = await fastify.pg.query(
      'SELECT id FROM roles WHERE name = $1',
      [roleName]
    );

    if (!role) {
      throw {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid role specified. Valid roles are: admin, user, etc.'
      };
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Start transaction
    const client = await fastify.pg.connect();
    try {
      await client.query('BEGIN');
      
      // Insert user and get role name in the same query
      const { rows: [user] } = await client.query(
        `WITH new_user AS (
          INSERT INTO users (full_name, email, password_hash, role_id, status)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, full_name, email, role_id, status, created_at
        )
        SELECT 
          u.id, 
          u.full_name, 
          u.email, 
          u.role_id,
          r.name as role,
          u.status, 
          u.created_at
        FROM new_user u
        JOIN roles r ON u.role_id = r.id`,
        [fullName, email, hashedPassword, role.id, status]
      );

      // If regions are provided, add user-region associations
      if (regionIds && regionIds.length > 0) {
        const values = regionIds.map((_, i) => `($${i * 2 + 6}, $${i * 2 + 7})`).join(',');
        const params = regionIds.flatMap(regionId => [user.id, regionId]);
        
        await client.query(
          `INSERT INTO user_regions (user_id, region_id) 
           VALUES ${values}`,
          params
        );
      }

      await client.query('COMMIT');
      
      // Generate token
      const token = generateToken(fastify, { 
        id: user.id,
        email: user.email,
        role_id: user.role_id
      });

      // Return the user data with role from the query
      return {
        ...user,
        role: user.role ,  // Role comes from the query
        role_id: user.role_id,      // Role ID from the query
        token,
        temporaryPassword: 'Admin@123',
        note: 'Please change the default password on first login.'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Registration error:', error);
    throw error;  // Throw the error to be handled by the route
  }
};

// Login user
exports.login = async (fastify, request, reply) => {
  const { email, password } = request.body;
  
  try {
    // Find user by email with required fields
    const { rows: [user] } = await fastify.pg.query(
      `SELECT id, email, password_hash, role_id, full_name, status 
       FROM users 
       WHERE email = $1`,
      [email]
    );
    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);    
    if (!isPasswordValid) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(fastify, {
      id: user.id,
      email: user.email,
      role_id: user.role_id
    });

    // Remove sensitive data from response
    const { password_hash, ...userWithoutPassword } = user;

    return reply.status(200).send({
      statusCode: 200,
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to login'
    });
  }
};

// Get all users (admin only)
exports.getUsers = async (fastify, request, reply) => {
  try {
    const { rows: users } = await fastify.pg.query(`
      SELECT 
        u.id, 
        u.full_name, 
        u.email, 
        u.status, 
        u.created_at, 
        u.updated_at,
        r.name as role,
        COALESCE(
          (SELECT json_agg(reg.name) 
           FROM user_regions ur
           JOIN regions reg ON ur.region_id = reg.id
           WHERE ur.user_id = u.id),
          '[]'::json
        ) as regions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);
    
    return users;
  } catch (error) {
    console.error('Get users error:', error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to fetch users'
    });
  }
};

// Get user by ID (admin only)
exports.getUser = async (fastify, request, reply) => {
  const { id } = request.params;
  
  try {
    const { rows: [user] } = await fastify.pg.query(`
      SELECT 
        u.*, 
        r.name as role_name,
        array_agg(reg.name) as region_names,
        array_agg(ur.region_id) as region_ids
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_regions ur ON u.id = ur.user_id
      LEFT JOIN regions reg ON ur.region_id = reg.id
      WHERE u.id = $1
      GROUP BY u.id, r.id
    `, [id]);

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found'
      });
    }

    // Remove sensitive data
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Get user error:', error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to fetch user'
    });
  }
};

// Update user (admin or self)
exports.updateUser = async (fastify, request, reply) => {
  const { id } = request.params;
  const { fullName, email, roleId, status, regionIds } = request.body;
  const { user: currentUser } = request;

  try {
    // Check if user exists
    const { rows: [existingUser] } = await fastify.pg.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (!existingUser) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found'
      });
    }

    // Check permissions (admin or self)
    if (currentUser.id !== id && currentUser.role_id !== 1) { // 1 is admin role ID
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You are not authorized to update this user'
      });
    }

    // Start transaction
    const client = await fastify.pg.connect();
    try {
      await client.query('BEGIN');
      
      // Update user
      const updateFields = [];
      const values = [id];
      let paramCount = 1;

      if (fullName) {
        paramCount++;
        updateFields.push(`full_name = $${paramCount}`);
        values.push(fullName);
      }

      if (email && email !== existingUser.email) {
        // Check if new email is already in use
        const { rows: [emailUser] } = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (emailUser) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Email already in use'
          });
        }

        paramCount++;
        updateFields.push(`email = $${paramCount}`);
        values.push(email);
      }

      // Only admin can change role and status
      if (currentUser.role_id === 1) {
        if (roleId) {
          paramCount++;
          updateFields.push(`role_id = $${paramCount}`);
          values.push(roleId);
        }

        if (status) {
          paramCount++;
          updateFields.push(`status = $${paramCount}`);
          values.push(status);
        }
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`;
        await client.query(query, values);
      }

      // Update regions if provided and user is admin
      if (Array.isArray(regionIds) && currentUser.role_id === 1) {
        // Delete existing regions
        await client.query('DELETE FROM user_regions WHERE user_id = $1', [id]);
        
        // Add new regions if any
        if (regionIds.length > 0) {
          const regionValues = regionIds.map(regionId => `('${id}', ${regionId})`).join(',');
          await client.query(
            `INSERT INTO user_regions (user_id, region_id) 
             VALUES ${regionValues}`
          );
        }
      }

      await client.query('COMMIT');
      
      // Return updated user
      const { rows: [updatedUser] } = await client.query(
        `SELECT u.*, r.name as role_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [id]
      );

      // Get regions if needed
      if (regionIds) {
        const { rows: regions } = await client.query(
          `SELECT r.id, r.name 
           FROM regions r
           JOIN user_regions ur ON r.id = ur.region_id
           WHERE ur.user_id = $1`,
          [id]
        );
        updatedUser.regions = regions;
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update user error:', error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to update user'
    });
  }
};

// Delete user (admin only)
exports.deleteUser = async (fastify, request, reply) => {
  const { id } = request.params;

  try {
    // Check if user exists
    const { rows: [user] } = await fastify.pg.query(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found'
      });
    }

    // Start transaction
    const client = await fastify.pg.connect();
    try {
      await client.query('BEGIN');
      
      // Delete user-region associations
      await client.query('DELETE FROM user_regions WHERE user_id = $1', [id]);
      
      // Delete user
      await client.query('DELETE FROM users WHERE id = $1', [id]);
      
      await client.query('COMMIT');
      
      return { 
        statusCode: 200,
        message: 'User deleted successfully' 
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Delete user error:', error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to delete user'
    });
  }
};
