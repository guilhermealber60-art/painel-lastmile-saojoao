const { pool } = require('./db');

const SCHEMA = 'lastmile_dashboard';
const CHUNK_SIZE = 500; // linhas por INSERT — fica bem abaixo do limite de 65535 params do Postgres

function chunk(arr, size){
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* INSERT ... ON CONFLICT (id) DO UPDATE em lote, dentro de uma transação.
   `rows` já vem no formato de colunas do banco (um objeto por linha, mesma
   chave = mesma ordem de `columns`). Não apaga nada fora do payload. */
async function upsertBatch(client, { table, columns, conflictColumn, rows }){
  if (!rows.length) return 0;
  const updateSet = columns.filter(c => c !== conflictColumn).map(c => `${c}=EXCLUDED.${c}`).join(', ');
  for (const part of chunk(rows, CHUNK_SIZE)){
    const values = [];
    const tuples = part.map((row, i) => {
      const placeholders = columns.map((c, j) => { values.push(row[c]); return `$${i*columns.length + j + 1}`; });
      return `(${placeholders.join(',')})`;
    });
    const sql = `INSERT INTO ${SCHEMA}.${table} (${columns.join(',')}) VALUES ${tuples.join(',')}
      ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateSet}, updated_at=now()`;
    await client.query(sql, values);
  }
  return rows.length;
}

/* TRUNCATE + insert em lote, dentro de uma transação — usado pelas bases de
   referência (gestores, controlados) que são sempre substituídas por
   inteiro na publicação, nunca mescladas. */
async function replaceAll(client, { table, columns, rows }){
  await client.query(`TRUNCATE ${SCHEMA}.${table}`);
  if (!rows.length) return 0;
  for (const part of chunk(rows, CHUNK_SIZE)){
    const values = [];
    const tuples = part.map((row, i) => {
      const placeholders = columns.map((c, j) => { values.push(row[c]); return `$${i*columns.length + j + 1}`; });
      return `(${placeholders.join(',')})`;
    });
    await client.query(`INSERT INTO ${SCHEMA}.${table} (${columns.join(',')}) VALUES ${tuples.join(',')}`, values);
  }
  return rows.length;
}

async function withTransaction(fn){
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch(err){
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* =====================================================================
   ORDERS — compacto: on, ot, os, oco, sid, stn, carrier, driver, createdAt,
   promised, delivered, evDispatched, evInTransit, evCollected, evDelivered,
   statusUpdatedAt (mesmas chaves que pickOrderFields produz no navegador).
===================================================================== */
const ORDERS_COLUMNS = [
  'order_number','order_type','status','origin','seller_id','seller_trading_name',
  'carrier','driver','created_at','promised_at','delivered_at',
  'ev_dispatched','ev_in_transit','ev_collected','ev_delivered','status_updated_at',
];
function orderToRow(o){
  return {
    order_number: o.on, order_type: o.ot, status: o.os, origin: o.oco,
    seller_id: o.sid, seller_trading_name: o.stn, carrier: o.carrier, driver: o.driver,
    created_at: o.createdAt, promised_at: o.promised, delivered_at: o.delivered,
    ev_dispatched: o.evDispatched, ev_in_transit: o.evInTransit,
    ev_collected: o.evCollected, ev_delivered: o.evDelivered, status_updated_at: o.statusUpdatedAt,
  };
}
function rowToOrder(r){
  return {
    on: r.order_number, ot: r.order_type, os: r.status, oco: r.origin,
    sid: r.seller_id, stn: r.seller_trading_name, carrier: r.carrier, driver: r.driver,
    createdAt: r.created_at, promised: r.promised_at, delivered: r.delivered_at,
    evDispatched: r.ev_dispatched, evInTransit: r.ev_in_transit,
    evCollected: r.ev_collected, evDelivered: r.ev_delivered, statusUpdatedAt: r.status_updated_at,
  };
}
async function listOrders(){
  const { rows } = await pool.query(`SELECT ${ORDERS_COLUMNS.join(',')} FROM ${SCHEMA}.orders ORDER BY order_number`);
  return rows.map(rowToOrder);
}
async function upsertOrders(orders){
  const rows = orders.filter(o => o && o.on).map(orderToRow);
  return withTransaction(client => upsertBatch(client, {
    table: 'orders', columns: ORDERS_COLUMNS, conflictColumn: 'order_number', rows,
  }));
}

/* =====================================================================
   REPORT ROWS — compacto: order, creation, lastChange, courrier, slaType,
   deadline, seller, value, prods (array de códigos de produto).
===================================================================== */
const REPORT_COLUMNS = ['order_number','creation','last_change','courrier','sla_type','deadline','seller','value','prods'];
function reportToRow(r){
  return {
    order_number: r.order, creation: r.creation, last_change: r.lastChange, courrier: r.courrier,
    sla_type: r.slaType, deadline: r.deadline, seller: r.seller, value: r.value,
    prods: JSON.stringify(Array.isArray(r.prods) ? r.prods : []),
  };
}
function rowToReport(r){
  return {
    order: r.order_number, creation: r.creation, lastChange: r.last_change, courrier: r.courrier,
    slaType: r.sla_type, deadline: r.deadline, seller: r.seller,
    value: r.value != null ? Number(r.value) : null,
    prods: r.prods || [],
  };
}
async function listReportRows(){
  const { rows } = await pool.query(`SELECT ${REPORT_COLUMNS.join(',')} FROM ${SCHEMA}.report_rows ORDER BY order_number`);
  return rows.map(rowToReport);
}
async function upsertReportRows(reportRows){
  const rows = reportRows.filter(r => r && r.order).map(reportToRow);
  return withTransaction(client => upsertBatch(client, {
    table: 'report_rows', columns: REPORT_COLUMNS, conflictColumn: 'order_number', rows,
  }));
}

/* =====================================================================
   GESTORES — compacto: cod, filial, diretor, distrital, coordenador, uf,
   regional. Publicação SUBSTITUI a base inteira.
===================================================================== */
const GESTORES_COLUMNS = ['cod','filial','diretor','distrital','coordenador','uf','regional'];
async function listGestores(){
  const { rows } = await pool.query(`SELECT ${GESTORES_COLUMNS.join(',')} FROM ${SCHEMA}.gestores ORDER BY cod`);
  return rows;
}
async function replaceGestores(gestores){
  const rows = gestores.filter(g => g && g.cod);
  return withTransaction(client => replaceAll(client, { table: 'gestores', columns: GESTORES_COLUMNS, rows }));
}

/* =====================================================================
   CONTROLADOS — compacto: material, texto. Publicação SUBSTITUI a base
   inteira.
===================================================================== */
const CONTROLADOS_COLUMNS = ['material','texto'];
async function listControlados(){
  const { rows } = await pool.query(`SELECT ${CONTROLADOS_COLUMNS.join(',')} FROM ${SCHEMA}.controlados ORDER BY material`);
  return rows;
}
async function replaceControlados(controlados){
  const rows = controlados.filter(c => c && c.material);
  return withTransaction(client => replaceAll(client, { table: 'controlados', columns: CONTROLADOS_COLUMNS, rows }));
}

module.exports = {
  listOrders, upsertOrders,
  listReportRows, upsertReportRows,
  listGestores, replaceGestores,
  listControlados, replaceControlados,
};
