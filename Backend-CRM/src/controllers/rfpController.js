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
    rfp_type: 'RFP',
    title: null,
    rfp_status: 'Draft',
    rfp_description: null,
    solution_description: null,
    submission_deadline: null,
    bid_manager: null,
    submission_mode: null,
    portal_url: null,
    question_submission_date: null,
    response_submission_date: null,
    comments: null,
    documents: {
      commercial: [],
      proposal: [],
      presentation: [],
      qa_document: [],  
      other: []
    },
    opportunity_id: null
  };
  const fileUploads = []; // To track uploaded files
  
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
          
          // Track file upload with its category
          const fileInfo = {
            filename: part.filename,
            storedFilename: filename,
            mimetype: part.mimetype,
            path: filepath,
            size: (await fs.stat(filepath)).size,
            category: part.fieldname.replace('documents.', '') || 'other'
          };
          
          fileUploads.push(fileInfo);
        } else {
          // Handle form fields
          if (part.fieldname === 'documents') {
            try {
              fields.documents = JSON.parse(part.value);
            } catch (e) {
              console.warn('Failed to parse documents JSON:', e);
            }
          } else {
            // Map field names to match database columns
            const dbFieldMap = {
              'rfpType': 'rfp_type',
              'rfpStatus': 'rfp_status',
              'rfpDescription': 'rfp_description',
              'solutionDescription': 'solution_description',
              'submissionDeadline': 'submission_deadline',
              'bidManager': 'bid_manager',
              'submissionMode': 'submission_mode',
              'portalUrl': 'portal_url',
              'questionSubmissionDate': 'question_submission_date',
              'responseSubmissionDate': 'response_submission_date',
              'opportunityId': 'opportunity_id'
            };
            
            const dbField = dbFieldMap[part.fieldname] || part.fieldname;
            fields[dbField] = part.value;
          }
        }
      }
    } else {
      // Handle JSON body
      fields = { 
        ...fields, 
        ...request.body,
        rfp_status: request.body.rfpStatus || request.body.rfp_status || 'Draft'
      };
    }

    // Validate required fields including opportunity_id
    if (!fields.opportunity_id) {
      throw new Error('Opportunity ID is required');
    }

    // Insert RFP into database with opportunity_id
    const rfpResult = await client.query(
      `INSERT INTO rfps (
        title,
        rfp_type,
        rfp_status,
        rfp_description,
        solution_description,
        submission_deadline,
        bid_manager,
        submission_mode,
        portal_url,
        question_submission_date,
        response_submission_date,
        comments,
        created_by,
        opportunity_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
      RETURNING *`,
      [
        fields.title || '',
        fields.rfp_type,
        fields.rfp_status,
        fields.rfp_description,
        fields.solution_description,
        fields.submission_deadline ? new Date(fields.submission_deadline) : null,
        fields.bid_manager,
        fields.submission_mode,
        fields.portal_url,
        fields.question_submission_date ? new Date(fields.question_submission_date) : null,
        fields.response_submission_date ? new Date(fields.response_submission_date) : null,
        fields.comments,
        request.user?.id,
        fields.opportunity_id
      ]
    );

    // If status is 'Submitted', update opportunity approval stage to LEVEL_2_SOW
    if (fields.rfp_status === 'Submitted' && fields.opportunity_id) {
      await updateOpportunityApprovalStage(client, fields.opportunity_id, 'LEVEL_2_SOW');
    }

    const rfp = rfpResult.rows[0];

    // Save file references to database
    for (const file of fileUploads) {
      await client.query(
        `INSERT INTO rfp_documents (
          rfp_id, 
          original_filename, 
          stored_filename, 
          mime_type, 
          size,
          document_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          rfp.id,
          file.filename,
          file.storedFilename,
          file.mimetype,
          file.size,
          file.category
        ]
      );
    }

    await client.query('COMMIT');

    // Get the complete RFP with all related data
    const { rows: [createdRFP] } = await client.query(`
      SELECT 
        r.*,
        o.opportunity_name,
        u.full_name as created_by_name
      FROM rfps r
      LEFT JOIN opportunities o ON r.opportunity_id = o.id
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.id = $1
    `, [rfp.id]);

    // Get all documents for this RFP
    const { rows: documents } = await client.query(`
      SELECT 
        id,
        original_filename,
        stored_filename,
        mime_type,
        size,
        document_type
      FROM rfp_documents
      WHERE rfp_id = $1
    `, [rfp.id]);

    // Group documents by type
    const documentsByType = documents.reduce((acc, doc) => {
      const type = doc.document_type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(doc);
      return acc;
    }, {});

    return {
      status: 'success',
      message: 'RFP created successfully',
      data: {
        ...createdRFP,
        documents: documentsByType
      }
    };

  } catch (error) {
    console.error('RFP creation error:', error);
    if (client) await client.query('ROLLBACK');
    
    // Cleanup uploaded files if there was an error
    for (const file of fileUploads) {
      try {
        await fs.unlink(file.path).catch(console.error);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    
    // Handle foreign key constraint violation
    if (error.code === '23503' && error.constraint === 'rfps_opportunity_id_fkey') {
      return reply.status(400).send({
        status: 'error',
        message: 'The specified opportunity does not exist'
      });
    }

    reply.status(500).send({ 
      status: 'error',
      message: 'Failed to create RFP',
      error: error.message 
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
const updateRFP = async (fastify, request, reply) => {
  let client;
  const fileUploads = []; // To track newly uploaded files
  const { id } = request.params;
  
  try {
    client = await fastify.pg.connect();
    await client.query('BEGIN');

    // Get existing RFP
    const existingRFP = await client.query(
      'SELECT * FROM rfps WHERE id = $1',
      [id]
    );

    if (existingRFP.rows.length === 0) {
      return reply.status(404).send({
        status: 'error',
        message: 'RFP not found'
      });
    }

    // Initialize fields with existing values
    let fields = { ...existingRFP.rows[0] };
    fields.documents = {
      commercial: [],
      proposal: [],
      presentation: [],
      qa_document: [],
      other: []
    };

    // Process request based on content type
    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.file) {
          // Handle file upload
          const filename = `${uuidv4()}${path.extname(part.filename)}`;
          const filepath = path.join(await ensureUploadsDir(), filename);
          await fs.writeFile(filepath, await part.toBuffer());
          
          // Track file upload with its category
          const fileInfo = {
            filename: part.filename,
            storedFilename: filename,
            mimetype: part.mimetype,
            path: filepath,
            size: (await fs.stat(filepath)).size,
            category: part.fieldname.replace('documents.', '') || 'other'
          };
          
          fileUploads.push(fileInfo);
        } else {
          // Handle form fields
          if (part.fieldname === 'documents') {
            try {
              fields.documents = JSON.parse(part.value);
            } catch (e) {
              console.warn('Failed to parse documents JSON:', e);
            }
          } else {
            // Map field names to match database columns
            const dbFieldMap = {
              'rfpType': 'rfp_type',
              'rfpStatus': 'rfp_status',
              'rfpDescription': 'rfp_description',
              'solutionDescription': 'solution_description',
              'submissionDeadline': 'submission_deadline',
              'bidManager': 'bid_manager',
              'submissionMode': 'submission_mode',
              'portalUrl': 'portal_url',
              'questionSubmissionDate': 'question_submission_date',
              'responseSubmissionDate': 'response_submission_date',
              'opportunityId': 'opportunity_id'
            };
            
            const dbField = dbFieldMap[part.fieldname] || part.fieldname;
            fields[dbField] = part.value;
          }
        }
      }
    } else {
      // Handle JSON body
      fields = {
        ...fields,
        ...request.body,
        rfp_status: request.body.rfpStatus || request.body.rfp_status || fields.rfp_status
      };
    }

    // Update RFP in database
    const updateResult = await client.query(
      `UPDATE rfps SET
        title = $1,
        rfp_type = $2,
        rfp_status = $3,
        rfp_description = $4,
        solution_description = $5,
        submission_deadline = $6,
        bid_manager = $7,
        submission_mode = $8,
        portal_url = $9,
        question_submission_date = $10,
        response_submission_date = $11,
        comments = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *`,
      [
        fields.title || '',
        fields.rfp_type,
        fields.rfp_status,
        fields.rfp_description,
        fields.solution_description,
        fields.submission_deadline ? new Date(fields.submission_deadline) : null,
        fields.bid_manager,
        fields.submission_mode,
        fields.portal_url,
        fields.question_submission_date ? new Date(fields.question_submission_date) : null,
        fields.response_submission_date ? new Date(fields.response_submission_date) : null,
        fields.comments,
        id
      ]
    );

    // If status is 'Submitted', update opportunity approval stage to LEVEL_2_SOW
    if (fields.rfp_status === 'Submitted' && fields.opportunity_id) {
      await updateOpportunityApprovalStage(client, fields.opportunity_id, 'LEVEL_2_SOW');
    }

    const updatedRFP = updateResult.rows[0];

    // Save new file references to database
    for (const file of fileUploads) {
      await client.query(
        `INSERT INTO rfp_documents (
          rfp_id, 
          original_filename, 
          stored_filename, 
          mime_type, 
          size,
          document_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          file.filename,
          file.storedFilename,
          file.mimetype,
          file.size,
          file.category
        ]
      );
    }

    await client.query('COMMIT');

    // Get the complete updated RFP with all related data
    const { rows: [completeRFP] } = await client.query(`
      SELECT 
        r.*,
        o.opportunity_name,
        u.full_name as created_by_name
      FROM rfps r
      LEFT JOIN opportunities o ON r.opportunity_id = o.id
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.id = $1
    `, [id]);

    // Get all documents for this RFP
    const { rows: documents } = await client.query(`
      SELECT 
        id,
        original_filename,
        stored_filename,
        mime_type,
        size,
        document_type
      FROM rfp_documents
      WHERE rfp_id = $1
    `, [id]);

    // Group documents by type
    const documentsByType = documents.reduce((acc, doc) => {
      const type = doc.document_type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push({
        id: doc.id,
        original_filename: doc.original_filename,
        stored_filename: doc.stored_filename,
        mime_type: doc.mime_type,
        size: parseInt(doc.size),
        document_type: doc.document_type
      });
      return acc;
    }, {});

    return {
      status: 'success',
      message: 'RFP updated successfully',
      data: {
        ...completeRFP,
        documents: {
          ...(completeRFP.documents || {}),
          ...documentsByType
        }
      }
    };

  } catch (error) {
    console.error('RFP update error:', error);
    if (client) await client.query('ROLLBACK');
    
    // Clean up any uploaded files on error
    try {
      for (const file of fileUploads) {
        await fs.unlink(file.path).catch(console.error);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up files:', cleanupError);
    }
    
    return handleRFPError(error, request, reply);
  } finally {
    if (client) client.release();
  }
};

const deleteRFP = async (fastify, request, reply) => {
  let client;
  const { id } = request.params;
  
  try {
    client = await fastify.pg.connect();
    await client.query('BEGIN');

    // First, delete associated documents
    await client.query(
      'DELETE FROM rfp_documents WHERE rfp_id = $1',
      [id]
    );

    // Then delete the RFP
    const result = await client.query(
      'DELETE FROM rfps WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        message: 'RFP not found'
      });
    }

    await client.query('COMMIT');
    
    return {
      success: true,
      message: 'RFP deleted successfully'
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting RFP:', error);
    reply.status(500).send({
      success: false,
      error: 'Failed to delete RFP',
      message: error.message
    });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  createRFP,
  getAllRFPs,
  handleRFPError,
  getRFPByOpportunityId, 
  updateRFP,
  deleteRFP
};