-- Persistência do painel Last Mile São João — PostgreSQL 18.
-- Schema dedicado (o Postgres é compartilhado com o SaaS do servidor):
-- roda inteiro dentro de lastmile_dashboard, sem tocar em nada de fora.
--
-- Espelha exatamente os campos compactos que o navegador já produz hoje
-- (pickOrderFields / pickReportRawFields / leitura de gestores e
-- controlados em index.html) — é só onde os dados moram, não um schema novo.

CREATE SCHEMA IF NOT EXISTS lastmile_dashboard;

-- Um pedido por order_number. INSERT ... ON CONFLICT DO UPDATE na
-- publicação — nunca é limpa (o navegador já acumula o histórico completo
-- antes de publicar, igual ao mergeByKey de hoje).
--
-- Os campos de data/hora ficam como TEXT, não timestamptz: o navegador
-- recebe datas em formatos mistos (BR "dd/mm/aaaa hh:mm" e ISO) e só ele
-- faz esse parse (parseAnyDate em index.html), sempre em cima do valor cru.
-- Guardar aqui já parseado duplicaria essa lógica em dois lugares e arrisca
-- diferença de comportamento — a API só é persistência, não reinterpreta o
-- dado.
CREATE TABLE IF NOT EXISTS lastmile_dashboard.orders (
  order_number         text PRIMARY KEY,
  order_type           text,
  status               text,
  origin               text, -- order_creation_origin (oco) — VALID_ORIGINS no index.html filtra por isto
  seller_id            text,
  seller_trading_name  text,
  carrier              text,
  driver                text,
  created_at            text,
  promised_at           text,
  delivered_at          text,
  ev_dispatched         text,
  ev_in_transit         text,
  ev_collected          text,
  ev_delivered          text,
  status_updated_at     text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Um pedido (já deduplicado por SKU) por order_number. Mesma semântica de
-- upsert sem limpeza que orders.
CREATE TABLE IF NOT EXISTS lastmile_dashboard.report_rows (
  order_number  text PRIMARY KEY,
  creation      text,
  last_change   text,
  courrier      text,
  sla_type      text,
  deadline      text,
  seller        text,
  value         numeric,
  prods         jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Base de gestores por filial — publicação SUBSTITUI o conteúdo inteiro
-- (TRUNCATE + insert em transação), igual ao "substitui a base anterior"
-- que já existe hoje no navegador.
CREATE TABLE IF NOT EXISTS lastmile_dashboard.gestores (
  cod          text PRIMARY KEY,
  filial       text,
  diretor      text,
  distrital    text,
  coordenador  text,
  uf           text,
  regional     text
);

-- Base de produtos controlados — publicação também SUBSTITUI o conteúdo
-- inteiro.
CREATE TABLE IF NOT EXISTS lastmile_dashboard.controlados (
  material  text PRIMARY KEY,
  texto     text
);
