// backend/src/server.js
require('dotenv').config();

const fastify = require('fastify')({ 
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
  disableRequestLogging: true
});

// Register CORS first
fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Authorization']
});

// Register JWT
fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  sign: { expiresIn: '1d' }
});

// Register PostgreSQL with connection pooling
fastify.register(require('@fastify/postgres'), {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/crm_db',
  ssl: { rejectUnauthorized: false }, // Required for Neon DB
  max: 20, // max number of clients in the pool
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 5000 // how long to wait when connecting a new client
});

// Register auth middleware
fastify.register(require('./middleware/auth'));

// Register routes
fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
fastify.register(require('./routes/users'), { prefix: '/api/users' });
fastify.register(require('./routes/regions'), { prefix: '/api/regions' });
fastify.register(require('./routes/roles'), { prefix: '/api/roles' });

// Health check endpoint
fastify.get('/health', async () => {
  try {
    const client = await fastify.pg.connect();
    try {
      await client.query('SELECT NOW()');
      return { 
        status: 'ok', 
        database: 'connected',
        timestamp: new Date().toISOString() 
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Health check failed:', error);
    return { 
      status: 'error',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

// Root endpoint
fastify.get('/', async () => {
  return { 
    name: 'CRM API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  };
});

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '5000', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    console.log('\n========================================');
    console.log(`🚀 Server is running on http://${host}:${port}`);
    console.log('📋 Available endpoints:');
    console.log(`   - POST   /api/auth/login`);
    console.log(`   - GET    /api/auth/me`);
    console.log(`   - GET    /api/users`);
    console.log(`   - POST   /api/users`);
    console.log(`   - GET    /api/regions`);
    console.log(`   - GET    /health`);
    console.log('========================================\n');
    
  } catch (err) {
    console.error('Server error:', err);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Start the server
start();