/* Soluções de IA (versão local): ponte entre a página e o servidor local (server.js).
   Oferece à página as funções de banco, IA, usuário e downloads (window.claude.use) e cuida das Configurações.
   Nenhuma chave de API passa por aqui: o servidor as lê do .env da pasta do app. */
(function () {
  'use strict';
  const H = { 'Content-Type': 'application/json', 'X-Solucoes-IA': '1' };
  const erro = (code, message) => Object.assign(new Error(message || code), { code });
  const clone = o => JSON.parse(JSON.stringify(o));
  const el = id => document.getElementById(id);
  const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(metodo, url, corpo) {
    let r;
    try { r = await fetch(url, { method: metodo, headers: H, body: corpo === undefined ? undefined : JSON.stringify(corpo) }); }
    catch (e) { throw erro('unavailable', 'O servidor local não respondeu.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw erro(j.code || 'unavailable', j.message || ('HTTP ' + r.status));
    return j;
  }

  /* ---------- Configurações (documento config/app) ---------- */
  const PADRAO = {
    provedor: 'anthropic', modelo: 'claude-opus-5-5', esforco: 'medium', baseUrl: 'http://localhost:11434/v1',
    empresa: 'Minha empresa', areas: ['Atendimento', 'Vendas', 'Marketing', 'Financeiro', 'Pessoas', 'Operação', 'Dados'],
    setoresDono: {}
  };
  const PROVS = {
    anthropic: { nome: 'Anthropic (Claude)', curto: 'Anthropic', modelos: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
      esforcos: ['low', 'medium', 'high', 'xhigh', 'max'], dica: 'O esforço controla quanto o Claude raciocina antes de responder. Médio é um bom equilíbrio para classificar; alto e acima custam mais e demoram mais.' },
    openai: { nome: 'OpenAI', curto: 'OpenAI', modelos: ['gpt-5', 'gpt-5-mini'],
      esforcos: ['minimal', 'low', 'medium', 'high'], dica: 'O esforço vale para os modelos de raciocínio. Em modelos sem raciocínio, o app repete o pedido sem ele.' },
    gemini: { nome: 'Google Gemini', curto: 'Gemini', modelos: ['gemini-2.5-pro', 'gemini-2.5-flash'],
      esforcos: ['low', 'medium', 'high'], dica: 'O esforço vira o nível de raciocínio (thinking) do Gemini.' },
    compat: { nome: 'Compatível com OpenAI (Ollama, LM Studio, OpenRouter…)', curto: 'Compatível', modelos: ['llama3.1', 'qwen2.5'],
      esforcos: ['low', 'medium', 'high'], dica: 'Serve para modelos rodando no próprio computador (Ollama, LM Studio) ou em serviços com API no padrão da OpenAI. Modelos locais costumam errar mais o formato da resposta.' }
  };
  const ESF_L = { '': 'Padrão do modelo', minimal: 'Mínimo (minimal)', low: 'Baixo (low)', medium: 'Médio (medium)', high: 'Alto (high)', xhigh: 'Muito alto (xhigh)', max: 'Máximo (max)' };

  let estado = null;                 // { rev, solucoes, config } vindo do servidor
  const ouvintesCfg = [];
  function cfg() {
    const c = Object.assign({}, PADRAO, (estado && estado.config && estado.config.app) || {});
    if (!PROVS[c.provedor]) c.provedor = PADRAO.provedor;
    if (!Array.isArray(c.areas) || !c.areas.length) c.areas = PADRAO.areas.slice();
    if (!c.setoresDono || typeof c.setoresDono !== 'object' || Array.isArray(c.setoresDono)) c.setoresDono = {};
    return c;
  }
  function iaNome() {
    const c = cfg();
    return `${c.modelo} (${PROVS[c.provedor].curto}${c.esforco ? ', esforço ' + c.esforco : ''})`;
  }
  function aplicarCfg() { const c = cfg(); ouvintesCfg.forEach(fn => { try { fn(c); } catch (e) { console.error(e); } }); }

  /* ---------- Banco (db) ---------- */
  const ouvintes = new Set();
  let carregando = null;
  const snapCol = col => {
    const docs = Object.entries((estado && estado[col]) || {}).map(([id, d]) => ({ id, exists: true, data: () => clone(d) }));
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false } };
  };
  const snapDoc = (col, id) => { const d = estado && estado[col] && estado[col][id]; return { id, exists: !!d, data: () => (d ? clone(d) : undefined) }; };
  const avisar = o => { try { o.cb(o.tipo === 'col' ? snapCol(o.col) : snapDoc(o.col, o.id)); } catch (e) { console.error(e); } };

  function recarregar(forcar) {
    if (carregando) return carregando;
    carregando = (async () => {
      try {
        if (!forcar && estado) { const { rev } = await api('GET', '/api/rev'); if (rev === estado.rev) return; }
        const novo = await api('GET', '/api/db');
        const cfgAntes = JSON.stringify(estado && estado.config && estado.config.app);
        const primeira = !estado;
        estado = novo;
        ouvintes.forEach(avisar);
        if (primeira || JSON.stringify(estado.config && estado.config.app) !== cfgAntes) aplicarCfg();
        if (primeira) setTimeout(verInicio, 0);
      } finally { carregando = null; }
    })();
    return carregando;
  }
  async function escrever(metodo, col, id, corpo) {
    await api(metodo, `/api/db/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, corpo);
    if (carregando) await carregando.catch(() => {});
    await recarregar(true).catch(() => {});
  }
  function ouvir(o) {
    ouvintes.add(o);
    if (estado) avisar(o);
    else recarregar(true).catch(e => { if (o.err) o.err(e); });
    return () => ouvintes.delete(o);
  }
  function docRef(col, id) {
    return {
      id,
      get: async () => { if (!estado) await recarregar(true); return snapDoc(col, id); },
      set: data => escrever('PUT', col, id, data),
      update: data => escrever('PATCH', col, id, data),
      delete: () => escrever('DELETE', col, id),
      onSnapshot: (cb, err) => ouvir({ tipo: 'doc', col, id, cb, err })
    };
  }
  const db = {
    collection: col => ({ doc: id => docRef(col, id), onSnapshot: (cb, err) => ouvir({ tipo: 'col', col, cb, err }) }),
    doc: caminho => { const [col, id] = String(caminho).split('/'); return docRef(col, id); }
  };
  // Outra aba ou janela pode ter gravado: confere a revisão a cada 4 segundos com a página visível.
  setInterval(() => { if (document.visibilityState === 'visible') recarregar(false).catch(() => {}); }, 4000);

  /* ---------- IA (sample) ---------- */
  async function chamar(input, opts) {
    opts = opts || {};
    const c = cfg();
    let r;
    try {
      r = await fetch('/api/ia/gerar', { method: 'POST', headers: H, signal: opts.signal,
        body: JSON.stringify({ provedor: c.provedor, modelo: c.modelo, esforco: c.esforco, baseUrl: c.baseUrl, input }) });
    } catch (e) { throw (e && e.name === 'AbortError') ? erro('cancelled') : erro('server_down'); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw erro(j.code || 'provider_error', j.message); }
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', texto = '', fim = null;
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const linha = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha);
          if (ev.t === 'd') { texto += ev.d; if (opts.onText) { try { opts.onText({ text: texto, delta: ev.d }); } catch (e) {} } }
          else if (ev.t === 'fim') fim = ev;
          else if (ev.t === 'erro') throw erro(ev.code, ev.message);
        }
      }
    } catch (e) { if (e && e.name === 'AbortError') throw erro('cancelled'); throw e; }
    if (!fim) throw erro('provider_error', 'A resposta da IA veio incompleta.');
    return { text: fim.text != null ? fim.text : texto, truncated: !!fim.truncated, modelApplied: fim.modelo };
  }
  function extrairJSON(t) {
    let s = String(t || '').trim();
    const cerca = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (cerca) s = cerca[1].trim();
    try { return JSON.parse(s); } catch (e) {}
    const ini = s.search(/[\[{]/), fimO = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (ini >= 0 && fimO > ini) { try { return JSON.parse(s.slice(ini, fimO + 1)); } catch (e) {} }
    throw erro('invalid_json');
  }
  const sample = Object.assign((input, opts) => chamar(input, opts), {
    json: async (input, opts) => extrairJSON((await chamar(input, opts)).text),
    limits: async () => ({ images: false })
  });

  /* ---------- Download e usuário ---------- */
  const downloads = {
    save: async ({ filename, data, mimeType }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || (/\.csv$/i.test(filename || '') ? 'text/csv;charset=utf-8' : 'application/octet-stream') });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'arquivo';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { status: 'saved' };
    }
  };
  const user = { isOwner: () => true, canEdit: () => true, can: async () => true, id: async () => 'local', me: async () => ({ id: 'local', name: 'Você' }) };

  window.claude = { use: async nome => ({ db, sample, downloads, user })[nome] || null };

  /* ---------- Tela de Configurações ---------- */
  let statusIA = null;
  let provAnterior = null;

  function opcoesProvedor() {
    el('c-prov').innerHTML = Object.entries(PROVS).map(([k, p]) => `<option value="${k}">${escH(p.nome)}</option>`).join('');
  }
  function aoTrocarProvedor(manterModelo) {
    const k = el('c-prov').value, p = PROVS[k];
    const mod = el('c-modelo');
    if (!manterModelo && provAnterior && provAnterior !== k) mod.value = p.modelos[0];
    provAnterior = k;
    el('dl-modelos').innerHTML = p.modelos.map(m => `<option value="${escH(m)}"></option>`).join('');
    const atual = el('c-esforco').value;
    el('c-esforco').innerHTML = ['', ...p.esforcos].map(v => `<option value="${v}">${escH(ESF_L[v])}</option>`).join('');
    el('c-esforco').value = ['', ...p.esforcos].includes(atual) ? atual : (p.esforcos.includes('medium') ? 'medium' : '');
    el('c-esforco-hint').textContent = p.dica;
    el('fld-base').hidden = k !== 'compat';
    el('c-testar-st').textContent = '';
    renderChave();
  }
  function renderChave() {
    const k = el('c-prov').value, box = el('c-key');
    const s = statusIA && statusIA.provedores && statusIA.provedores[k];
    el('c-chave-esquecer').hidden = !(s && s.origem === 'sessao');
    if (!s) { box.className = 'cfg-key'; box.textContent = 'Verificando a chave…'; return; }
    const env = statusIA.env || {};
    if (s.origem === 'env') { box.className = 'cfg-key ok'; box.innerHTML = `Chave encontrada no <code>.env</code> do app (variável <code>${escH(s.variavel)}</code>).`; return; }
    if (s.origem === 'sessao') { box.className = 'cfg-key ok'; box.textContent = 'Usando a chave colada nesta sessão. Ela some quando o servidor local for fechado.'; return; }
    if (!s.precisaChave) { box.className = 'cfg-key'; box.innerHTML = `Sem chave. Para Ollama e LM Studio ela não é necessária; para serviços pagos, preencha <code>${escH(s.variaveis[0])}=</code> no <code>.env</code> do app.`; return; }
    box.className = 'cfg-key off';
    if (env.erro === 'leitura') { box.innerHTML = `Não foi possível ler o <code>.env</code>${env.arquivo ? ` (<code>${escH(env.arquivo)}</code>)` : ''}. Confira o arquivo e clique em Testar conexão.`; return; }
    if (env.erro === 'ausente') { box.innerHTML = `Não há <code>.env</code> na pasta do app. Copie o <code>.env.example</code> para <code>.env</code>, preencha <code>${escH(s.variaveis[0])}=</code> e clique em Testar conexão. Ou cole uma chave abaixo só para esta sessão.`; return; }
    box.innerHTML = `Nenhuma chave para ${escH(PROVS[k].nome)}. Preencha a linha <code>${escH(s.variaveis[0])}=sua-chave</code> no <code>.env</code> do app${env.arquivo ? ` (<code>${escH(env.arquivo)}</code>)` : ''} ou cole uma chave abaixo só para esta sessão.`;
  }
  async function carregarStatus() {
    try { statusIA = await api('GET', '/api/ia/status'); } catch (e) { statusIA = null; }
    renderChave();
  }
  function atualizarLogos() {
    const v = Date.now();
    ['logo-light', 'pv-light'].forEach(id => { const i = el(id); if (i) i.src = '/api/logo/light?v=' + v; });
    ['logo-dark', 'pv-dark'].forEach(id => { const i = el(id); if (i) i.src = '/api/logo/dark?v=' + v; });
  }
  function abrirConfig() {
    const c = cfg();
    el('c-err').textContent = '';
    opcoesProvedor();
    el('c-prov').value = c.provedor; provAnterior = c.provedor;
    el('c-modelo').value = c.modelo;
    aoTrocarProvedor(true);
    el('c-esforco').value = c.esforco || '';
    el('c-base').value = c.baseUrl || PADRAO.baseUrl;
    el('c-empresa').value = c.empresa || '';
    el('c-areas').value = c.areas.join('\n');
    el('c-donos').value = Object.entries(c.setoresDono).filter(([, l]) => Array.isArray(l) && l.length).map(([a, l]) => `${a}: ${l.join(', ')}`).join('\n');
    el('c-chave').value = '';
    el('c-logo-st').textContent = '';
    el('c-sol-st').textContent = '';
    infoSolucoes();
    atualizarLogos();
    statusIA = null; renderChave(); carregarStatus();
    el('dlg-cfg').showModal();
  }
  async function salvarConfig(ev) {
    ev.preventDefault();
    const modelo = el('c-modelo').value.trim();
    if (!modelo) { el('c-err').textContent = 'Informe o modelo.'; el('c-modelo').focus(); return; }
    const vistos = new Set();
    const areas = el('c-areas').value.split(/\r?\n/).map(s => s.trim().slice(0, 40)).filter(s => s && !vistos.has(s.toLowerCase()) && vistos.add(s.toLowerCase())).slice(0, 40);
    if (!areas.length) { el('c-err').textContent = 'Informe ao menos uma área.'; el('c-areas').focus(); return; }
    // Setores dono: uma linha por área, no formato "Área: Setor A, Setor B".
    const setoresDono = {};
    const linhas = el('c-donos').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (let n = 0; n < linhas.length; n++) {
      const m = /^([^:]+):(.*)$/.exec(linhas[n]);
      const area = m ? m[1].trim().slice(0, 40) : '';
      const lista = m ? m[2].split(/[,;]/).map(s => s.trim().slice(0, 40)).filter(Boolean) : [];
      if (!area || !lista.length) { el('c-err').textContent = `Setores dono, linha ${n + 1}: use "Área: Setor A, Setor B".`; el('c-donos').focus(); return; }
      const atual = setoresDono[area] || [];
      lista.forEach(s => { if (atual.length < 20 && !atual.some(x => x.toLowerCase() === s.toLowerCase())) atual.push(s); });
      setoresDono[area] = atual;
    }
    const novo = Object.assign({}, (estado && estado.config && estado.config.app) || {}, {
      provedor: el('c-prov').value, modelo, esforco: el('c-esforco').value, baseUrl: el('c-base').value.trim() || PADRAO.baseUrl,
      empresa: el('c-empresa').value.trim() || PADRAO.empresa, areas, setoresDono, atualizadoEm: new Date().toISOString()
    });
    el('c-salvar').disabled = true;
    try { await db.doc('config/app').set(novo); el('dlg-cfg').close(); if (typeof toast === 'function') toast('Configurações salvas'); }
    catch (e) { el('c-err').textContent = 'Não foi possível salvar: ' + (e.message || 'erro desconhecido'); }
    finally { el('c-salvar').disabled = false; }
  }
  async function usarChave() {
    const chave = el('c-chave').value.trim();
    if (!chave) { el('c-chave').focus(); return; }
    try { await api('POST', '/api/ia/chave', { provedor: el('c-prov').value, chave }); el('c-chave').value = ''; await carregarStatus(); }
    catch (e) { el('c-testar-st').textContent = e.message; }
  }
  async function esquecerChave() {
    try { await api('DELETE', '/api/ia/chave/' + encodeURIComponent(el('c-prov').value)); } catch (e) {}
    await carregarStatus();
  }
  async function testar() {
    const st = el('c-testar-st'), btn = el('c-testar');
    btn.disabled = true; st.textContent = 'Consultando o provedor…';
    try {
      const q = new URLSearchParams({ provedor: el('c-prov').value, baseUrl: el('c-base').value.trim() });
      const { modelos } = await api('GET', '/api/ia/modelos?' + q);
      el('dl-modelos').innerHTML = modelos.map(m => `<option value="${escH(m.id)}">${escH(m.nome !== m.id ? m.nome : '')}</option>`).join('');
      const atual = el('c-modelo').value.trim();
      const achou = modelos.some(m => m.id === atual);
      st.textContent = `Conexão ok: ${modelos.length} modelos disponíveis${atual ? (achou ? `, incluindo ${atual}.` : `. Atenção: "${atual}" não está na lista.`) : '.'} Clique no campo Modelo para ver a lista.`;
    } catch (e) {
      const msg = { no_key: 'Não há chave para esse provedor.', auth_failed: 'O provedor recusou a chave.', network: 'Não foi possível falar com o provedor.' }[e.code];
      st.textContent = (msg || 'Falhou') + (e.message && !msg ? ': ' + e.message : '');
    } finally { btn.disabled = false; carregarStatus(); }
  }
  async function enviarLogo(modo, input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    const st = el('c-logo-st');
    if (f.size > 2 * 1024 * 1024) { st.textContent = 'A imagem passa de 2 MB. Use uma menor.'; return; }
    st.textContent = 'Enviando…';
    try {
      const r = await fetch('/api/logo/' + modo, { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Solucoes-IA': '1' }, body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw erro(j.code, j.message);
      st.textContent = `Logo do modo ${modo === 'light' ? 'claro' : 'escuro'} trocada.`;
      atualizarLogos();
    } catch (e) { st.textContent = 'Não foi possível trocar a logo: ' + (e.message || 'erro desconhecido'); }
  }
  async function logoPadrao(modo) {
    try { await api('DELETE', '/api/logo/' + modo); el('c-logo-st').textContent = `Logo do modo ${modo === 'light' ? 'claro' : 'escuro'} voltou para a padrão.`; atualizarLogos(); }
    catch (e) { el('c-logo-st').textContent = e.message; }
  }

  /* ---------- Soluções de exemplo e começo do zero ---------- */
  let totalExemplos = null;
  const qtd = n => `${n} ${n === 1 ? 'solução' : 'soluções'}`;
  async function lerTotalExemplos() {
    if (totalExemplos == null) { try { totalExemplos = (await api('GET', '/api/exemplos')).total; } catch (e) { totalExemplos = 0; } }
    return totalExemplos;
  }
  async function acaoExemplos(acao) {
    const r = await api('POST', '/api/exemplos', { acao });
    if (carregando) await carregando.catch(() => {});
    await recarregar(true).catch(() => {});
    return r;
  }
  const nSolucoes = () => Object.keys((estado && estado.solucoes) || {}).length;

  // Banco sem soluções e sem escolha registrada: pergunta como começar.
  async function verInicio() {
    if (!estado || nSolucoes() || (estado.config && estado.config.inicio)) return;
    const dlg = el('dlg-inicio');
    if (!dlg || dlg.open || document.querySelector('dialog[open]')) return;
    const n = await lerTotalExemplos();
    el('ini-exemplos').hidden = !n;
    el('ini-exemplos-t').textContent = `Carregar os ${n} exemplos`;
    el('ini-st').textContent = '';
    dlg.showModal();
  }
  async function escolherInicio(acao) {
    const bts = [el('ini-exemplos'), el('ini-zero')];
    bts.forEach(b => { b.disabled = true; });
    el('ini-st').textContent = acao === 'carregar' ? 'Carregando os exemplos…' : '';
    try {
      const r = await acaoExemplos(acao);
      el('dlg-inicio').close();
      if (typeof toast === 'function') toast(acao === 'carregar' ? `${qtd(r.carregadas)} de exemplo carregadas` : 'Pronto: cadastre a primeira solução');
    } catch (e) { el('ini-st').textContent = 'Não foi possível concluir: ' + (e.message || 'erro desconhecido'); }
    finally { bts.forEach(b => { b.disabled = false; }); }
  }

  async function infoSolucoes() {
    const n = nSolucoes(), ex = await lerTotalExemplos();
    el('c-sol-info').textContent = `Há ${qtd(n)} no banco. O app traz ${qtd(ex)} de exemplo.`;
    el('c-ex-carregar').textContent = `Carregar os ${ex} exemplos`;
    el('c-ex-carregar').disabled = !ex;
    el('c-sol-apagar').disabled = !n;
  }
  async function carregarExemplosCfg() {
    const st = el('c-sol-st');
    st.textContent = 'Carregando os exemplos…';
    try {
      const r = await acaoExemplos('carregar');
      st.textContent = r.carregadas
        ? `${qtd(r.carregadas)} de exemplo carregadas${r.jaExistiam ? `; ${r.jaExistiam} já estavam no banco e não foram mexidas` : ''}.`
        : 'Todos os exemplos já estavam no banco. Nada mudou.';
    } catch (e) { st.textContent = 'Não foi possível carregar: ' + (e.message || 'erro desconhecido'); }
    infoSolucoes();
  }
  async function apagarSolucoes() {
    const n = nSolucoes(), st = el('c-sol-st');
    if (!n) return;
    if (!window.confirm(`Apagar as ${qtd(n)} do banco? O perfil da empresa e as configurações continuam. Uma cópia do banco fica em data/backups.`)) return;
    st.textContent = 'Apagando…';
    try { const r = await acaoExemplos('apagar'); st.textContent = `${qtd(r.apagadas)} apagadas. O app está pronto para você começar do zero.`; }
    catch (e) { st.textContent = 'Não foi possível apagar: ' + (e.message || 'erro desconhecido'); }
    infoSolucoes();
  }

  function ligarConfig() {
    el('ini-exemplos').addEventListener('click', () => escolherInicio('carregar'));
    el('ini-zero').addEventListener('click', () => escolherInicio('zero'));
    el('c-ex-carregar').addEventListener('click', carregarExemplosCfg);
    el('c-sol-apagar').addEventListener('click', apagarSolucoes);
    el('frm-cfg').addEventListener('submit', salvarConfig);
    el('c-cancel').addEventListener('click', () => el('dlg-cfg').close());
    el('c-prov').addEventListener('change', () => aoTrocarProvedor(false));
    el('c-chave-usar').addEventListener('click', usarChave);
    el('c-chave').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); usarChave(); } });
    el('c-chave-esquecer').addEventListener('click', esquecerChave);
    el('c-testar').addEventListener('click', testar);
    ['light', 'dark'].forEach(m => {
      el('up-' + m).addEventListener('change', e => enviarLogo(m, e.target));
      el('bt-up-' + m).addEventListener('click', () => el('up-' + m).click());
      el('bt-reset-' + m).addEventListener('click', () => logoPadrao(m));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligarConfig); else ligarConfig();

  window.LOCAL = {
    cfg, iaNome, abrirConfig,
    onCfg(fn) { ouvintesCfg.push(fn); if (estado) { try { fn(cfg()); } catch (e) { console.error(e); } } }
  };
})();
