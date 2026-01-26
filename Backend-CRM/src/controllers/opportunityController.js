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
    const opportunityId = Number(request.params.id); // IMPORTANT FIX

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
      
      // Parse next_steps if it's a string (JSON)
      if (opportunity.next_steps && typeof opportunity.next_steps === 'string') {
        try {
          opportunity.next_steps = JSON.parse(opportunity.next_steps);
          
          // Ensure next_steps is an array
          if (!Array.isArray(opportunity.next_steps)) {
            console.warn('next_steps is not an array, converting to array');
            opportunity.next_steps = [];
          }
          
          // Ensure each step has required fields
          opportunity.next_steps = opportunity.next_steps.map(step => ({
            step: step.step || '',
            assigned_to: step.assigned_to || null,
            due_date: step.due_date || null,
            status: step.status || 'pending',
            created_at: step.created_at || new Date().toISOString(),
            updated_at: step.updated_at || new Date().toISOString()
          }));
          
        } catch (e) {
          console.error('Error parsing next_steps:', e);
          // If parsing fails, set to empty array
          opportunity.next_steps = [{
            step: opportunity.next_steps, // Use the raw string as the step
            assigned_to: null,
            due_date: null,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }];
        }
      } else if (!opportunity.next_steps) {
        // Ensure next_steps is always an array, even if null/undefined
        opportunity.next_steps = [];
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
      
      // Process next_steps if provided
      if (request.body.next_steps) {
        try {
          // If next_steps is a string, parse it as JSON
          if (typeof request.body.next_steps === 'string') {
            request.body.next_steps = JSON.parse(request.body.next_steps);
          }
          
          // Validate next_steps is an array
          if (!Array.isArray(request.body.next_steps)) {
            return reply.status(400).send({
              status: 'error',
              message: 'next_steps must be an array of objects'
            });
          }
          
          // Validate each next step object
          for (const step of request.body.next_steps) {
            if (!step.step || typeof step.step !== 'string') {
              return reply.status(400).send({
                status: 'error',
                message: 'Each next step must have a valid step description'
              });
            }
            
            // Set default values if not provided
            step.assigned_to = step.assigned_to || null;
            step.due_date = step.due_date || null;
            step.status = step.status || 'pending';
            step.created_at = new Date().toISOString();
            step.updated_at = new Date().toISOString();
          }
          
          // Stringify the next_steps array for storage
          request.body.next_steps = JSON.stringify(request.body.next_steps);
        } catch (error) {
          console.error('Error processing next_steps:', error);
          return reply.status(400).send({
            status: 'error',
            message: 'Invalid next_steps format. Expected format: [{step: string, assigned_to: string, due_date: string, status: string}]'
          });
        }
      }
      
      // Create the opportunity
      const opportunity = await opportunityModel.create(request.body);
      if (!opportunity || Object.keys(opportunity).length === 0) {
        const errorMsg = 'Empty or invalid opportunity data returned from model';
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Parse next_steps back to object for the response
      if (opportunity.next_steps && typeof opportunity.next_steps === 'string') {
        try {
          opportunity.next_steps = JSON.parse(opportunity.next_steps);
        } catch (e) {
          console.warn('Failed to parse next_steps:', e);
        }
      }
      
      // Return the created opportunity with parsed next_steps
      return reply.status(201).send({
        status: 'success',
        data: opportunity,
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
      // Process next_steps if provided in the update
      if (request.body.next_steps !== undefined) {
        try {
          // Handle both string and object/array inputs
          if (typeof request.body.next_steps === 'string') {
            // Try to parse if it's a JSON string
            try {
              request.body.next_steps = JSON.parse(request.body.next_steps);
            } catch (e) {
              // If it's not JSON, treat as a single step
              request.body.next_steps = [{
                step: request.body.next_steps,
                assigned_to: request.user?.name || 'System',
                due_date: null,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }];
            }
          }
          
          // If it's a single object, convert to array
          if (request.body.next_steps && !Array.isArray(request.body.next_steps)) {
            request.body.next_steps = [{
              ...request.body.next_steps,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }];
          }
          
          // Validate next_steps is an array
          if (!Array.isArray(request.body.next_steps)) {
            return reply.status(400).send({
              status: 'error',
              message: 'next_steps must be an array of objects'
            });
          }
          
          // Get existing opportunity to merge with existing next_steps if needed
          const existingOpportunity = await opportunityModel.getById(request.params.id);
          let existingNextSteps = [];
          
          if (existingOpportunity && existingOpportunity.next_steps) {
            try {
              existingNextSteps = typeof existingOpportunity.next_steps === 'string' 
                ? JSON.parse(existingOpportunity.next_steps) 
                : existingOpportunity.next_steps;
                
              if (!Array.isArray(existingNextSteps)) {
                existingNextSteps = [];
              }
            } catch (e) {
              console.warn('Failed to parse existing next_steps:', e);
              existingNextSteps = [];
            }
          }
          
          // Merge with existing next_steps if needed
          // For simplicity, we'll just append new steps to existing ones
          // You might want to implement deduplication or other logic here
          const updatedNextSteps = [...existingNextSteps, ...request.body.next_steps];
          
          // Stringify for storage
          request.body.next_steps = JSON.stringify(updatedNextSteps);
          
        } catch (error) {
          console.error('Error processing next_steps:', error);
          return reply.status(400).send({
            status: 'error',
            message: 'Invalid next_steps format. Expected format: [{step: string, assigned_to: string, due_date: string, status: string}]'
          });
        }
      }
      
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
      
      // Parse next_steps back to object for the response
      if (opportunity.next_steps && typeof opportunity.next_steps === 'string') {
        try {
          opportunity.next_steps = JSON.parse(opportunity.next_steps);
        } catch (e) {
          console.warn('Failed to parse next_steps:', e);
        }
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
      start_date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0], // 7 days from now
      sales_owner: 'John Doe',
      technical_poc: 'Jane Smith',
      presales_poc: 'Mike Johnson',
      next_steps: 'Schedule demo with client, Send proposal',
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
      { wch: 15 }, // start_date
      { wch: 20 }, // sales_owner
      { wch: 20 }, // technical_poc
      { wch: 20 }, // presales_poc
      { wch: 30 }, // next_steps
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
            start_date: row.start_date ? new Date(row.start_date).toISOString() : null,
            sales_owner: row.sales_owner || null,
            technical_poc: row.technical_poc || null,
            presales_poc: row.presales_poc || null,
            next_steps: row.next_steps || null,
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
