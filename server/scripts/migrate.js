#!/usr/bin/env node
// Aplica server/schema.sql no Postgres configurado (DATABASE_URL / PG*).
// Idempotente — todo CREATE usa IF NOT EXISTS, pode rodar de novo sem medo.
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function main(){
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try{
    await client.query(sql);
    console.log('[migrate] schema lastmile_dashboard aplicado com sucesso.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[migrate] falhou:', err);
  process.exit(1);
});
