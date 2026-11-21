// Soluções de IA (versão local): servidor HTTP só para este computador (127.0.0.1).
// Serve a página, guarda os dados em data/db.json e repassa os pedidos de IA ao provedor escolhido.
// As chaves de API vêm do .env da pasta do app ou de uma chave colada na sessão (só em memória).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store, ErroStore } from './lib/store.js';
import { lerEnv } from './lib/env.js';
import { PROVEDORES, gerar, listarModelos, ErroIA } from './lib/llm.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(AQUI, 'public');
const DATA = path.join(AQUI, 'data');
const PORTA = Number(process.env.PORT) || 5180;
const HOST = '127.0.0.1';
const ORIGENS = new Set([`http://127.0.0.1:${PORTA}`, `http://localhost:${PORTA}`]);
const HOSTS = new Set([`127.0.0.1:${PORTA}`, `localhost:${PORTA}`]);
const LIMITE_JSON = 5 * 1024 * 1024;
const LIMITE_LOGO = 2 * 1024 * 1024;

let store;
try { store = new Store(DATA); }
catch (e) {
  console.error(`\n[ERRO] Não foi possível ler ${path.join(DATA, 'db.json')}: ${e.message}`);
  console.error('Nada foi alterado. Restaure uma cópia de data\\backups\\ ou corrija o arquivo e abra de novo.\n');
  process.exit(1);
}

const chavesSessao = new Map(); // provedor -> chave; vive só enquanto o servidor estiver aberto

/* ---------- Utilidades ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
function falha(res, status, code, message) { json(res, status, { code, message }); }

function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = []; let total = 0;
    req.on('data', c => { total += c.length; if (total > limite) { reject(new ErroStore(413, 'too_large', 'Arquivo grande demais.')); req.destroy(); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
async function lerJSON(req) {
  const buf = await lerCorpo(req, LIMITE_JSON);
  try { return JSON.parse(buf.toString('utf8') || 'null'); } catch { throw new ErroStore(400, 'invalid_argument', 'JSON inválido.'); }
}

function chaveDe(provedor) {
  const info = PROVEDORES[provedor];
  if (!info) return { chave: '', origem: null };
  if (chavesSessao.has(provedor)) return { chave: chavesSessao.get(provedor), origem: 'sessao' };
  const env = lerEnv(AQUI);
  for (const nome of info.chaves) if (env.vars[nome]) return { chave: env.vars[nome], origem: 'env', variavel: nome };
  return { chave: '', origem: null };
}

/* ---------- Logos (data/logo-<modo>.bin + data/logos.json) ---------- */
const META_LOGOS = path.join(DATA, 'logos.json');
const lerMetaLogos = () => { try { return JSON.parse(fs.readFileSync(META_LOGOS, 'utf8')); } catch { return {}; } };
const gravarMetaLogos = m => fs.writeFileSync(META_LOGOS, JSON.stringify(m, null, 1), 'utf8');
function tipoImagem(b) {
  if (b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const ini = b.toString('utf8', 0, Math.min(b.length, 2048)).replace(/^﻿/, '').trimStart();
  if ((ini.startsWith('<svg') || ini.startsWith('<?xml')) && /<svg[\s>]/i.test(ini)) return 'image/svg+xml';
  return null;
}
function servirLogo(res, modo) {
  const meta = lerMetaLogos();
  // Sem logo própria no modo escuro, usa a do modo claro antes de cair na logo padrão do app.
  const ordem = modo === 'dark' ? ['dark', 'light'] : ['light'];
  for (const m of ordem) {
    const arq = path.join(DATA, `logo-${m}.bin`);
    if (meta[m] && fs.existsSync(arq)) {
      res.writeHead(200, { 'Content-Type': meta[m].tipo, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
      return fs.createReadStream(arq).pipe(res);
    }
  }
  res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
  fs.createReadStream(path.join(PUBLIC, 'assets', `logo-${modo}.svg`)).pipe(res);
}

/* ---------- Rotas da API ---------- */
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/rev' && m === 'GET') return json(res, 200, { rev: store.rev });
  if (p === '/api/db' && m === 'GET') return json(res, 200, store.tudo());

  const doc = p.match(/^\/api\/db\/([^/]+)\/([^/]+)$/);
  if (doc) {
    const col = decodeURIComponent(doc[1]), id = decodeURIComponent(doc[2]);
    if (m === 'PUT') return json(res, 200, { rev: store.set(col, id, await lerJSON(req)) });
    if (m === 'PATCH') return json(res, 200, { rev: store.update(col, id, await lerJSON(req)) });
    if (m === 'DELETE') return json(res, 200, { rev: store.delete(col, id) });
  }

  const logo = p.match(/^\/api\/logo\/(light|dark)$/);
  if (logo) {
    const modo = logo[1];
    if (m === 'GET') return servirLogo(res, modo);
    if (m === 'POST') {
      const buf = await lerCorpo(req, LIMITE_LOGO);
      const tipo = tipoImagem(buf);
      if (!tipo) return falha(res, 415, 'invalid_argument', 'Use PNG, JPG, WebP, GIF ou SVG.');
      fs.writeFileSync(path.join(DATA, `logo-${modo}.bin`), buf);
      const meta = lerMetaLogos(); meta[modo] = { tipo, em: new Date().toISOString() }; gravarMetaLogos(meta);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      fs.rmSync(path.join(DATA, `logo-${modo}.bin`), { force: true });
      const meta = lerMetaLogos(); delete meta[modo]; gravarMetaLogos(meta);
      return json(res, 200, { ok: true });
    }
  }

  if (p === '/api/importar' && m === 'POST') return importar(req, res);

  if (p === '/api/exemplos') {
    if (m === 'GET') return json(res, 200, { total: Object.keys(lerExemplos()).length });
    if (m === 'POST') return exemplos(req, res);
  }

  if (p === '/api/ia/status' && m === 'GET') {
    const env = lerEnv(AQUI);
    const provedores = {};
    for (const [k, info] of Object.entries(PROVEDORES)) {
      const c = chaveDe(k);
      provedores[k] = { nome: info.nome, temChave: !!c.chave, origem: c.origem, variavel: c.variavel || null, variaveis: info.chaves, precisaChave: info.precisaChave };
    }
    return json(res, 200, { provedores, env: { arquivo: env.arquivo, erro: env.erro } });
  }

  if (p === '/api/ia/chave' && m === 'POST') {
    const b = await lerJSON(req) || {};
    const chave = String(b.chave || '').trim();
    if (!PROVEDORES[b.provedor]) return falha(res, 400, 'invalid_argument', 'Provedor desconhecido.');
    if (chave.length < 8 || /\s/.test(chave)) return falha(res, 400, 'invalid_argument', 'Chave inválida.');
    chavesSessao.set(b.provedor, chave);
    return json(res, 200, { ok: true });
  }
  const esquecer = p.match(/^\/api\/ia\/chave\/([a-z]+)$/);
  if (esquecer && m === 'DELETE') { chavesSessao.delete(esquecer[1]); return json(res, 200, { ok: true }); }

  if (p === '/api/ia/modelos' && m === 'GET') {
    const provedor = url.searchParams.get('provedor');
    const { chave } = chaveDe(provedor);
    if (PROVEDORES[provedor] && PROVEDORES[provedor].precisaChave && !chave) return falha(res, 400, 'no_key', 'Não há chave de API para esse provedor.');
    try { return json(res, 200, { modelos: await listarModelos({ provedor, chave, baseUrl: url.searchParams.get('baseUrl') }) }); }
    catch (e) { return falha(res, 502, e.code || 'provider_error', e.message); }
  }

  if (p === '/api/ia/gerar' && m === 'POST') return iaGerar(req, res);

  return falha(res, 404, 'not_found', 'Rota não encontrada.');
}

/* ---------- Soluções de exemplo (exemplos/solucoes.json) ---------- */
// O banco começa vazio. Quem usa escolhe: carregar os exemplos ou começar do zero (config/inicio guarda a escolha).
function lerExemplos() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(AQUI, 'exemplos', 'solucoes.json'), 'utf8'));
    return j && j.solucoes && typeof j.solucoes === 'object' ? j.solucoes : {};
  } catch { return {}; }
}
async function exemplos(req, res) {
  const b = await lerJSON(req) || {};
  const agora = new Date().toISOString();
  const escolha = e => ({ col: 'config', id: 'inicio', data: { escolha: e, em: agora } });
  if (b.acao === 'carregar') {
    const todos = Object.entries(lerExemplos());
    if (!todos.length) return falha(res, 500, 'not_found', 'O arquivo exemplos/solucoes.json não foi encontrado ou está vazio.');
    // Um exemplo que já está no banco fica como está (pode ter sido editado).
    const novos = todos.filter(([id]) => !store.existe('solucoes', id));
    const rev = store.lote([...novos.map(([id, d]) => ({ col: 'solucoes', id, data: { ...d, criadoEm: agora, atualizadoEm: agora } })), escolha('exemplos')]);
    return json(res, 200, { rev, carregadas: novos.length, jaExistiam: todos.length - novos.length });
  }
  if (b.acao === 'zero') return json(res, 200, { rev: store.lote([escolha('zero')]) });
  if (b.acao === 'apagar') {
    const ids = store.ids('solucoes');
    if (ids.length) store.copia(`antes-de-apagar-${agora.replace(/[:.]/g, '-')}.json`);
    const rev = store.lote([...ids.map(id => ({ col: 'solucoes', id, data: null })), escolha('zero')]);
    return json(res, 200, { rev, apagadas: ids.length });
  }
  return falha(res, 400, 'invalid_argument', 'Ação desconhecida.');
}

// Importação pela tela (Configurações): a página confere o arquivo e manda só o que muda.
// Copia o banco antes e grava tudo de uma vez; se um item for recusado, nada é gravado.
const LIMITE_IMPORTAR = 2000;
async function importar(req, res) {
  const b = await lerJSON(req) || {};
  const itens = Array.isArray(b.itens) ? b.itens : null;
  if (!itens || !itens.length) return falha(res, 400, 'invalid_argument', 'Nenhuma solução para importar.');
  if (itens.length > LIMITE_IMPORTAR) return falha(res, 400, 'invalid_argument', `No máximo ${LIMITE_IMPORTAR} soluções por vez.`);
  const lote = itens.map(i => ({ col: 'solucoes', id: String(i && i.id || ''), data: i && i.data }));
  if (lote.some(i => !i.data || typeof i.data !== 'object' || Array.isArray(i.data) || !String(i.data.nome || '').trim())) return falha(res, 400, 'invalid_argument', 'Toda solução precisa de nome.');
  const copia = `antes-de-importar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  store.copia(copia);
  const rev = store.lote(lote);
  return json(res, 200, { rev, gravadas: lote.length, copia });
}

// Resposta em NDJSON: {"t":"d","d":"trecho"} durante a geração, depois {"t":"fim",...} ou {"t":"erro",...}.
async function iaGerar(req, res) {
  const b = await lerJSON(req) || {};
  const provedor = String(b.provedor || '');
  if (!PROVEDORES[provedor]) return falha(res, 400, 'bad_request', 'Provedor desconhecido.');
  const { chave } = chaveDe(provedor);
  if (PROVEDORES[provedor].precisaChave && !chave) return falha(res, 400, 'no_key', 'Não há chave de API para esse provedor.');

  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const linha = o => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
  const inicio = Date.now();
  try {
    const r = await gerar({ provedor, modelo: b.modelo, esforco: b.esforco, baseUrl: b.baseUrl, chave, input: b.input, signal: ctl.signal, onDelta: d => linha({ t: 'd', d }) });
    linha({ t: 'fim', text: r.text, modelo: r.modelo, truncated: !!r.truncated });
    console.log(`  IA ok · ${provedor} · ${r.modelo} · ${Math.round((Date.now() - inicio) / 1000)} s`);
  } catch (e) {
    const code = e instanceof ErroIA ? e.code : 'provider_error';
    if (code !== 'cancelled') console.log(`  IA erro · ${provedor} · ${code}`);
    linha({ t: 'erro', code, message: code === 'cancelled' ? '' : String(e.message || '').slice(0, 500) });
  }
  res.end();
}

/* ---------- Arquivos estáticos ---------- */
function estatico(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  // Texto da licença, linkado no rodapé da página.
  if (rel === '/licenca') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    return fs.createReadStream(path.join(AQUI, 'LICENSE')).pipe(res);
  }
  const arq = path.normalize(path.join(PUBLIC, rel));
  const ext = path.extname(arq).toLowerCase();
  if (!arq.startsWith(PUBLIC + path.sep) || !TIPOS[ext] || !fs.existsSync(arq) || !fs.statSync(arq).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado');
  }
  const h = { 'Content-Type': TIPOS[ext], 'Cache-Control': ext === '.png' ? 'max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  if (ext === '.html') { h['Content-Security-Policy'] = CSP; h['Referrer-Policy'] = 'no-referrer'; }
  res.writeHead(200, h);
  fs.createReadStream(arq).pipe(res);
}

/* ---------- Servidor ---------- */
const servidor = http.createServer(async (req, res) => {
  // Só atende este computador pelo endereço certo (protege contra DNS rebinding).
  if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) { res.writeHead(421); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      // Escritas exigem cabeçalho próprio e origem local: outro site aberto no navegador não consegue chamar a API.
      if (req.method !== 'GET') {
        const origem = req.headers.origin;
        if (req.headers['x-solucoes-ia'] !== '1' || (origem && !ORIGENS.has(origem))) return falha(res, 403, 'forbidden', 'Pedido recusado.');
      }
      return await api(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return estatico(req, res, url);
  } catch (e) {
    if (e instanceof ErroStore) return falha(res, e.status, e.code, e.message);
    console.error('  Erro interno:', e && e.message);
    if (!res.headersSent) falha(res, 500, 'internal', 'Erro interno do servidor local.');
    else res.end();
  }
});

const endereco = `http://localhost:${PORTA}`;
const abrir = () => { if (process.argv.includes('--abrir') && process.platform === 'win32') exec(`start "" "${endereco}"`); };

servidor.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\nA porta ${PORTA} já está em uso. O app provavelmente já está aberto em ${endereco}.`);
    abrir();
    setTimeout(() => process.exit(0), 500);
  } else { console.error(e); process.exit(1); }
});

servidor.listen(PORTA, HOST, () => {
  const env = lerEnv(AQUI);
  console.log('\n  Soluções de IA · versão local');
  console.log(`  Aberto em ${endereco}  (só neste computador)`);
  console.log(`  Dados: ${path.join(DATA, 'db.json')}`);
  if (env.erro === 'leitura') console.log(`  Atenção: não foi possível ler ${env.arquivo}. A IA fica sem chave.`);
  else if (env.erro === 'ausente') console.log('  Atenção: não há .env na pasta do app. Copie .env.example para .env e preencha a chave, ou cole uma chave nas Configurações.');
  console.log('  Para fechar, feche esta janela ou tecle Ctrl+C.\n');
  abrir();
});
