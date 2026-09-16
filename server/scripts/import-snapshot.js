#!/usr/bin/env node
// Semeia o Postgres com o snapshot já publicado neste repo (data/*.json.gz
// e data/gestores.json, data/controlados.json), sem precisar reimportar os
// CSVs originais. Uso único, antes do primeiro deploy da API nova — depois
// disso a base cresce via POST /data/... (o botão Publicar do painel).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const repo = require('../repo');
const { pool } = require('../db');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function readGzJson(file){
  const gz = fs.readFileSync(path.join(DATA_DIR, file));
  return JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
}
function readJson(file){
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

async function main(){
  console.log('[import-snapshot] lendo data/orders.json.gz…');
  const orders = readGzJson('orders.json.gz');
  console.log(`[import-snapshot] ${orders.length} pedidos — gravando no Postgres…`);
  await repo.upsertOrders(orders);

  console.log('[import-snapshot] lendo data/report.json.gz…');
  const report = readGzJson('report.json.gz');
  console.log(`[import-snapshot] ${report.length} pedidos (report VTEX) — gravando no Postgres…`);
  await repo.upsertReportRows(report);

  console.log('[import-snapshot] lendo data/gestores.json…');
  const gestores = readJson('gestores.json');
  console.log(`[import-snapshot] ${gestores.length} filiais — gravando no Postgres…`);
  await repo.replaceGestores(gestores);

  console.log('[import-snapshot] lendo data/controlados.json…');
  const controlados = readJson('controlados.json');
  console.log(`[import-snapshot] ${controlados.length} produtos — gravando no Postgres…`);
  await repo.replaceControlados(controlados);

  console.log('[import-snapshot] concluído.');
}

main()
  .catch(err => { console.error('[import-snapshot] falhou:', err); process.exitCode = 1; })
  .finally(() => pool.end());
