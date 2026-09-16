const express = require('express');
const compression = require('compression');
const cors = require('cors');
const repo = require('./repo');

const PORT = process.env.PORT || 4000;
const PUBLISH_TOKEN = process.env.DASHBOARD_PUBLISH_TOKEN;
const ALLOWED_ORIGIN = process.env.DASHBOARD_ALLOWED_ORIGIN || '*';
// Payload de orders/report pode passar de 100MB descompactado com a base
// acumulada — limite generoso de propósito, ajuste via env se precisar.
const BODY_LIMIT = process.env.DASHBOARD_BODY_LIMIT || '300mb';

if (!PUBLISH_TOKEN){
  console.error('[server] DASHBOARD_PUBLISH_TOKEN não configurado — defina essa env var antes de subir o servidor (sem ela, ninguém consegue publicar, mas também não corre o risco de subir com escrita aberta pra qualquer um).');
  process.exit(1);
}

// Todas as rotas vivem sob API_PREFIX (mesmo valor de API_BASE no
// index.html) — assim a API funciona sozinha, direto na porta do Node, sem
// depender de o reverse proxy do servidor cortar o prefixo do caminho.
// Se o proxy já fizer esse corte (proxy_pass com barra final, por ex.),
// mude API_PREFIX pra '' aqui e API_BASE pra '' lá.
// (!== undefined, não ||: precisa aceitar DASHBOARD_API_PREFIX='' pra montar na raiz)
const API_PREFIX = process.env.DASHBOARD_API_PREFIX !== undefined ? process.env.DASHBOARD_API_PREFIX : '/lastmile-api';

const app = express();
app.use(compression()); // Content-Encoding: gzip automático — o fetch() do navegador descompacta sozinho
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: BODY_LIMIT }));

function requireAuth(req, res, next){
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== PUBLISH_TOKEN){
    return res.status(401).json({ error: 'Token inválido ou ausente.' });
  }
  next();
}

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

// ---------- leitura (pública, igual ao painel publicado hoje) ----------
router.get('/data/orders.json', async (req, res, next) => {
  try{ res.json(await repo.listOrders()); } catch(err){ next(err); }
});
router.get('/data/report.json', async (req, res, next) => {
  try{ res.json(await repo.listReportRows()); } catch(err){ next(err); }
});
router.get('/data/gestores.json', async (req, res, next) => {
  try{ res.json(await repo.listGestores()); } catch(err){ next(err); }
});
router.get('/data/controlados.json', async (req, res, next) => {
  try{ res.json(await repo.listControlados()); } catch(err){ next(err); }
});

// ---------- escrita (exige o token do botão Publicar) ----------
router.post('/data/orders', requireAuth, async (req, res, next) => {
  try{
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Corpo precisa ser um array.' });
    const n = await repo.upsertOrders(req.body);
    res.json({ ok: true, upserted: n });
  } catch(err){ next(err); }
});
router.post('/data/report', requireAuth, async (req, res, next) => {
  try{
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Corpo precisa ser um array.' });
    const n = await repo.upsertReportRows(req.body);
    res.json({ ok: true, upserted: n });
  } catch(err){ next(err); }
});
router.post('/data/gestores', requireAuth, async (req, res, next) => {
  try{
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Corpo precisa ser um array.' });
    const n = await repo.replaceGestores(req.body);
    res.json({ ok: true, replaced: n });
  } catch(err){ next(err); }
});
router.post('/data/controlados', requireAuth, async (req, res, next) => {
  try{
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Corpo precisa ser um array.' });
    const n = await repo.replaceControlados(req.body);
    res.json({ ok: true, replaced: n });
  } catch(err){ next(err); }
});

if (API_PREFIX) app.use(API_PREFIX, router); else app.use(router);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[server] erro:', err);
  res.status(500).json({ error: err.message || 'Erro interno.' });
});

app.listen(PORT, () => {
  console.log(`[server] API do painel Last Mile ouvindo na porta ${PORT}`);
});
