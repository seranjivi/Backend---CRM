/**
 * Opportunity Model
 * Represents sales opportunities in the system
 */
const Opportunity = (fastify) => ({
  // Get the database client
  get db() {
    return fastify.pg;
  },
  
  // Get the database pool
  get pool() {
    return fastify.pg;
  },

  // Get all opportunities
  async getAll() {
  try {
    // First try with the full query including joins
    try {
      const result = await this.db.query(`
        SELECT o.*, 
               u.name as user_name, 
               r.name as role_name 
        FROM opportunities o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN roles r ON o.role_id = r.id
        ORDER BY o.created_at DESC
      `);
      return result.rows;
    } catch (joinError) {
      console.warn('Could not fetch opportunities with joins, falling back to basic query:', joinError.message);
      
      // Fallback to basic query without joins
      const result = await this.db.query(`
        SELECT * FROM opportunities 
        ORDER BY created_at DESC
      `);
      return result.rows;
    }
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    throw error;
  }
},

  // Get opportunity by ID
  async getById(id) {
    try {
      // First try with the full query including joins
      try {
        const result = await this.db.query(`
          SELECT 
            o.*, 
            u.full_name as user_name, 
            r.name as role_name,
            so.full_name as sales_owner_name,
            tp.full_name as technical_poc_name,
            pp.full_name as presales_poc_name
          FROM opportunities o
          LEFT JOIN users u ON o.user_id = u.id
          LEFT JOIN roles r ON o.role_id = r.id
          LEFT JOIN users so ON o.sales_owner::integer = so.id
          LEFT JOIN users tp ON o.technical_poc::integer = tp.id
          LEFT JOIN users pp ON o.presales_poc::integer = pp.id
          WHERE o.id = $1
        `, [id]);
        
        if (result.rows && result.rows.length > 0) {
          const opportunity = result.rows[0];
          // Add the names to the response
          return {
            ...opportunity,
            sales_owner: opportunity.sales_owner ? parseInt(opportunity.sales_owner, 10) : null,
            technical_poc: opportunity.technical_poc ? parseInt(opportunity.technical_poc, 10) : null,
            presales_poc: opportunity.presales_poc ? parseInt(opportunity.presales_poc, 10) : null,
            sales_owner_name: opportunity.sales_owner_name || null,
            technical_poc_name: opportunity.technical_poc_name || null,
            presales_poc_name: opportunity.presales_poc_name || null
          };
        } else {
          console.log('[getById] No results from join query, trying basic query...');
        }
      } catch (joinError) {
        console.warn('[getById] Could not fetch opportunity with joins, falling back to basic query:', joinError.message);
      }
      
      // Fallback to basic query without joins
      const result = await this.db.query(
        'SELECT * FROM opportunities WHERE id = $1',
        [id]
      );
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error fetching opportunity with ID ${id}:`, error);
      throw error;
    }
  },

  // Create a new opportunity
  async create(opportunityData) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      
      const {
        opportunity_name,
        client_name,
        close_date,
        amount_currency = 'USD',
        amount,
        opportunity_type = null,
        lead_source = null,
        triaged_status = null,
        pipeline_status = null,
        win_probability = null,
        user_id = null,
        role_id = null,
        next_steps = null,
        sales_owner = null,
        technical_poc = null,
        presales_poc = null,
        start_date = null
      } = opportunityData;

 

      // First insert the opportunity
      const query = {
  text: `
    INSERT INTO opportunities (
      opportunity_name, client_name, close_date, amount_currency, amount,
      opportunity_type, lead_source, triaged_status, pipeline_status,
      win_probability, user_id, role_id, approval_stage,
      start_date, sales_owner, technical_poc, presales_poc, next_steps
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'LEVEL_1_RFB', 
             $13, $14, $15, $16, $17) 
    RETURNING *
  `,
  values: [
    opportunity_name,
    client_name,
    close_date,
    amount_currency,
    amount,
    opportunity_type,
    lead_source,
    triaged_status,
    pipeline_status,
    win_probability,
    user_id,
    role_id,
    opportunityData.start_date || null,        
    opportunityData.sales_owner || null,        
    opportunityData.technical_poc || null,      
    opportunityData.presales_poc || null,
    opportunityData.next_steps || null
  ]
};

      const insertResult = await client.query(query);

      if (!insertResult.rows || insertResult.rows.length === 0) {
        throw new Error('No data returned from database after insert');
      }

      const createdOpportunity = insertResult.rows[0];      
      // Now fetch the complete opportunity data
      const selectQuery = {
        text: 'SELECT * FROM opportunities WHERE id = $1',
        values: [createdOpportunity.id]
      };
      
      const selectResult = await client.query(selectQuery);      
      if (!selectResult.rows || selectResult.rows.length === 0) {
        throw new Error('Failed to fetch created opportunity');
      }
      
      await client.query('COMMIT');
      const finalOpportunity = selectResult.rows[0];
      return finalOpportunity;
    } catch (error) {
      console.error('Error in create opportunity transaction:', error);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
},

  // Update an opportunity
  async update(id, opportunityData) {
    const {
      opportunity_name,
      client_name,
      close_date,
      amount_currency,
      amount,
      opportunity_type,
      lead_source,
      triaged_status,
      pipeline_status,
      win_probability,
      user_id,
      role_id,
      start_date,
      sales_owner,
      technical_poc,
      presales_poc,
      next_steps
    } = opportunityData;

    try {
      const result = await this.db.query(
        `UPDATE opportunities SET
          opportunity_name = COALESCE($1, opportunity_name),
          client_name = COALESCE($2, client_name),
          close_date = COALESCE($3, close_date),
          amount_currency = COALESCE($4, amount_currency),
          amount = COALESCE($5, amount),
          opportunity_type = COALESCE($6, opportunity_type),
          lead_source = COALESCE($7, lead_source),
          triaged_status = COALESCE($8, triaged_status),
          pipeline_status = COALESCE($9, pipeline_status),
          win_probability = COALESCE($10, win_probability),
          user_id = COALESCE($11, user_id),
          role_id = COALESCE($12, role_id),
          start_date = COALESCE($13, start_date),
          sales_owner = COALESCE($14, sales_owner),
          technical_poc = COALESCE($15, technical_poc),
          presales_poc = COALESCE($16, presales_poc),
          next_steps = COALESCE($17, next_steps),
          updated_at = NOW()
        WHERE id = $18
        RETURNING *`,
        [
          opportunity_name,
          client_name,
          close_date,
          amount_currency,
          amount,
          opportunity_type,
          lead_source,
          triaged_status,
          pipeline_status,
          win_probability,
          user_id,
          role_id,
          start_date,
          sales_owner,
          technical_poc,
          presales_poc,
          next_steps,
          id
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating opportunity with ID ${id}:`, error);
      throw error;
    }
  },

  // Delete an opportunity
  async delete(id) {
    try {
      const result = await this.db.query(
        'DELETE FROM opportunities WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error(`Error deleting opportunity with ID ${id}:`, error);
      throw error;
    }
  },

  // Get opportunities by user ID
  async getByUserId(userId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM opportunities 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error(`Error fetching opportunities for user ${userId}:`, error);
      throw error;
    }
  },

  // Get opportunities by status
  async getByStatus(status) {
    try {
      const result = await this.db.query(
        `SELECT * FROM opportunities 
         WHERE pipeline_status = $1 
         ORDER BY created_at DESC`,
        [status]
      );
      return result.rows;
    } catch (error) {
      console.error(`Error fetching ${status} opportunities:`, error);
      throw error;
    }
  }
});

module.exports = Opportunity;
