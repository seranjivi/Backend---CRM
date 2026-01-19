const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

// Update opportunity's approval stage
const updateOpportunityApprovalStage = async (client, opportunityId, stage) => {
  try {
    await client.query(
      'UPDATE opportunities SET approval_stage = $1 WHERE id = $2',
      [stage, opportunityId]
    );
    console.log(`Updated opportunity ${opportunityId} approval stage to ${stage}`);
  } catch (error) {
    console.error('Error updating opportunity approval stage:', error);
    throw error;
  }
};

const getRFPByOpportunityId = async (fastify, request, reply) => {
  let client;
  try {
    const { opportunityId } = request.params;
    client = await fastify.pg.connect();
    
    // Get RFP details
    const rfpQuery = `
      SELECT 
        r.id,
        r.title as "rfpTitle",
        r.status as "rfpStatus",
        r.submission_deadline as "submissionDeadline",
        r.bid_manager as "bidManager",
        r.submission_mode as "submissionMode",
        r.portal_url as "portalUrl",
        r.created_at as "createdOn",
        r.opportunity_id as "opportunityId",
        o.opportunity_name as "opportunityName",
        u.full_name as "createdBy"
      FROM rfps r
      LEFT JOIN opportunities o ON r.opportunity_id = o.id
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.opportunity_id = $1
      ORDER BY r.created_at DESC
      LIMIT 1
    `;
    
    const rfpResult = await client.query(rfpQuery, [opportunityId]);
    
    if (rfpResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message: 'No RFP found for this opportunity'
      });
    }
    const rfp = rfpResult.rows[0];
    // Get associated documents
    const documentsResult = await client.query(
      `SELECT 
        id, 
        original_filename as "originalFilename",
        stored_filename as "storedFilename",
        mime_type as "mimeType",
        size,
        created_at as "createdAt"
       FROM rfp_documents 
       WHERE rfp_id = $1
       ORDER BY created_at DESC`,
      [rfp.id]
    );
    return {
      success: true,
      data: {
        ...rfp,
        documents: documentsResult.rows
      }
    };
  } catch (error) {
    console.error('Error fetching RFP by opportunity ID:', error);
    reply.status(500).send({ 
      success: false, 
      error: 'Failed to fetch RFP',
      message: error.message 
    });
  } finally {
    if (client) client.release();
  }
};

// Ensure uploads directory exists
const ensureUploadsDir = async () => {
  const uploadsDir = path.join(__dirname, '../../uploads');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return uploadsDir;
};

const createRFP = async (fastify, request, reply) => {
  let client;
  let fields = { 
    title: null,
    status: null, // Status will be set from request or default to 'draft' in query
    submissionDeadline: null,
    bidManager: null,
    submissionMode: null,
    portalUrl: null,
    opportunityId: null
  };
  const files = [];
  
  try {
    client = await fastify.pg.connect();
    await client.query('BEGIN');
    
    // Process request based on content type
    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.file) {
          // Handle file upload
          const filename = `${uuidv4()}${path.extname(part.filename)}`;
          const filepath = path.join(await ensureUploadsDir(), filename);
          await fs.writeFile(filepath, await part.toBuffer());
          
          files.push({
            filename: part.filename,
            storedFilename: filename,
            mimetype: part.mimetype,
            path: filepath,
            size: (await fs.stat(filepath)).size
          });
        } else {
          // Handle form fields
          fields[part.fieldname] = part.value;
        }
      }
    } else {
      // Handle JSON body and map rfpStatus to status
      fields = { 
        ...fields, 
        ...request.body,
        status: request.body.rfpStatus || request.body.status // Map rfpStatus to status
      };
    }

    // Validate required fields including opportunityId
    if (!fields.opportunityId) {
      throw new Error('Opportunity ID is required');
    }

    // Insert RFP into database with opportunity_id
    const rfpResult = await client.query(
      `INSERT INTO rfps (
        title, 
        status, 
        submission_deadline, 
        bid_manager, 
        submission_mode, 
        portal_url,
        created_by,
        opportunity_id
      ) VALUES ($1, COALESCE($2, 'draft'), $3, $4, $5, $6, $7, $8) 
      RETURNING id, title, status, submission_deadline, created_at, opportunity_id`,
      [
        fields.title,
        fields.status,
        fields.submissionDeadline ? new Date(fields.submissionDeadline) : null,
        fields.bidManager,
        fields.submissionMode,
        fields.portalUrl,
        request.user?.id,
        fields.opportunityId
      ]
    );

    // If status is 'Submitted', update opportunity approval stage to LEVEL_2_SOW
    if (fields.status === 'Submitted' && fields.opportunityId) {
      await updateOpportunityApprovalStage(client, fields.opportunityId, 'LEVEL_2_SOW');
    }

    const rfp = rfpResult.rows[0];

    // Save file references to database
    for (const file of files) {
      await client.query(
        `INSERT INTO rfp_documents (
          rfp_id, 
          original_filename, 
          stored_filename, 
          mime_type, 
          size
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          rfp.id,
          file.filename,
          file.storedFilename,
          file.mimetype,
          file.size
        ]
      );
    }

    await client.query('COMMIT');

    // Get the created RFP with opportunity details
    const { rows: [createdRFP] } = await client.query(`
      SELECT 
        r.id,
        r.title as "rfpTitle",
        r.status as "rfpStatus",
        r.submission_deadline as "submissionDeadline",
        r.created_at as "createdOn"
      FROM rfps r
      JOIN users u ON r.created_by = u.id
      LEFT JOIN opportunities o ON r.opportunity_id = o.id
      WHERE r.id = $1
    `, [rfp.id]);

    return {
      status: 'success',
      message: 'RFP created successfully',
      data: {
        ...createdRFP,
        files: files.map(f => ({
          originalName: f.filename,
          storedName: f.storedFilename,
          mimeType: f.mimetype,
          size: f.size
        }))
      }
    };

  } catch (error) {
    console.error('RFP creation error:', error);
    if (client) await client.query('ROLLBACK');
    
    // Cleanup uploaded files if there was an error
    try {
      for (const file of files) {
        await fs.unlink(file.path).catch(console.error);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up files:', cleanupError);
    }
    
    // Handle foreign key constraint violation
    if (error.code === '23503' && error.constraint === 'rfps_opportunity_id_fkey') {
      return reply.status(400).send({
        success: false,
        error: 'Invalid Opportunity',
        message: 'The specified opportunity does not exist'
      });
    }

    reply.status(500).send({ 
      success: false, 
      error: 'Failed to create RFP',
      message: error.message 
    });
  } finally {
    if (client) client.release();
  }
};

// Get all RFPs
const getAllRFPs = async (fastify, request, reply) => {
  let client;
  try {
    client = await fastify.pg.connect();
    const { rows } = await client.query(`
      SELECT 
        r.id,
        COALESCE(o.opportunity_name, 'No Opportunity') as "opportunityName",
        r.title as "rfpTitle",
        r.status as "rfpStatus",
        r.submission_deadline as "submissionDeadline",
        r.created_at as "createdOn"
      FROM rfps r
      JOIN users u ON r.created_by = u.id
      LEFT JOIN opportunities o ON r.opportunity_id = o.id
      ORDER BY r.created_at DESC
    `);
    
    // For each RFP, get associated files
    const rfpsWithFiles = await Promise.all(rows.map(async (rfp) => {
      // In src/controllers/rfpController.js, update the files query to use 'mime_type' instead of 'mimetype'
const files = await client.query(
  'SELECT id, original_filename, stored_filename, mime_type, size FROM rfp_documents WHERE rfp_id = $1',
  [rfp.id]
);
      return {
        ...rfp,
        files: files.rows
      };
    }));

    return { 
      success: true, 
      count: rfpsWithFiles.length,
      data: rfpsWithFiles 
    };
  } catch (error) {
    console.error('Error fetching RFPs:', error);
    reply.status(500).send({ 
      success: false, 
      error: 'Failed to fetch RFPs',
      message: error.message 
    });
  } finally {
    if (client) client.release();
  }
};

// Error handling middleware for RFP routes
const handleRFPError = (error, request, reply) => {
  console.error('RFP Error:', error);
  
  // Handle specific error cases
  if (error.code === '23503' && error.constraint === 'rfps_opportunity_id_fkey') {
    return reply.status(400).send({
      success: false,
      error: 'Invalid Opportunity',
      message: 'The specified opportunity does not exist'
    });
  }

  reply.status(500).send({ 
    success: false,
    error: 'Failed to process RFP',
    message: error.message 
  });
};

module.exports = {
  createRFP,
  getAllRFPs,
  handleRFPError,
  getRFPByOpportunityId, 

};