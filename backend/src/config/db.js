const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnorganized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Handle pool errors — prevent server crash
pool.on('error', (err) => {
  console.error('⚠️  PostgreSQL pool error (ignored):', err.message);
});

pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL connected successfully');
    client.release();
  })
  .catch(err => console.error('❌ PostgreSQL connection error:', err.message));

module.exports = pool;