# API de persistência — painel Last Mile

Substitui o "Publicar" via commit no GitHub por um Postgres real, pra rodar
no servidor privado ao lado do SaaS. Não muda nenhum cálculo/agregação do
painel — só onde os dados de origem (`orders`, `report`, `gestores`,
`controlados`) são lidos e gravados.

## Deploy

```bash
cd server
npm install
cp .env.example .env   # preenche DATABASE_URL e DASHBOARD_PUBLISH_TOKEN
npm run migrate        # cria o schema lastmile_dashboard (idempotente)
npm run import-snapshot  # opcional: semeia com o snapshot já publicado no repo (data/*.json.gz)
npm start               # sobe a API (porta 4000 por padrão, PORT no .env muda)
```

Rodar como serviço (pm2 ou systemd) em vez de `npm start` direto, pra
sobreviver a reboot/crash — fica a critério de quem administra o servidor.

## Endpoints

Todos sob o prefixo `DASHBOARD_API_PREFIX` (`/lastmile-api` por padrão —
precisa bater com a constante `API_BASE` do `index.html`, ver abaixo).

Leitura pública (o painel publicado é público hoje, mantido assim):
- `GET /lastmile-api/data/orders.json`
- `GET /lastmile-api/data/report.json`
- `GET /lastmile-api/data/gestores.json`
- `GET /lastmile-api/data/controlados.json`

Escrita — exige `Authorization: Bearer <DASHBOARD_PUBLISH_TOKEN>`:
- `POST /lastmile-api/data/orders` — corpo: array completo de pedidos
  (formato compacto, igual ao que o navegador já monta). Upsert por número
  do pedido, nunca apaga o que não vier no payload.
- `POST /lastmile-api/data/report` — igual, pro report da VTEX.
- `POST /lastmile-api/data/gestores` — corpo: array completo. **Substitui**
  a base inteira (truncate + insert).
- `POST /lastmile-api/data/controlados` — igual, pra base de produtos
  controlados.

`GET /lastmile-api/health` — checagem simples, sem tocar no banco.

## No `index.html`

A constante `API_BASE` (perto do topo do `<script>`) já vem como
`/lastmile-api`, batendo com o prefixo padrão da API. Duas formas de
publicar isso no servidor:

1. **Reverse proxy repassa o caminho como está** (ex.: nginx com
   `proxy_pass http://localhost:4000;`, sem barra final) — não precisa
   mudar nada, nem em `API_BASE` nem em `DASHBOARD_API_PREFIX`.
2. **Reverse proxy já corta o prefixo** antes de encaminhar (ex.: nginx com
   `proxy_pass http://localhost:4000/;`, barra final) — nesse caso zere os
   dois: `API_BASE = ''` no `index.html` e `DASHBOARD_API_PREFIX=` (vazio)
   no `.env` do servidor.

Se a API ficar num host/porta diferente de onde o `index.html` é servido,
`API_BASE` vira uma URL absoluta (ex.:
`https://dash.seudominio.interno:4000`) e é preciso configurar
`DASHBOARD_ALLOWED_ORIGIN` no `.env` com a origem exata de onde o painel é
servido, pro CORS liberar.

O token de publicação continua sendo colado no mesmo diálogo ⚙️ de sempre —
só muda o que ele autentica (era o GitHub, agora é `DASHBOARD_PUBLISH_TOKEN`
da API).
