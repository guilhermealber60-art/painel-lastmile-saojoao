require('dotenv').config();
const { Pool } = require('pg');

// DATABASE_URL (ex.: postgres://user:pass@localhost:5432/saas_db) ou as
// variáveis PG* padrão do node-postgres (PGHOST, PGUSER, PGPASSWORD,
// PGDATABASE, PGPORT) — o que já estiver configurado pro Postgres do SaaS
// no servidor serve aqui também, contanto que aponte pro mesmo banco.
const pool = new Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined
);

pool.on('error', (err) => {
  console.error('[db] erro inesperado em conexão ociosa do pool:', err);
});

module.exports = { pool };
