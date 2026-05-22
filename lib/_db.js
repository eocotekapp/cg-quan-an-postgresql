const { Pool } = require("pg");

let pool;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Thiếu DATABASE_URL PostgreSQL");
  pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 8),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false
  });
  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const rows = r => r?.rows || [];
const row = r => r?.rows?.[0] || null;

module.exports = { getPool, query, transaction, rows, row };
