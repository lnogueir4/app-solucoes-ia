// Chamadas aos provedores de IA. A chave chega por parâmetro e nunca é registrada nem devolvida ao navegador.
// Anthropic: SDK oficial (@anthropic-ai/sdk). OpenAI, Gemini e compatíveis: API REST com fetch.
import Anthropic from '@anthropic-ai/sdk';

export const PROVEDORES = {
  anthropic: { nome: 'Anthropic (Claude)', chaves: ['ANTHROPIC_API_KEY', 'api-claude-key'], precisaChave: true },
  openai: { nome: 'OpenAI', chaves: ['OPENAI_API_KEY', 'api-openai-key'], precisaChave: true },
  gemini: { nome: 'Google Gemini', chaves: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'api-gemini-key'], precisaChave: true },
  compat: { nome: 'Compatível com OpenAI', chaves: ['OPENAI_COMPAT_API_KEY', 'api-compat-key'], precisaChave: false }
};

const MAX_TOKENS = 32000;
// Modelos Claude que aceitam o fallback do servidor quando o filtro de segurança recusa o pedido.
const COM_FALLBACK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export class ErroIA extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

function mensagens(input) {
  if (typeof input === 'string' && input.trim()) return [{ role: 'user', content: input }];
  if (Array.isArray(input)) {
    const msgs = input.filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({ role: m.role, content: m.content }));
    if (msgs.length && msgs[msgs.length - 1].role === 'user') return msgs;
  }
  throw new ErroIA('bad_request', 'Pedido à IA sem texto.');
}

/* ---------- Geração ---------- */
export async function gerar({ provedor, modelo, esforco, baseUrl, chave, input, signal, onDelta }) {
  const msgs = mensagens(input);
  modelo = String(modelo || '').trim().replace(/^models\//, '');
  if (!modelo) throw new ErroIA('model_not_found', 'Escolha um modelo em Configurações.');
  esforco = esforco ? String(esforco) : '';
  const p = { modelo, esforco, chave, msgs, signal, onDelta: onDelta || (() => {}) };
  switch (provedor) {
    case 'anthropic': return anthropic(p);
    case 'openai': return openaiLike({ ...p, url: 'https://api.openai.com/v1' });
    case 'compat': return openaiLike({ ...p, url: urlBase(baseUrl) });
    case 'gemini': return gemini(p);
    default: throw new ErroIA('bad_request', 'Provedor desconhecido.');
  }
}

async function anthropic({ modelo, esforco, chave, msgs, signal, onDelta }) {
  const client = new Anthropic({ apiKey: chave, maxRetries: 2 });
  const base = { model: modelo, max_tokens: MAX_TOKENS, messages: msgs };
  if (esforco) base.output_config = { effort: esforco };
  // Tenta do pedido mais completo ao mais simples, só quando o 400 é sobre um recurso que o modelo não aceita.
  const tentativas = [];
  if (COM_FALLBACK.has(modelo)) tentativas.push({ beta: true, body: { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } });
  tentativas.push({ beta: false, body: base });
  if (esforco) tentativas.push({ beta: false, body: { model: modelo, max_tokens: MAX_TOKENS, messages: msgs } });

  let ultimo = null;
  for (let i = 0; i < tentativas.length; i++) {
    const t = tentativas[i];
    let recebeu = false;
    try {
      const stream = t.beta ? client.beta.messages.stream(t.body, { signal }) : client.messages.stream(t.body, { signal });
      stream.on('text', d => { recebeu = true; onDelta(d); });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new ErroIA('refused', 'O modelo recusou o pedido.');
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (!text.trim()) throw new ErroIA('empty_completion', 'A IA não devolveu texto.');
      return { text, modelo: msg.model, truncated: msg.stop_reason === 'max_tokens' };
    } catch (e) {
      const ultimaTentativa = i === tentativas.length - 1;
      if (!ultimaTentativa && !recebeu && e instanceof Anthropic.BadRequestError && /fallback|beta|effort|output_config/i.test(msgAnthropic(e))) { ultimo = e; continue; }
      throw erroAnthropic(e, signal);
    }
  }
  throw erroAnthropic(ultimo, signal);
}

function msgAnthropic(e) { return (e && e.error && e.error.error && e.error.error.message) || (e && e.message) || ''; }

function erroAnthropic(e, signal) {
  if (e instanceof ErroIA) return e;
  if (e instanceof Anthropic.APIUserAbortError || (signal && signal.aborted)) return new ErroIA('cancelled');
  const m = msgAnthropic(e);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ErroIA('auth_failed', m);
  if (e instanceof Anthropic.NotFoundError) return new ErroIA('model_not_found', m);
  if (e instanceof Anthropic.RateLimitError) return new ErroIA('rate_limited', m);
  if (e instanceof Anthropic.BadRequestError) return /prompt is too long|too many tokens|context/i.test(m) ? new ErroIA('prompt_too_large', m) : new ErroIA('provider_error', m);
  if (e instanceof Anthropic.APIConnectionError) return new ErroIA('network', m);
  return new ErroIA('provider_error', m || 'Erro desconhecido no provedor.');
}

async function openaiLike({ url, modelo, esforco, chave, msgs, signal, onDelta }) {
  const body = { model: modelo, messages: msgs, stream: true };
  if (esforco) body.reasoning_effort = esforco;
  const enviar = () => postar(`${url}/chat/completions`, body, { ...(chave ? { Authorization: `Bearer ${chave}` } : {}) }, signal);
  let r = await enviar();
  if (r.status === 400 && body.reasoning_effort) {
    const t = await r.text();
    if (!/reasoning/i.test(t)) throw erroHttp(400, t);
    delete body.reasoning_effort;            // modelo sem raciocínio: repete sem o esforço
    r = await enviar();
  }
  if (!r.ok) throw erroHttp(r.status, await r.text());
  let text = '', truncated = false;
  await lerSSE(r.body, signal, data => {
    if (data === '[DONE]') return;
    const j = JSON.parse(data);
    if (j.error) throw new ErroIA('provider_error', j.error.message || 'Erro no provedor.');
    const c = j.choices && j.choices[0];
    if (!c) return;
    const d = c.delta && c.delta.content;
    if (d) { text += d; onDelta(d); }
    if (c.finish_reason === 'length') truncated = true;
    if (c.finish_reason === 'content_filter') throw new ErroIA('refused', 'O provedor bloqueou a resposta.');
  });
  if (!text.trim()) throw new ErroIA('empty_completion', 'A IA não devolveu texto.');
  return { text, modelo, truncated };
}

async function gemini({ modelo, esforco, chave, msgs, signal, onDelta }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:streamGenerateContent?alt=sse`;
  const body = { contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
  if (esforco) {
    body.generationConfig = {
      thinkingConfig: /gemini-2\.5/i.test(modelo)
        ? { thinkingBudget: { minimal: 512, low: 1024, medium: 8192, high: 24576, xhigh: 24576, max: 32768 }[esforco] || 8192 }
        : { thinkingLevel: esforco === 'low' || esforco === 'minimal' ? 'low' : esforco === 'medium' ? 'medium' : 'high' }
    };
  }
  const h = { 'x-goog-api-key': chave };
  let r = await postar(url, body, h, signal);
  if (r.status === 400 && body.generationConfig) {
    const t = await r.text();
    if (!/think/i.test(t)) throw erroHttp(400, t);
    delete body.generationConfig;
    r = await postar(url, body, h, signal);
  }
  if (!r.ok) throw erroHttp(r.status, await r.text());
  let text = '', truncated = false;
  await lerSSE(r.body, signal, data => {
    const j = JSON.parse(data);
    if (j.promptFeedback && j.promptFeedback.blockReason) throw new ErroIA('refused', 'O Gemini bloqueou o pedido.');
    const c = j.candidates && j.candidates[0];
    if (!c) return;
    const partes = (c.content && c.content.parts) || [];
    for (const p of partes) if (p.text && !p.thought) { text += p.text; onDelta(p.text); }
    if (c.finishReason === 'MAX_TOKENS') truncated = true;
    if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') throw new ErroIA('refused', 'O Gemini bloqueou a resposta.');
  });
  if (!text.trim()) throw new ErroIA('empty_completion', 'A IA não devolveu texto.');
  return { text, modelo, truncated };
}

/* ---------- Lista de modelos (não gera custo) ---------- */
export async function listarModelos({ provedor, chave, baseUrl, signal }) {
  if (provedor === 'anthropic') {
    const client = new Anthropic({ apiKey: chave, maxRetries: 1 });
    const out = [];
    try { for await (const m of client.models.list({ limit: 100 })) out.push({ id: m.id, nome: m.display_name || m.id }); }
    catch (e) { throw erroAnthropic(e, signal); }
    return out;
  }
  if (provedor === 'openai' || provedor === 'compat') {
    const url = provedor === 'openai' ? 'https://api.openai.com/v1' : urlBase(baseUrl);
    const j = await getJSON(`${url}/models`, chave ? { Authorization: `Bearer ${chave}` } : {}, signal);
    return (j.data || []).map(m => ({ id: m.id, nome: m.id })).sort((a, b) => a.id.localeCompare(b.id));
  }
  if (provedor === 'gemini') {
    const j = await getJSON('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': chave }, signal);
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => ({ id: String(m.name).replace(/^models\//, ''), nome: m.displayName || m.name }));
  }
  throw new ErroIA('bad_request', 'Provedor desconhecido.');
}

/* ---------- HTTP ---------- */
function urlBase(u) {
  let url;
  try { url = new URL(String(u || '').trim()); } catch { throw new ErroIA('bad_request', 'Endereço da API inválido. Exemplo: http://localhost:11434/v1'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ErroIA('bad_request', 'O endereço da API precisa começar com http:// ou https://');
  return url.href.replace(/\/+$/, '');
}

async function postar(url, body, headers, signal) {
  try { return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal }); }
  catch (e) { throw erroRede(e, signal); }
}

async function getJSON(url, headers, signal) {
  let r;
  try { r = await fetch(url, { headers, signal }); } catch (e) { throw erroRede(e, signal); }
  const t = await r.text();
  if (!r.ok) throw erroHttp(r.status, t);
  try { return JSON.parse(t); } catch { throw new ErroIA('provider_error', 'Resposta inesperada do provedor.'); }
}

function erroRede(e, signal) {
  if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return new ErroIA('cancelled');
  return new ErroIA('network', (e && e.cause && e.cause.code) || (e && e.message) || 'Falha de rede.');
}

function erroHttp(status, corpo) {
  let m = '';
  try { const j = JSON.parse(corpo); const e = Array.isArray(j) ? j[0] && j[0].error : j.error; m = (e && (e.message || e)) || j.message || ''; } catch { m = String(corpo || '').slice(0, 300); }
  m = typeof m === 'string' ? m : JSON.stringify(m);
  if (status === 401 || status === 403) return new ErroIA('auth_failed', m);
  if (status === 404) return new ErroIA('model_not_found', m);
  if (status === 429) return new ErroIA('rate_limited', m);
  if (status === 413) return new ErroIA('prompt_too_large', m);
  return new ErroIA('provider_error', m || `HTTP ${status}`);
}

async function lerSSE(corpo, signal, onData) {
  const dec = new TextDecoder();
  let buf = '';
  try {
    for await (const chunk of corpo) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linha = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (linha.startsWith('data:')) onData(linha.slice(5).trim());
      }
    }
    if (buf.startsWith('data:')) onData(buf.slice(5).trim());
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    if (e instanceof SyntaxError) throw new ErroIA('provider_error', 'Resposta inesperada do provedor.');
    throw erroRede(e, signal);
  }
}
