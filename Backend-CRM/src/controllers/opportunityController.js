/**
 * Opportunity Controller
 * Handles HTTP requests for opportunity-related operations
 */
const Opportunity = require('../models/opportunity.model');
const { parse } = require('csv-parse/sync');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

module.exports = (fastify) => {
  const opportunityModel = Opportunity(fastify);

  // Get all opportunities
  const getAllOpportunities = async (request, reply) => {
    try {
      const opportunities = await opportunityModel.getAll();
      return {
        status: 'success',
        data: opportunities,
        message: 'Opportunities retrieved successfully'
      };
    } catch (error) {
      request.log.error('Error fetching opportunities:', error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to fetch opportunities',
        error: error.message
      });
    }
  };

  // Get opportunity by ID
  // ✅ FIXED: Get opportunity by ID
  const getOpportunityById = async (request, reply) => {
    const opportunityId = Number(request.params.id); // 🔥 IMPORTANT FIX

    if (isNaN(opportunityId)) {
      return reply.status(400).send({
        status: 'error',
        message: 'Invalid opportunity ID'
      });
    }

    try {
      const opportunity = await opportunityModel.getById(opportunityId);

      if (!opportunity) {
        return reply.status(404).send({
          status: 'error',
          message: 'Opportunity not found'
        });
      }

      return {
        status: 'success',
        data: opportunity,
        message: 'Opportunity retrieved successfully'
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to fetch opportunity'
      });
    }
  };

  // Create a new opportunity
  const createOpportunity = async (request, reply) => {
    try {
      // Set the user_id from the authenticated user if not provided
      if (!request.body.user_id && request.user) {
        request.body.user_id = request.user.id;
      } else if (!request.body.user_id) {
        console.warn('No user_id provided and no authenticated user available');
      }
      
      // Create the opportunity
      const opportunity = await opportunityModel.create(request.body);
      if (!opportunity || Object.keys(opportunity).length === 0) {
        const errorMsg = 'Empty or invalid opportunity data returned from model';
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      // Return only status and message, no data field
      return reply.status(201).send({
        status: 'success',
        message: 'Opportunity created successfully'
      });
  } catch (error) {
    console.error('Error in createOpportunity:', {
      error: error.message,
      stack: error.stack,
      body: request.body,
      user: request.user
    });
    
    request.log.error('Error creating opportunity:', error);
    return reply.status(500).send({
      status: 'error',
      message: 'Failed to create opportunity',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

  // Update an opportunity
  const updateOpportunity = async (request, reply) => {
    try {
      const opportunity = await opportunityModel.update(
        request.params.id, 
        request.body
      );

      if (!opportunity) {
        return reply.status(404).send({
          status: 'error',
          message: 'Opportunity not found'
        });
      }

      return {
        status: 'success',
        data: opportunity,
        message: 'Opportunity updated successfully'
      };
    } catch (error) {
      request.log.error(`Error updating opportunity ${request.params.id}:`, error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to update opportunity',
        error: error.message
      });
    }
  };

  // Delete an opportunity
  const deleteOpportunity = async (request, reply) => {
    try {
      const opportunity = await opportunityModel.delete(request.params.id);
      
      if (!opportunity) {
        return reply.status(404).send({
          status: 'error',
          message: 'Opportunity not found'
        });
      }

      return {
        status: 'success',
        data: opportunity,
        message: 'Opportunity deleted successfully'
      };
    } catch (error) {
      request.log.error(`Error deleting opportunity ${request.params.id}:`, error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to delete opportunity',
        error: error.message
      });
    }
  };

  // Get opportunities by user ID
  const getOpportunitiesByUser = async (request, reply) => {
    try {
      const userId = request.params.userId || request.user?.id;
      if (!userId) {
        return reply.status(400).send({
          status: 'error',
          message: 'User ID is required'
        });
      }

      const opportunities = await opportunityModel.getByUserId(userId);
      return {
        status: 'success',
        data: opportunities,
        message: 'User opportunities retrieved successfully'
      };
    } catch (error) {
      request.log.error(`Error fetching opportunities for user ${request.params.userId}:`, error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to fetch user opportunities',
        error: error.message
      });
    }
  };

  // Get opportunities by status
  const getOpportunitiesByStatus = async (request, reply) => {
    try {
      const { status } = request.params;
      const opportunities = await opportunityModel.getByStatus(status);
      
      return {
        status: 'success',
        data: opportunities,
        message: `${status} opportunities retrieved successfully`
      };
    } catch (error) {
      request.log.error(`Error fetching ${request.params.status} opportunities:`, error);
      return reply.status(500).send({
        status: 'error',
        message: `Failed to fetch ${request.params.status} opportunities`,
        error: error.message
      });
    }
  };

  // Download sample import template
 const downloadTemplate = async (request, reply) => {
  try {
    // Create sample data based on the opportunity model
    const sampleData = [{
      opportunity_name: 'Sample Opportunity',
      client_name: 'Sample Client',
      close_date: new Date().toISOString().split('T')[0], // Today's date
      amount_currency: 'USD',
      amount: '10000',
      opportunity_type: 'New Business',
      lead_source: 'Website',
      triaged_status: 'Qualified',
      pipeline_status: 'Proposal',
      win_probability: '70',
      user_id: '', // Leave empty for user to fill
      role_id: ''  // Leave empty for user to fill
    }];

    // Create workbook and worksheet
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(sampleData);
    
    // Set column widths
    const columnWidths = [
      { wch: 25 }, // opportunity_name
      { wch: 25 }, // client_name
      { wch: 15 }, // close_date
      { wch: 15 }, // amount_currency
      { wch: 12 }, // amount
      { wch: 20 }, // opportunity_type
      { wch: 15 }, // lead_source
      { wch: 15 }, // triaged_status
      { wch: 15 }, // pipeline_status
      { wch: 15 }, // win_probability
      { wch: 10 }, // user_id
      { wch: 10 }  // role_id
    ];
    
    ws['!cols'] = columnWidths;
    
    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(wb, ws, 'Opportunities');
    
    // Generate buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=opportunity_import_template.xlsx');
    
    return buffer;
  } catch (error) {
    request.log.error('Error generating template:', error);
    return reply.status(500).send({
      status: 'error',
      message: 'Failed to generate template',
      error: error.message
    });
  }
};

  // Import opportunities from file
  const importOpportunities = async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(400).send({
        status: 'error',
        message: 'Request is not multipart'
      });
    }

    const data = await request.file();
    const fileBuffer = await data.toBuffer();
    const fileExtension = data.filename.split('.').pop().toLowerCase();
    
    try {
      let records = [];
      
      // Parse file based on extension
      if (fileExtension === 'csv') {
        records = parse(fileBuffer, {
          columns: true,
          skip_empty_lines: true,
          trim: true
        });
      } else if (['xlsx', 'xls'].includes(fileExtension)) {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        records = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else {
        return reply.status(400).send({
          status: 'error',
          message: 'Unsupported file format. Please upload a CSV or Excel file.'
        });
      }

      if (!records.length) {
        return reply.status(400).send({
          status: 'error',
          message: 'No records found in the file'
        });
      }

      const results = {
        total: records.length,
        success: 0,
        failures: 0,
        errors: []
      };

      // Process each record
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 2; // +2 because of 0-based index and header row
        
        try {
          // Validate required fields
          if (!row.opportunity_name || !row.client_name || !row.close_date || !row.amount) {
            throw new Error('Missing required fields');
          }

          // Convert amount to number
          const amount = parseFloat(row.amount);
          if (isNaN(amount)) {
            throw new Error('Invalid amount');
          }

          // Prepare opportunity data
          const opportunityData = {
            opportunity_name: row.opportunity_name,
            client_name: row.client_name,
            close_date: new Date(row.close_date).toISOString(),
            amount_currency: row.amount_currency || 'USD',
            amount: amount,
            opportunity_type: row.opportunity_type || null,
            lead_source: row.lead_source || null,
            triaged_status: row.triaged_status || null,
            pipeline_status: row.pipeline_status || null,
            win_probability: row.win_probability ? parseInt(row.win_probability) : null,
            user_id: row.user_id || null,
            role_id: row.role_id || null
          };

          // Use the existing create method to ensure consistency
          await opportunityModel.create(opportunityData);
          results.success++;
          
        } catch (error) {
          results.failures++;
          results.errors.push({
            row: rowNumber,
            error: error.message,
            data: row
          });
          
          // Log detailed error for debugging
          request.log.error(`Error processing row ${rowNumber}:`, {
            error: error.message,
            data: row,
            stack: error.stack
          });
        }
      }

      // Prepare response
      const response = {
        status: results.failures === 0 ? 'success' : 'partial_success',
        message: `Processed ${results.total} records`,
        data: {
          total: results.total,
          success: results.success,
          failures: results.failures
        }
      };

      // Include errors if any
      if (results.errors.length > 0) {
        response.data.errors = results.errors;
      }

      return response;
      
    } catch (error) {
      request.log.error('Error processing import:', error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to process import file',
        error: error.message
      });
    }
  };

  return {
    getAllOpportunities,
    getOpportunityById,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    getOpportunitiesByUser,
    getOpportunitiesByStatus,
    downloadTemplate,
    importOpportunities
  };
};
