/**
 * Opportunity Controller
 * Handles HTTP requests for opportunity-related operations
 */
const Opportunity = require('../models/opportunity.model');

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

  return {
    getAllOpportunities,
    getOpportunityById,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    getOpportunitiesByUser,
    getOpportunitiesByStatus
  };
};
