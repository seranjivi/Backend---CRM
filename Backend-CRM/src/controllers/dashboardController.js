const { query } = require('../config/db');

const getDashboardStats = async (request, reply) => {
  try {
    // Get total opportunities count and value with source distribution
    const opportunitiesQuery = `
      SELECT 
        COUNT(*) as total_opportunities,
        COALESCE(SUM(amount), 0) as total_value,
        COALESCE(SUM(CASE WHEN pipeline_status = 'Won' THEN amount ELSE 0 END), 0) as won_value,
        COUNT(CASE WHEN approval_stage = 'Approved' THEN 1 END) as won_count,
        COUNT(CASE WHEN pipeline_status = 'Open' OR pipeline_status = 'In Progress' OR pipeline_status IS NULL THEN 1 END) as open_count,
        COUNT(CASE WHEN pipeline_status = 'Lost' THEN 1 END) as lost_count,
        COUNT(CASE WHEN pipeline_status = 'Proposal' THEN 1 END) as proposal_count,
        COUNT(CASE WHEN pipeline_status = 'Qualified' THEN 1 END) as qualified_count,
        COUNT(CASE WHEN lead_source = 'Advertisement' THEN 1 END) as advertisement_count,
        COUNT(CASE WHEN lead_source = 'Cold Call' THEN 1 END) as cold_call_count,
        COUNT(CASE WHEN lead_source = 'Employee Referral' THEN 1 END) as employee_referral_count,
        COUNT(CASE WHEN lead_source = 'External Referral' THEN 1 END) as external_referral_count,
        COUNT(CASE WHEN lead_source = 'Online Store' THEN 1 END) as online_store_count,
        COUNT(CASE WHEN lead_source = 'Partner' THEN 1 END) as partner_count,
        COUNT(CASE WHEN lead_source = 'Public Relations' THEN 1 END) as public_relations_count,
        COUNT(CASE WHEN lead_source = 'Sales Email' THEN 1 END) as sales_email_count,
        COUNT(CASE WHEN lead_source = 'Seminar / Trade Show' THEN 1 END) as seminar_count,
        COUNT(CASE WHEN lead_source = 'Web Download' THEN 1 END) as web_download_count,
        COUNT(CASE WHEN lead_source = 'Web Research' THEN 1 END) as web_research_count,
        COUNT(CASE WHEN lead_source = 'Chat' THEN 1 END) as chat_count,
        COUNT(CASE WHEN lead_source = 'Portal' THEN 1 END) as portal_count,
        COUNT(CASE WHEN lead_source = 'Others' OR lead_source IS NULL THEN 1 END) as others_count
      FROM opportunities
    `;

    // Execute the opportunities query
    const opportunitiesResult = await query(opportunitiesQuery);
    const opportunities = opportunitiesResult.rows[0];

    // Get total RFB count from the rfps table
    let rfbCount = 0;
    try {
      const rfbResult = await query('SELECT COUNT(*) as total_rfb FROM rfps');
      rfbCount = parseInt(rfbResult.rows[0]?.total_rfb) || 0;
    } catch (error) {
      console.warn('Could not fetch RFB count:', error.message);
    }

    // Get total SOW count from the sows table
    let sowTotalCount = 0;
    try {
    const sowResult = await query('SELECT COUNT(*) as total_sows FROM sows');
    sowTotalCount = parseInt(sowResult.rows[0]?.total_sows) || 0;
    } catch (error) {
    console.warn('Could not fetch SOW count:', error.message);
    }

    // Prepare response data
    const response = {
      success: true,
      data: {
        totals: {
          opportunities: parseInt(opportunities.total_opportunities) || 0,
          value: parseFloat(opportunities.total_value) || 0,
          won: parseInt(opportunities.won_count) || 0,
          open: parseInt(opportunities.open_count) || 0,
          lost: parseInt(opportunities.lost_count) || 0
        },
        conversionFunnel: {
          total: parseInt(opportunities.total_opportunities) || 0,
          rfb: rfbCount,
          proposal: parseInt(opportunities.proposal_count) || 0,
         sow: sowTotalCount,  // Using the count from the sows table
          won: parseInt(opportunities.won_count) || 0,
          lost: parseInt(opportunities.lost_count) || 0
        },
        sourceDistribution: [
          { name: 'Advertisement', value: parseInt(opportunities.advertisement_count) || 0 },
          { name: 'Cold Call', value: parseInt(opportunities.cold_call_count) || 0},
          { name: 'Employee Referral', value: parseInt(opportunities.employee_referral_count) || 0},
          { name: 'External Referral', value: parseInt(opportunities.external_referral_count) || 0},
          { name: 'Online Store', value: parseInt(opportunities.online_store_count) || 0},
          { name: 'Partner', value: parseInt(opportunities.partner_count) || 0},
          { name: 'Public Relations', value: parseInt(opportunities.public_relations_count) || 0},
          { name: 'Sales Email', value: parseInt(opportunities.sales_email_count) || 0},
          { name: 'Seminar / Trade Show', value: parseInt(opportunities.seminar_count) || 0},
          { name: 'Web Download', value: parseInt(opportunities.web_download_count) || 0},
          { name: 'Web Research', value: parseInt(opportunities.web_research_count) || 0},
          { name: 'Chat', value: parseInt(opportunities.chat_count) || 0},
          { name: 'Portal', value: parseInt(opportunities.portal_count) || 0},
          { name: 'Others', value: parseInt(opportunities.others_count) || 0}
        ]
      }
    };

    reply.send(response);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    reply.status(500).send({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

module.exports = {
  getDashboardStats
};