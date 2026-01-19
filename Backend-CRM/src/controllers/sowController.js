// src/controllers/sowController.js
const { getClient } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

const ensureUploadsDir = async () => {
  const uploadsDir = path.join(__dirname, '../../uploads/sow-documents');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return uploadsDir;
};

const createSOW = async (request, reply) => {
    const client = await getClient();
    let sowResult;

    try {
        await client.query('BEGIN');
        const uploadsDir = await ensureUploadsDir();
        const parts = request.parts();
        const files = [];
        let fields = {
            sow_title: null,
            opportunity_id: null,
            rfb_id: null,
            user_id: null,
            release_version: null,
            contract_currency: 'USD',
            contract_value: 0,
            target_kickoff_date: null,
            linked_proposal_reference: null,
            scope_overview: null
        };

        // Process multipart form data
        for await (const part of parts) {
            if (part.file) {
                // Handle file upload
                const filename = `${uuidv4()}${path.extname(part.filename)}`;
                const filepath = path.join(uploadsDir, filename);
                
                await fs.writeFile(filepath, await part.toBuffer());
                
                files.push({
                    original_filename: part.filename,
                    stored_filename: filename,
                    mime_type: part.mimetype,
                    size: part.file.bytesRead
                });
            } else {
                // Handle form fields
                fields[part.fieldname] = part.value;
            }
        }

        // Validate required fields
        const requiredFields = ['sow_title', 'opportunity_id', 'rfb_id', 'user_id'];
        const missingFields = requiredFields.filter(field => !fields[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Create SOW
        const insertSOWQuery = `
            INSERT INTO sows (
                opportunity_id, rfb_id, user_id,
                sow_title, release_version, contract_currency,
                contract_value, target_kickoff_date,
                linked_proposal_reference, scope_overview
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING sow_id, sow_title, opportunity_id, rfb_id, user_id, created_at
        `;

        const sowValues = [
            fields.opportunity_id,
            fields.rfb_id,
            fields.user_id,
            fields.sow_title,
            fields.release_version,
            fields.contract_currency,
            fields.contract_value,
            fields.target_kickoff_date,
            fields.linked_proposal_reference,
            fields.scope_overview
        ];

        console.log('Creating SOW with values:', {
            opportunity_id: fields.opportunity_id,
            rfb_id: fields.rfb_id,
            user_id: fields.user_id,
            sow_title: fields.sow_title,
            contract_currency: fields.contract_currency,
            contract_value: fields.contract_value
        });

        console.log('Executing SOW insert with values:', sowValues);
        const result = await client.query(insertSOWQuery, sowValues);
        
        if (!result.rows || result.rows.length === 0) {
            throw new Error('No rows returned from SOW creation');
        }
        
        sowResult = result.rows[0];
        console.log('SOW created successfully. Result:', sowResult);
        
        // Use sow_id instead of id
        if (!sowResult || !sowResult.sow_id) {
            throw new Error('No valid sow_id returned after SOW creation');
        }
        
        // Insert document records if files were uploaded
        if (files.length > 0) {
            for (const file of files) {
                await client.query(
                    `INSERT INTO sow_documents (
                        sow_id,
                        original_filename,
                        stored_filename,
                        mime_type,
                        size,
                        uploaded_by
                    ) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        sowResult.sow_id,
                        file.original_filename,
                        file.stored_filename,
                        file.mime_type,
                        file.size,
                        fields.user_id
                    ]
                );
            }
        }

        await client.query('COMMIT');
        
        // Get the created SOW with its documents
        const { rows } = await client.query(`
            SELECT s.*, 
                   (SELECT json_agg(json_build_object(
                       'id', d.id,
                       'original_filename', d.original_filename,
                       'mime_type', d.mime_type,
                       'size', d.size,
                       'created_at', d.created_at
                   )) FILTER (WHERE d.id IS NOT NULL) 
                   FROM sow_documents d 
                   WHERE d.sow_id = s.sow_id) as documents
            FROM sows s
            WHERE s.sow_id = $1
        `, [sowResult.sow_id]);
        
        const createdSOW = rows[0];
        if (!createdSOW) {
            throw new Error('Failed to retrieve created SOW');
        }

        reply.status(201).send({
            success: true,
            message: 'SOW created successfully',
            data: createdSOW
        });

    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
            console.error('Error rolling back transaction:', rollbackError);
        });
        
        console.error('Error in createSOW:', error);
        
        if (!reply.sent) {
            reply.status(500).send({
                success: false,
                error: 'Failed to create SOW',
                message: error.message
            });
        }
    } finally {
        try {
            client.release();
        } catch (releaseError) {
            console.error('Error releasing client:', releaseError);
        }
    }
};

const listSOWs = async (request, reply) => {
    const client = await getClient();
    
    try {
        // Get query parameters with defaults
        const {
            page = 1,
            limit = 10,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            opportunity_id,
            rfb_id,
            user_id,
            search
        } = request.query;

        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // Start building the query
        let query = `
            SELECT 
                s.*,
                (SELECT json_agg(json_build_object(
                    'id', d.id,
                    'original_filename', d.original_filename,
                    'mime_type', d.mime_type,
                    'size', d.size,
                    'created_at', d.created_at
                )) FILTER (WHERE d.id IS NOT NULL) 
                FROM sow_documents d 
                WHERE d.sow_id = s.sow_id) as documents
            FROM sows s
            WHERE 1=1
        `;

        const queryParams = [];
        let paramCount = 1;

        // Add filters
        if (opportunity_id) {
            query += ` AND s.opportunity_id = $${paramCount++}`;
            queryParams.push(opportunity_id);
        }
        if (rfb_id) {
            query += ` AND s.rfb_id = $${paramCount++}`;
            queryParams.push(rfb_id);
        }
        if (user_id) {
            query += ` AND s.user_id = $${paramCount++}`;
            queryParams.push(user_id);
        }
        if (search) {
            query += ` AND (s.sow_title ILIKE $${paramCount} OR s.scope_overview ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        // Add sorting
        const validSortColumns = ['sow_id', 'sow_title', 'created_at', 'contract_value', 'opportunity_id', 'rfb_id'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${sortColumn} ${order}`;

        // Add pagination
        query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        queryParams.push(limit, offset);

        // Execute the query
        const { rows } = await client.query(query, queryParams);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) FROM sows s WHERE 1=1';
        const countParams = [];
        paramCount = 1;

        if (opportunity_id) {
            countQuery += ` AND s.opportunity_id = $${paramCount++}`;
            countParams.push(opportunity_id);
        }
        if (rfb_id) {
            countQuery += ` AND s.rfb_id = $${paramCount++}`;
            countParams.push(rfb_id);
        }
        if (user_id) {
            countQuery += ` AND s.user_id = $${paramCount++}`;
            countParams.push(user_id);
        }
        if (search) {
            countQuery += ` AND (s.sow_title ILIKE $${paramCount} OR s.scope_overview ILIKE $${paramCount})`;
            countParams.push(`%${search}%`);
        }

        const countResult = await client.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(total / limit);

        // Return the response
        return {
            success: true,
            data: rows,
            pagination: {
                total,
                totalPages,
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        };

    } catch (error) {
        console.error('Error listing SOWs:', error);
        reply.status(500).send({
            success: false,
            error: 'Failed to list SOWs',
            message: error.message
        });
    } finally {
        try {
            client.release();
        } catch (releaseError) {
            console.error('Error releasing client:', releaseError);
        }
    }
};

// Update the exports at the bottom of the file
module.exports = {
    createSOW,
    listSOWs
    // getSOWsByOpportunity,
    // updateSOW
};