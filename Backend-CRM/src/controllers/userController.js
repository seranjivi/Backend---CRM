const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Helper function to generate JWT token
const generateToken = (fastify, user) => {
  return fastify.jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      roles: user.roles || []  // Include all roles in the token
    },
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '1d' 
    }
  );
};

// Register a new user
exports.register = async (fastify, request) => {
  const { full_name: fullName, email, roles = ['User'], status = 'active', regionIds = [] } = request.body;
  const password = 'Admin@123'; // Auto-generate default password
  
  // Validate required fields
  if (!fullName || !email) {
    throw fastify.httpErrors.badRequest('Full name and email are required');
  }

  try {
    // Check if user already exists
    const { rows: [existingUser] } = await fastify.pg.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser) {
      throw fastify.httpErrors.badRequest('Email already in use');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Start transaction
    const client = await fastify.pg.connect();
    try {
      await client.query('BEGIN');
      
      // Insert user
      const { rows: [user] } = await client.query(
        `INSERT INTO users (full_name, email, password_hash, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, email, status, created_at`,
        [fullName, email, hashedPassword, status]
      );

      // Add roles to user_roles
      if (roles && roles.length > 0) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, r.id FROM roles r 
           WHERE r.name = ANY($2::text[]) 
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [user.id, roles]
        );
      }

      // Handle regions if needed
      if (regionIds && regionIds.length > 0) {
        const regionValues = regionIds.map((_, i) => `($1, $${i + 2})`).join(',');
        const regionParams = [user.id, ...regionIds];
        
        await client.query(
          `INSERT INTO user_regions (user_id, region_id) 
           VALUES ${regionValues}`,
          regionParams
        );
      }

      await client.query('COMMIT');

      // Get user with roles
      const { rows: [userWithRoles] } = await fastify.pg.query(`
        SELECT 
          u.*,
          ARRAY_REMOVE(ARRAY_AGG(r.name), NULL) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        WHERE u.id = $1
        GROUP BY u.id
      `, [user.id]);

      // Generate token with all roles
      const token = generateToken(fastify, { 
        id: userWithRoles.id,
        email: userWithRoles.email,
        roles: userWithRoles.roles
      });

      // Remove sensitive data
      const { password_hash, ...userWithoutPassword } = userWithRoles;

      return {
        ...userWithoutPassword,
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
    throw error;
  }
};

// Login user
exports.login = async (fastify, request, reply) => {
  const { email, password } = request.body;
  
  try {
    // Find user by email with roles
    const { rows: [user] } = await fastify.pg.query(`
      SELECT 
        u.*,
        ARRAY_REMOVE(ARRAY_AGG(r.name), NULL) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.email = $1
      GROUP BY u.id
    `, [email]);

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

    // Generate token with all roles
    const token = generateToken(fastify, {
      id: user.id,
      email: user.email,
      roles: user.roles
    });

    // Remove sensitive data
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
exports.getUsers = async (fastify, request) => {
  try {
    const { rows: users } = await fastify.pg.query(`
      SELECT 
        u.id, 
        u.full_name, 
        u.email, 
        u.status, 
        u.created_at, 
        u.updated_at,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.name), NULL) as roles,
        COALESCE(
          (SELECT json_agg(reg.name) 
           FROM user_regions ur
           JOIN regions reg ON ur.region_id = reg.id
           WHERE ur.user_id = u.id),
          '[]'::json
        ) as regions
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id, u.full_name, u.email, u.status, u.created_at, u.updated_at
      ORDER BY u.created_at DESC
    `);

    return {
      status: 'success',
      results: users.length,
      data: {
        users: users.map(user => ({
          ...user,
          roles: user.roles || []
        }))
      }
    };
  } catch (error) {
    console.error('Error fetching users:', error);
    throw new Error('Failed to fetch users: ' + error.message);
  }
};

// Get user by ID (admin only)
// Get user by ID with roles
exports.getUser = async (fastify, request, reply) => {
  const { id } = request.params;
  
  try {
    const { rows: [user] } = await fastify.pg.query(`
      SELECT 
        u.*,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.name), NULL) as roles,
        COALESCE(
          (SELECT json_agg(json_build_object('id', reg.id, 'name', reg.name))
           FROM user_regions ur
           JOIN regions reg ON ur.region_id = reg.id
           WHERE ur.user_id = u.id
           GROUP BY ur.user_id),
          '[]'::json
        ) as regions
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found'
      });
    }

    // Remove sensitive data
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Get user error:', error);
    throw error;
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
