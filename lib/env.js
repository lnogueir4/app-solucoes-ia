// Leitura do .env com as chaves de API, na pasta do app.
// Este módulo só lê. Nunca grava, copia ou registra valores.
import fs from 'node:fs';
import path from 'node:path';

// Devolve { arquivo, vars, erro }: erro é null, 'leitura' (existe mas não abriu) ou 'ausente'.
export function lerEnv(appDir) {
  const arquivo = path.join(appDir, '.env');
  if (!fs.existsSync(arquivo)) {
    // existsSync dá false também para um symlink quebrado: confere o próprio link.
    try { fs.lstatSync(arquivo); } catch { return { arquivo: null, vars: {}, erro: 'ausente' }; }
    return { arquivo, vars: {}, erro: 'leitura' };
  }
  try { return { arquivo, vars: parse(fs.readFileSync(arquivo, 'utf8')), erro: null }; }
  catch { return { arquivo, vars: {}, erro: 'leitura' }; }
}

function parse(txt) {
  const out = {};
  for (const bruta of txt.replace(/^﻿/, '').split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 1) continue;
    const k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}
