const { query, getClient } = require('../config/db');

const createSOW = async (request, reply) => {
    const {
        opportunity_id,
        rfb_id,
        user_id,
        sow_title,
        release_version,
        contract_currency = 'USD',
        contract_value = 0,
        target_kickoff_date,
        linked_proposal_reference,
        scope_overview
    } = request.body;

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Create SOW - Removed client_id from the query
        const insertQuery = `
            INSERT INTO sows (
                opportunity_id, rfb_id, user_id,
                sow_title, release_version, contract_currency,
                contract_value, target_kickoff_date,
                linked_proposal_reference, scope_overview
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;

        const values = [
            opportunity_id,
            rfb_id,
            user_id,
            sow_title,
            release_version,
            contract_currency,
            contract_value,
            target_kickoff_date,
            linked_proposal_reference,
            scope_overview
        ];

        const result = await client.query(insertQuery, values);
        
        await client.query('COMMIT');
        
        reply.status(201).send({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating SOW:', error);
        reply.status(500).send({
            success: false,
            message: 'Error creating SOW',
            error: error.message
        });
    } finally {
        client.release();
    }
};

const getSOWById = async (request, reply) => {
    try {
        const { id } = request.params;
        
        const queryText = `
            SELECT 
                s.*,
                c.client_name,
                o.opportunity_name,
                r.rfp_title,
                u.full_name as created_by_name
            FROM sows s
            JOIN clients c ON s.client_id = c.client_id
            JOIN opportunities o ON s.opportunity_id = o.id
            JOIN rfps r ON s.rfb_id = r.id
            JOIN users u ON s.user_id = u.id
            WHERE s.sow_id = $1
        `;
        
        const result = await query(queryText, [id]);
        
        if (result.rows.length === 0) {
            return reply.status(404).send({
                success: false,
                message: 'SOW not found'
            });
        }
        
        reply.send({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching SOW:', error);
        reply.status(500).send({
            success: false,
            message: 'Error fetching SOW',
            error: error.message
        });
    }
};

const getSOWsByOpportunity = async (request, reply) => {
    try {
        const { opportunityId } = request.params;
        
        const queryText = `
            SELECT 
                s.*,
                c.client_name,
                o.opportunity_name,
                r.rfp_title,
                u.full_name as created_by_name
            FROM sows s
            JOIN clients c ON s.client_id = c.client_id
            JOIN opportunities o ON s.opportunity_id = o.id
            JOIN rfps r ON s.rfb_id = r.id
            JOIN users u ON s.user_id = u.id
            WHERE s.opportunity_id = $1
            ORDER BY s.created_at DESC
        `;
        
        const result = await query(queryText, [opportunityId]);
        
        reply.send({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching SOWs:', error);
        reply.status(500).send({
            success: false,
            message: 'Error fetching SOWs',
            error: error.message
        });
    }
};

const updateSOW = async (request, reply) => {
    const { id } = request.params;
    const {
        sow_title,
        release_version,
        contract_currency,
        contract_value,
        target_kickoff_date,
        linked_proposal_reference,
        scope_overview,
        sow_status
    } = request.body;

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Check if SOW exists
        const checkQuery = `
            SELECT sow_status 
            FROM sows 
            WHERE sow_id = $1 
            FOR UPDATE
        `;
        const checkResult = await client.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return reply.status(404).send({
                success: false,
                message: 'SOW not found'
            });
        }

        // Update SOW
        const updateQuery = `
            UPDATE sows
            SET 
                sow_title = COALESCE($1, sow_title),
                release_version = COALESCE($2, release_version),
                contract_currency = COALESCE($3, contract_currency),
                contract_value = COALESCE($4, contract_value),
                target_kickoff_date = COALESCE($5, target_kickoff_date),
                linked_proposal_reference = COALESCE($6, linked_proposal_reference),
                scope_overview = COALESCE($7, scope_overview),
                sow_status = COALESCE($8, sow_status),
                updated_at = CURRENT_TIMESTAMP
            WHERE sow_id = $9
            RETURNING *
        `;

        const values = [
            sow_title,
            release_version,
            contract_currency,
            contract_value,
            target_kickoff_date,
            linked_proposal_reference,
            scope_overview,
            sow_status,
            id
        ];

        const result = await client.query(updateQuery, values);
        
        if (result.rows.length === 0) {
            return reply.status(404).send({
                success: false,
                message: 'SOW not found'
            });
        }
        
        await client.query('COMMIT');
        
        reply.send({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating SOW:', error);
        reply.status(500).send({
            success: false,
            message: 'Error updating SOW',
            error: error.message
        });
    } finally {
        client.release();
    }
};

const listSOWs = async (request, reply) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            sortBy = 'created_at', 
            sortOrder = 'desc',
            status,
            opportunity_id,
            rfb_id,
            user_id,
            search
        } = request.query;

        const offset = (page - 1) * limit;

        // Build the WHERE clause
        const whereConditions = [];
        const queryParams = [];
        let paramIndex = 1;

        if (status) {
            whereConditions.push(`s.sow_status = $${paramIndex++}`);
            queryParams.push(status);
        }

        if (opportunity_id) {
            whereConditions.push(`s.opportunity_id = $${paramIndex++}`);
            queryParams.push(opportunity_id);
        }

        if (rfb_id) {
            whereConditions.push(`s.rfb_id = $${paramIndex++}`);
            queryParams.push(rfb_id);
        }

        if (user_id) {
            whereConditions.push(`s.user_id = $${paramIndex++}`);
            queryParams.push(user_id);
        }

        if (search) {
            whereConditions.push(`
                (s.sow_title ILIKE $${paramIndex} OR 
                 s.scope_overview ILIKE $${paramIndex} OR
                 o.opportunity_name ILIKE $${paramIndex})
            `);
            queryParams.push(`%${search}%`);
        }

        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}` 
            : '';

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) 
            FROM sows s
            LEFT JOIN opportunities o ON s.opportunity_id = o.id
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(total / limit);

        // Get paginated results
        const queryText = `
            SELECT 
                s.*,
                o.opportunity_name,
                r.title,
                u.full_name as created_by_name
            FROM sows s
            LEFT JOIN opportunities o ON s.opportunity_id = o.id
            LEFT JOIN rfps r ON s.rfb_id = r.id
            LEFT JOIN users u ON s.user_id = u.id
            ${whereClause}
            ORDER BY s.${sortBy} ${sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;

        const result = await query(
            queryText, 
            [...queryParams, limit, offset]
        );

        reply.send({
            success: true,
            data: result.rows,
            pagination: {
                total,
                totalPages,
                currentPage: page,
                pageSize: limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error listing SOWs:', error);
        reply.status(500).send({
            success: false,
            message: 'Error listing SOWs',
            error: error.message
        });
    }
};
module.exports = {
    createSOW,
    getSOWById,
    getSOWsByOpportunity,
    updateSOW,
    listSOWs
};
