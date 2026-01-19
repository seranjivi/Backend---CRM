// src/controllers/sowDocumentController.js
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const { getClient } = require('../config/db');
const ensureSOWUploadsDir = async () => {
  const uploadsDir = path.join(__dirname, '../../uploads/sow-documents');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return uploadsDir;
};
const uploadSOWDocument = async (request, reply) => {
  const { sowId } = request.params;
  const files = [];
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    
    const uploadsDir = await ensureSOWUploadsDir();
    const parts = request.parts();
    
    for await (const part of parts) {
      if (part.file) {
        const filename = `${uuidv4()}${path.extname(part.filename)}`;
        const filepath = path.join(uploadsDir, filename);
        
        await fs.writeFile(filepath, await part.toBuffer());
        
        const { rows } = await client.query(
          `INSERT INTO sow_documents (
            sow_id,
            original_filename,
            stored_filename,
            mime_type,
            size,
            uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, original_filename, stored_filename, mime_type, size, created_at`,
          [
            sowId,
            part.filename,
            filename,
            part.mimetype,
            part.file.bytesRead,
            request.user?.id
          ]
        );
        files.push(rows[0]);
      }
    }
    await client.query('COMMIT');
    
    return {
      success: true,
      message: 'Documents uploaded successfully',
      data: files
    };
  } catch (error) {
    console.error('Error uploading SOW documents:', error);
    if (client) await client.query('ROLLBACK');
    
    // Cleanup any uploaded files if there was an error
    const uploadsDir = await ensureSOWUploadsDir();
    for (const file of files) {
      try {
        await fs.unlink(path.join(uploadsDir, file.stored_filename));
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    
    reply.status(500).send({
      success: false,
      error: 'Failed to upload documents',
      message: error.message
    });
  } finally {
    if (client) client.release();
  }
};
const getSOWDocuments = async (request, reply) => {
  const { sowId } = request.params;
  const client = await getClient();
  
  try {
    const { rows } = await client.query(
      `SELECT id, original_filename, mime_type, size, created_at 
       FROM sow_documents 
       WHERE sow_id = $1 
       ORDER BY created_at DESC`,
      [sowId]
    );
    
    return {
      success: true,
      data: rows
    };
  } catch (error) {
    console.error('Error fetching SOW documents:', error);
    reply.status(500).send({
      success: false,
      error: 'Failed to fetch documents',
      message: error.message
    });
  } finally {
    client.release();
  }
};
const downloadSOWDocument = async (request, reply) => {
  const { documentId } = request.params;
  const client = await getClient();
  
  try {
    const { rows } = await client.query(
      `SELECT * FROM sow_documents WHERE id = $1`,
      [documentId]
    );
    
    if (rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Document not found'
      });
    }
    
    const document = rows[0];
    const filePath = path.join(__dirname, '../../uploads/sow-documents', document.stored_filename);
    
    return reply
      .header('Content-Disposition', `attachment; filename="${document.original_filename}"`)
      .type(document.mime_type)
      .send(fs.createReadStream(filePath));
      
  } catch (error) {
    console.error('Error downloading document:', error);
    reply.status(500).send({
      success: false,
      error: 'Failed to download document',
      message: error.message
    });
  } finally {
    client.release();
  }
};
const deleteSOWDocument = async (request, reply) => {
  const { documentId } = request.params;
  let client;
  
  try {
    client = await getClient();
    await client.query('BEGIN');
    
    // Get document info before deleting
    const { rows } = await client.query(
      'SELECT * FROM sow_documents WHERE id = $1',
      [documentId]
    );
    
    if (rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Document not found'
      });
    }
    
    const document = rows[0];
    const filePath = path.join(__dirname, '../../uploads/sow-documents', document.stored_filename);
    
    // Delete from database
    await client.query('DELETE FROM sow_documents WHERE id = $1', [documentId]);
    
    // Delete file
    await fs.unlink(filePath).catch(console.error);
    
    await client.query('COMMIT');
    
    return {
      success: true,
      message: 'Document deleted successfully'
    };
    
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error deleting document:', error);
    reply.status(500).send({
      success: false,
      error: 'Failed to delete document',
      message: error.message
    });
  } finally {
    if (client) client.release();
  }
};
module.exports = {
  uploadSOWDocument,
  getSOWDocuments,
  downloadSOWDocument,
  deleteSOWDocument
};