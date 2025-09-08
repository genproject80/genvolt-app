import dotenv from 'dotenv';
dotenv.config();

import sql from 'mssql';

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE || 'GenVolt',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
  },
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
  requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT) || 30000,
};

console.log('=== Database Connection Test ===');
console.log('Attempting to connect with config:');
console.log({
  server: dbConfig.server,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password ? '[HIDDEN]' : '[NOT SET]',
  encrypt: dbConfig.options.encrypt,
  trustServerCertificate: dbConfig.options.trustServerCertificate
});

async function testConnection() {
  try {
    console.log('\nConnecting...');
    const pool = new sql.ConnectionPool(dbConfig);
    
    pool.on('connect', () => {
      console.log('✅ Connected to SQL Server successfully!');
    });

    pool.on('error', (err) => {
      console.log('❌ Connection pool error:', err.message);
    });

    await pool.connect();
    
    console.log('✅ Connection established!');
    
    // Test a simple query
    const result = await pool.request().query('SELECT 1 as test, GETDATE() as current_time');
    console.log('✅ Test query successful:', result.recordset[0]);
    
    await pool.close();
    console.log('✅ Connection closed gracefully');
    
  } catch (error) {
    console.log('❌ Connection failed:');
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);
    
    if (error.code === 'ELOGIN') {
      console.log('\n🔍 Troubleshooting ELOGIN error:');
      console.log('1. Check if SQL Server is running');
      console.log('2. Verify username and password are correct');
      console.log('3. Check if SQL Server Authentication is enabled');
      console.log('4. Verify the user exists and has login permissions');
      console.log('5. Check if the database exists');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n🔍 Troubleshooting ECONNREFUSED error:');
      console.log('1. Check if SQL Server is running');
      console.log('2. Verify the server name/port is correct');
      console.log('3. Check firewall settings');
    } else if (error.code === 'ETIMEOUT') {
      console.log('\n🔍 Troubleshooting ETIMEOUT error:');
      console.log('1. Check network connectivity');
      console.log('2. Verify server name and port');
      console.log('3. Check firewall settings');
    }
  }
}

testConnection();