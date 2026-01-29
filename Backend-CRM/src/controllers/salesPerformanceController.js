const { query } = require('../config/db');

const getSalesPerformance = async (request, reply) => {
    try {
        const { presales_poc } = request.query;

        if (!presales_poc) {
            return reply.status(400).send({
                success: false,
                message: 'presales_poc query parameter is required'
            });
        }

        // Metrics Query
        const metricsQuery = `
      SELECT 
        COUNT(*) as total_proposals,
        COALESCE(SUM(CASE WHEN pipeline_status = 'Won' THEN 1 ELSE 0 END), 0) as proposals_won,
        COALESCE(SUM(amount), 0) as total_deal_value,
        COALESCE(AVG(amount), 0) as average_deal_value,
        COALESCE(SUM(CASE WHEN pipeline_status IN ('Proposal Work-in-Progress', 'Proposal Review') THEN 1 ELSE 0 END), 0) as open_proposals,
        COALESCE(SUM(CASE WHEN pipeline_status = 'Lost' THEN 1 ELSE 0 END), 0) as lost_proposals,
        COALESCE(SUM(CASE WHEN pipeline_status = 'Price Negotiation' THEN 1 ELSE 0 END), 0) as on_hold_proposals
      FROM opportunities
      WHERE presales_poc = $1
    `;

        const metricsResult = await query(metricsQuery, [presales_poc]);
        const metrics = metricsResult.rows[0];

        // Proposals Table Query
        const proposalsQuery = `
      SELECT 
        opportunity_name as title,
        client_name as customer,
        opportunity_type as type,
        pipeline_status as status,
        amount as deal_value,
        updated_at as updated,
        created_at
      FROM opportunities
      WHERE presales_poc = $1
      ORDER BY created_at DESC
    `;

        const proposalsResult = await query(proposalsQuery, [presales_poc]);

        const response = {
            success: true,
            data: {
                metrics: {
                    totalProposals: parseInt(metrics.total_proposals) || 0,
                    proposalsWon: parseInt(metrics.proposals_won) || 0,
                    totalDealValue: parseFloat(metrics.total_deal_value) || 0,
                    averageDealValue: parseFloat(metrics.average_deal_value) || 0,
                    openProposals: parseInt(metrics.open_proposals) || 0,
                    lostProposals: parseInt(metrics.lost_proposals) || 0,
                    onHoldProposals: parseInt(metrics.on_hold_proposals) || 0,
                    winRate: parseInt(metrics.total_proposals) > 0
                        ? Math.round((parseInt(metrics.proposals_won) / parseInt(metrics.total_proposals)) * 100)
                        : 0
                },
                proposals: proposalsResult.rows.map(row => ({
                    title: row.title,
                    customer: row.customer,
                    type: row.type,
                    status: row.status,
                    dealValue: parseFloat(row.deal_value) || 0,
                    updated: row.updated
                }))
            }
        };

        reply.send(response);
    } catch (error) {
        console.error('Error fetching sales performance stats:', error);
        reply.status(500).send({
            success: false,
            message: 'Error fetching sales performance statistics',
            error: error.message
        });
    }
};

module.exports = {
    getSalesPerformance
};
