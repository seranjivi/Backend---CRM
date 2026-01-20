// src/controllers/clientController.js
const { query, getClient } = require('../config/db');
const { parse } = require('csv-parse/sync');
const xlsx = require('xlsx');
const createClient = async (request, reply) => {
  const {
    client_name,
    email,
    website,
    industry,
    customer_type,
    tax_id,
    status = 'active',
    notes,
    user_id,
    contacts = [],
    addresses = []
  } = request.body;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Insert client
    const clientQuery = `
      INSERT INTO clients (
        client_name, email, website, industry, 
        customer_type, tax_id, status, notes, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING client_id, client_code
    `;
    
    const clientValues = [
      client_name, email, website, industry, 
      customer_type, tax_id, status, notes, user_id
    ];
    
    const clientResult = await client.query(clientQuery, clientValues);
    const { client_id, client_code } = clientResult.rows[0];

    // Insert contacts if any
    if (contacts && contacts.length > 0) {
      const contactValues = contacts.map(contact => [
        client_id,
        contact.name,
        contact.email,
        contact.phone,
        contact.designation
      ]);
      
      const contactQuery = `
        INSERT INTO client_contacts 
          (client_id, name, email, phone, designation)
        SELECT * FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::text[])
      `;
      
      await client.query(contactQuery, [
        contactValues.map(cv => client_id),
        contactValues.map(cv => cv[1]),
        contactValues.map(cv => cv[2] || null),
        contactValues.map(cv => cv[3] || null),
        contactValues.map(cv => cv[4] || null)
      ]);
    }

    // Insert addresses if any
    if (addresses && addresses.length > 0) {
      // Ensure only one primary address
      const hasPrimary = addresses.some(addr => addr.is_primary);
      const processedAddresses = hasPrimary 
        ? addresses 
        : addresses.map((addr, index) => ({
            ...addr,
            is_primary: index === 0
          }));

      const addressValues = processedAddresses.map(addr => [
        client_id,
        addr.address_line1,
        addr.address_line2 || null,
        addr.city || null,
        addr.region_state || null,
        addr.country,
        addr.postal_code || null,
        addr.is_primary || false
      ]);

      const addressQuery = `
        INSERT INTO client_addresses (
          client_id, address_line1, address_line2, city, 
          region_state, country, postal_code, is_primary
        ) 
        SELECT * FROM UNNEST(
          $1::int[], 
          $2::text[], 
          $3::text[], 
          $4::text[], 
          $5::text[], 
          $6::text[], 
          $7::text[], 
          $8::boolean[]
        )
      `;

      await client.query(addressQuery, [
        addressValues.map(av => client_id),
        addressValues.map(av => av[1]),
        addressValues.map(av => av[2]),
        addressValues.map(av => av[3]),
        addressValues.map(av => av[4]),
        addressValues.map(av => av[5]),
        addressValues.map(av => av[6]),
        addressValues.map(av => av[7])
      ]);
    }

    await client.query('COMMIT');
    
    reply.status(201).send({
      success: true,
      message: 'Client created successfully',
      data: { client_id, client_code }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating client:', error);
    reply.status(500).send({
      success: false,
      message: 'Error creating client',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const getClientById = async (request, reply) => {
  try {
    const { id } = request.params;
    
    // Get client
    const clientQuery = `
      SELECT 
        c.*,
        u.full_name as account_owner
      FROM clients c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.client_id = $1
    `;
    
    const clientResult = await query(clientQuery, [id]);
    
    if (clientResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        message: 'Client not found'
      });
    }
    
    const client = clientResult.rows[0];
    
    // Get contacts
    const contactsQuery = `
      SELECT 
        contact_id, 
        name, 
        email, 
        phone, 
        designation
      FROM client_contacts
      WHERE client_id = $1
    `;
    
    const contactsResult = await query(contactsQuery, [id]);
    client.contacts = contactsResult.rows;
    
    // Get addresses
    const addressesQuery = `
      SELECT 
        address_id,
        address_line1,
        address_line2,
        city,
        region_state,
        country,
        postal_code,
        is_primary
      FROM client_addresses
      WHERE client_id = $1
      ORDER BY is_primary DESC
    `;
    
    const addressesResult = await query(addressesQuery, [id]);
    client.addresses = addressesResult.rows;
    
    reply.send({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('Error fetching client:', error);
    reply.status(500).send({
      success: false,
      message: 'Error fetching client',
      error: error.message
    });
  }
};

const listClients = async (request, reply) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      industry, 
      search 
    } = request.query;
    
    const offset = (page - 1) * limit;
    const queryParams = [limit, offset];
    
    let whereClause = 'WHERE 1=1';
    
    if (status) {
      queryParams.push(status);
      whereClause += ` AND c.status = $${queryParams.length}`;
    }
    
    if (industry) {
      queryParams.push(`%${industry}%`);
      whereClause += ` AND c.industry ILIKE $${queryParams.length}`;
    }
    
    if (search) {
      queryParams.push(`%${search}%`);
      whereClause += ` AND (c.client_name ILIKE $${queryParams.length} OR c.email ILIKE $${queryParams.length})`;
    }
    
    // Get clients with pagination
    const clientsQuery = `
      SELECT 
        c.client_id,
        c.client_code,
        c.client_name,
        c.email,
        c.website,
        c.industry,
        c.customer_type,
        c.status,
        c.created_at,
        u.full_name as account_owner,
        (SELECT COUNT(*) FROM client_contacts WHERE client_id = c.client_id) as contact_count
      FROM clients c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM clients c
      ${whereClause}
    `;
    
    const [clientsResult, countResult] = await Promise.all([
      query(clientsQuery, queryParams),
      query(countQuery, queryParams.slice(2)) // Skip limit and offset for count
    ]);
    
    const total = parseInt(countResult.rows[0]?.total || 0, 10);
    const totalPages = Math.ceil(total / limit);
    
    reply.send({
      success: true,
      data: clientsResult.rows,
      pagination: {
        total,
        total_pages: totalPages,
        current_page: parseInt(page, 10),
        per_page: parseInt(limit, 10),
        has_next_page: page < totalPages,
        has_prev_page: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error listing clients:', error);
    reply.status(500).send({
      success: false,
      message: 'Error fetching clients',
      error: error.message
    });
  }
};

const updateClient = async (request, reply) => {
  const { id } = request.params;
  const {
    client_name,
    email,
    website,
    industry,
    customer_type,
    tax_id,
    status,
    notes,
    user_id,
    contacts = [],
    addresses = []
  } = request.body;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Update client
    const clientQuery = `
      UPDATE clients 
      SET 
        client_name = $1,
        email = $2,
        website = $3,
        industry = $4,
        customer_type = $5,
        tax_id = $6,
        status = $7,
        notes = $8,
        user_id = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE client_id = $10
      RETURNING client_id, client_code
    `;
    
    const clientValues = [
      client_name, email, website, industry, 
      customer_type, tax_id, status, notes, user_id, id
    ];
    
    const clientResult = await client.query(clientQuery, clientValues);
    
    if (clientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({
        success: false,
        message: 'Client not found'
      });
    }

    const { client_id } = clientResult.rows[0];

    // Handle contacts
    // First delete existing contacts
    await client.query('DELETE FROM client_contacts WHERE client_id = $1', [client_id]);
    
    // Insert updated contacts if any
    if (contacts.length > 0) {
      const contactValues = contacts.map(contact => [
        client_id,
        contact.name,
        contact.email,
        contact.phone,
        contact.designation
      ]);
      
      const contactQuery = `
        INSERT INTO client_contacts 
          (client_id, name, email, phone, designation)
        SELECT * FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::text[])
      `;
      
      await client.query(contactQuery, [
        contactValues.map(cv => client_id),
        contactValues.map(cv => cv[1]),
        contactValues.map(cv => cv[2] || null),
        contactValues.map(cv => cv[3] || null),
        contactValues.map(cv => cv[4] || null)
      ]);
    }

    // Handle addresses
    // First delete existing addresses
    await client.query('DELETE FROM client_addresses WHERE client_id = $1', [client_id]);
    
    // Insert updated addresses if any
    if (addresses.length > 0) {
      const addressValues = addresses.map(addr => [
        client_id,
        addr.address_line1,
        addr.address_line2 || null,
        addr.city || null,
        addr.region_state || null,
        addr.country,
        addr.postal_code || null,
        addr.is_primary || false
      ]);

      const addressQuery = `
        INSERT INTO client_addresses (
          client_id, address_line1, address_line2, city, 
          region_state, country, postal_code, is_primary
        ) 
        SELECT * FROM UNNEST(
          $1::int[], 
          $2::text[], 
          $3::text[], 
          $4::text[], 
          $5::text[], 
          $6::text[], 
          $7::text[], 
          $8::boolean[]
        )
      `;

      await client.query(addressQuery, [
        addressValues.map(av => client_id),
        addressValues.map(av => av[1]),
        addressValues.map(av => av[2]),
        addressValues.map(av => av[3]),
        addressValues.map(av => av[4]),
        addressValues.map(av => av[5]),
        addressValues.map(av => av[6]),
        addressValues.map(av => av[7])
      ]);
    }

    await client.query('COMMIT');
    
    // Get the updated client with all relations
    const updatedClient = await getClientById({ params: { id: client_id } }, { 
      send: (data) => data,
      status: (code) => ({ send: (data) => data })
    });
    
    reply.send({
      success: true,
      message: 'Client updated successfully',
      data: updatedClient
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating client:', error);
    reply.status(500).send({
      success: false,
      message: 'Error updating client',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const deleteClient = async (request, reply) => {
  const { id } = request.params;
  const client = await getClient();

  try {
    await client.query('BEGIN');
    
    // First check if client exists
    const checkQuery = 'SELECT client_id FROM clients WHERE client_id = $1';
    const checkResult = await client.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        message: 'Client not found'
      });
    }

    // Delete client (cascade will handle related records)
    const result = await client.query(
      'DELETE FROM clients WHERE client_id = $1 RETURNING client_id',
      [id]
    );

    await client.query('COMMIT');
    
    reply.send({
      success: true,
      message: 'Client deleted successfully',
      data: { client_id: id }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting client:', error);
    reply.status(500).send({
      success: false,
      message: 'Error deleting client',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const importClients = async (request, reply) => {
  const { clients } = request.body;
  
  if (!Array.isArray(clients) || clients.length === 0) {
    return reply.status(400).send({
      success: false,
      message: 'Invalid or empty clients array in request body'
    });
  }

  const client = await getClient();
  const results = {
    total: clients.length,
    success: 0,
    failed: 0,
    errors: []
  };

  try {
    await client.query('BEGIN');

    for (const [index, clientData] of clients.entries()) {
      try {
        const { 
          client_name, 
          email, 
          website, 
          industry, 
          customer_type, 
          tax_id, 
          status = 'active', 
          notes, 
          user_id,
          contacts = [],
          addresses = []
        } = clientData;

        if (!client_name || !user_id) {
          throw new Error('Missing required fields: client_name and user_id are required');
        }

        // Insert client
        const clientQuery = `
          INSERT INTO clients (
            client_name, email, website, industry, 
            customer_type, tax_id, status, notes, user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING client_id, client_code
        `;
        
        const clientValues = [
          client_name, 
          email || null, 
          website || null, 
          industry || null, 
          customer_type || null, 
          tax_id || null, 
          status, 
          notes || null, 
          user_id
        ];
        
        const clientResult = await client.query(clientQuery, clientValues);
        const { client_id } = clientResult.rows[0];

        // Insert contacts if any
        if (contacts.length > 0) {
          const contactValues = contacts.map(contact => [
            client_id,
            contact.name,
            contact.email || null,
            contact.phone || null,
            contact.designation || null
          ]);
          
          const contactQuery = `
            INSERT INTO client_contacts 
              (client_id, name, email, phone, designation)
            SELECT * FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::text[])
          `;
          
          await client.query(contactQuery, [
            contactValues.map(cv => client_id),
            contactValues.map(cv => cv[1]),
            contactValues.map(cv => cv[2]),
            contactValues.map(cv => cv[3]),
            contactValues.map(cv => cv[4])
          ]);
        }

        // Insert addresses if any
        if (addresses.length > 0) {
          const addressValues = addresses.map(addr => [
            client_id,
            addr.address_line1 || null,
            addr.address_line2 || null,
            addr.city || null,
            addr.region_state || null,
            addr.country || null,
            addr.postal_code || null,
            !!addr.is_primary
          ]);

          const addressQuery = `
            INSERT INTO client_addresses (
              client_id, address_line1, address_line2, city, 
              region_state, country, postal_code, is_primary
            ) 
            SELECT * FROM UNNEST(
              $1::int[], 
              $2::text[], 
              $3::text[], 
              $4::text[], 
              $5::text[], 
              $6::text[], 
              $7::text[], 
              $8::boolean[]
            )
          `;

          await client.query(addressQuery, [
            addressValues.map(av => client_id),
            addressValues.map(av => av[1]),
            addressValues.map(av => av[2]),
            addressValues.map(av => av[3]),
            addressValues.map(av => av[4]),
            addressValues.map(av => av[5]),
            addressValues.map(av => av[6]),
            addressValues.map(av => av[7])
          ]);
        }

        results.success++;
      } catch (error) {
        console.error(`Error importing client at index ${index}:`, error);
        results.failed++;
        results.errors.push({
          index,
          error: error.message,
          data: clientData
        });
      }
    }

    await client.query('COMMIT');
    
    reply.status(200).send({
      success: true,
      message: 'Import completed',
      data: results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during import:', error);
    reply.status(500).send({
      success: false,
      message: 'Error during import',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const downloadClientTemplate = async (request, reply) => {
  try {
    // Create sample client data
    const sampleData = [{
      client_name: 'Sample Client Inc.',
      email: 'contact@sampleclient.com',
      website: 'https://sampleclient.com',
      industry: 'Technology',
      customer_type: 'Enterprise',
      tax_id: 'TAX123456',
      status: 'active',
      notes: 'Sample client for import template',
      user_id: 1,
      contact_name: 'John Doe',
      contact_email: 'john.doe@sampleclient.com',
      contact_phone: '+1234567890',
      contact_designation: 'CEO',
      address_line1: '123 Business St',
      address_line2: 'Suite 100',
      city: 'Metropolis',
      region_state: 'CA',
      country: 'USA',
      postal_code: '12345',
      is_primary: true
    }];

    // Create workbook and worksheet
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(sampleData);
    
    // Set column widths
    const columnWidths = [
      { wch: 20 }, // client_name
      { wch: 25 }, // email
      { wch: 25 }, // website
      { wch: 15 }, // industry
      { wch: 15 }, // customer_type
      { wch: 15 }, // tax_id
      { wch: 10 }, // status
      { wch: 25 }, // notes
      { wch: 8 },  // user_id
      { wch: 15 }, // contact_name
      { wch: 25 }, // contact_email
      { wch: 15 }, // contact_phone
      { wch: 20 }, // contact_designation
      { wch: 25 }, // address_line1
      { wch: 15 }, // address_line2
      { wch: 15 }, // city
      { wch: 15 }, // region_state
      { wch: 10 }, // country
      { wch: 12 }, // postal_code
      { wch: 10 }  // is_primary
    ];
    
    ws['!cols'] = columnWidths;
    
    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(wb, ws, 'Clients');
    
    // Generate buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=client_import_template.xlsx');
    
    return buffer;
  } catch (error) {
    request.log.error('Error generating client template:', error);
    return reply.status(500).send({
      status: 'error',
      message: 'Failed to generate client template',
      error: error.message
    });
  }
};
const importClientsFromFile = async (request, reply) => {
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
        if (!row.client_name) {
          throw new Error('Missing required field: client_name');
        }
        // Prepare client data
        const clientData = {
          client_name: row.client_name,
          email: row.email || null,
          website: row.website || null,
          industry: row.industry || null,
          customer_type: row.customer_type || null,
          tax_id: row.tax_id || null,
          status: row.status || 'active',
          notes: row.notes || null,
          user_id: row.user_id || request.user.id,
          contacts: [],
          addresses: []
        };
        // Add contact if provided
        if (row.contact_name) {
          clientData.contacts.push({
            name: row.contact_name,
            email: row.contact_email || null,
            phone: row.contact_phone || null,
            designation: row.contact_designation || null
          });
        }
        // Add address if provided
        if (row.address_line1) {
          clientData.addresses.push({
            address_line1: row.address_line1,
            address_line2: row.address_line2 || '',
            city: row.city || '',
            region_state: row.region_state || '',
            country: row.country || '',
            postal_code: row.postal_code || '',
            is_primary: row.is_primary === 'true' || row.is_primary === true
          });
        }
        // Use the existing importClients function
        await importClients({
          body: { clients: [clientData] },
          user: request.user
        }, {
          status: (code) => ({
            send: (response) => {
              if (code >= 400) {
                throw new Error(response.message || 'Failed to import client');
              }
              return response;
            }
          }),
          send: () => ({})
        });
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
    request.log.error('Error processing client import:', error);
    return reply.status(500).send({
      status: 'error',
      message: 'Failed to process import file',
      error: error.message
    });
  }
};

module.exports = {
  createClient,
  getClientById,
  listClients,
  updateClient,
  deleteClient,
  importClients,
  downloadClientTemplate,
  importClientsFromFile
};