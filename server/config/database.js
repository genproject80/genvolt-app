import sql from 'mssql';
import { logger } from '../utils/logger.js';

// Database configuration - lazy loaded to ensure env vars are available
const getDbConfig = () => ({
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE || 'GenVolt',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    instanceName: process.env.DB_INSTANCE_NAME || undefined,
  },
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
  requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT) || 30000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
});

let poolPromise;

/**
 * Initialize database connection pool
 */
export const connectDB = async () => {
  try {
    if (poolPromise) {
      return poolPromise;
    }

    const dbConfig = getDbConfig();
    logger.info('Connecting to SQL Server database...');
    logger.info(`Database: ${dbConfig.database}@${dbConfig.server}:${dbConfig.port}`);
    logger.info(`DB Config - User: ${dbConfig.user ? '[SET]' : '[EMPTY]'}, Database: ${dbConfig.database}`);

    poolPromise = new sql.ConnectionPool(dbConfig);
    
    poolPromise.on('connect', () => {
      logger.info('✅ Connected to SQL Server database');
    });

    poolPromise.on('error', (err) => {
      logger.error('❌ Database connection error:', err);
      poolPromise = null;
    });

    await poolPromise.connect();
    return poolPromise;
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error);
    poolPromise = null;
    throw error;
  }
};

/**
 * Get database connection pool
 */
export const getDB = async () => {
  try {
    if (!poolPromise) {
      await connectDB();
    }
    return poolPromise;
  } catch (error) {
    logger.error('Failed to get database connection:', error);
    throw error;
  }
};

/**
 * Get pool instance (for backward compatibility)
 */
export const getPool = () => poolPromise;

/**
 * Export pool for direct access
 */
export { poolPromise as pool };

/**
 * Execute a SQL query with parameters
 * @param {string} query - SQL query string
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export const executeQuery = async (query, params = {}) => {
  try {
    const pool = await getDB();
    const request = pool.request();

    // Add parameters to request
    Object.keys(params).forEach(key => {
      const value = params[key];
      // Always bind parameters, including null values
      request.input(key, value);
    });

    const result = await request.query(query);
    return result;
  } catch (error) {
    logger.error('Database query error:', {
      query,
      params,
      error: error.message
    });
    throw error;
  }
};

/**
 * Execute a stored procedure with parameters
 * @param {string} procedureName - Stored procedure name
 * @param {Object} params - Procedure parameters
 * @returns {Promise<Object>} Procedure result
 */
export const executeProcedure = async (procedureName, params = {}) => {
  try {
    const pool = await getDB();
    const request = pool.request();

    // Add parameters to request
    Object.keys(params).forEach(key => {
      const param = params[key];
      if (param && typeof param === 'object' && param.type && param.value !== undefined) {
        // Typed parameter
        request.input(key, param.type, param.value);
      } else if (param !== undefined) {
        // Auto-detect type
        request.input(key, param);
      }
    });

    const result = await request.execute(procedureName);
    return result;
  } catch (error) {
    logger.error('Stored procedure execution error:', {
      procedureName,
      params,
      error: error.message
    });
    throw error;
  }
};

/**
 * Begin a database transaction
 */
export const beginTransaction = async () => {
  try {
    const pool = await getDB();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    return transaction;
  } catch (error) {
    logger.error('Failed to begin transaction:', error);
    throw error;
  }
};

/**
 * Health check for database connection
 */
export const checkDatabaseHealth = async () => {
  try {
    const result = await executeQuery('SELECT 1 as health_check, GETUTCDATE() as timestamp');
    return {
      status: 'healthy',
      timestamp: result.recordset[0].timestamp,
      responseTime: Date.now()
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Close database connection
 */
export const closeDB = async () => {
  try {
    if (poolPromise) {
      await poolPromise.close();
      poolPromise = null;
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
};

// Handle application termination
process.on('SIGINT', closeDB);
process.on('SIGTERM', closeDB);

export { sql };