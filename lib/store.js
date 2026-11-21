// Banco local em um arquivo JSON (data/db.json), com gravação atômica e cópia diária em data/backups.
import fs from 'node:fs';
import path from 'node:path';

const COLECOES = new Set(['solucoes', 'config']);
const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const PROIBIDOS = new Set(['__proto__', 'constructor', 'prototype']);
const DIAS_BACKUP = 30;

export class ErroStore extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.arq = path.join(dir, 'db.json');
    this.dirBackup = path.join(dir, 'backups');
    fs.mkdirSync(this.dirBackup, { recursive: true });
    this.db = this.#ler();
    this.rev = Date.now();
  }

  #ler() {
    let txt;
    try { txt = fs.readFileSync(this.arq, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return { solucoes: {}, config: {} }; throw e; }
    // Arquivo corrompido: para tudo em vez de sobrescrever os dados.
    const j = JSON.parse(txt.replace(/^﻿/, ''));
    return { solucoes: limpar(j.solucoes), config: limpar(j.config) };
  }

  #validar(col, id) {
    if (!COLECOES.has(col)) throw new ErroStore(400, 'invalid_argument', 'Coleção desconhecida.');
    if (!ID.test(id) || PROIBIDOS.has(id)) throw new ErroStore(400, 'invalid_argument', 'Identificador inválido.');
  }

  tudo() { return { rev: this.rev, solucoes: this.db.solucoes, config: this.db.config }; }

  set(col, id, data) {
    this.#validar(col, id);
    this.db[col][id] = objeto(data);
    return this.#gravar();
  }

  update(col, id, data) {
    this.#validar(col, id);
    const atual = this.db[col][id];
    if (!atual) throw new ErroStore(404, 'not_found', 'Documento não encontrado.');
    const novo = { ...atual };
    for (const [k, v] of Object.entries(objeto(data))) {
      if (v && typeof v === 'object' && !Array.isArray(v) && v.__delete__ === true) delete novo[k];
      else novo[k] = v;
    }
    this.db[col][id] = novo;
    return this.#gravar();
  }

  delete(col, id) {
    this.#validar(col, id);
    delete this.db[col][id];
    return this.#gravar();
  }

  // Várias mudanças com uma gravação só. Cada item: { col, id, data } (data null apaga).
  lote(itens) {
    for (const { col, id, data } of itens) { this.#validar(col, id); if (data !== null) objeto(data); }
    for (const { col, id, data } of itens) { if (data === null) delete this.db[col][id]; else this.db[col][id] = data; }
    return this.#gravar();
  }

  existe(col, id) { return !!(this.db[col] && Object.hasOwn(this.db[col], id)); }
  ids(col) { return Object.keys(this.db[col] || {}); }

  // Cópia avulsa do banco como está agora (antes de uma ação em massa).
  copia(nome) { if (fs.existsSync(this.arq)) fs.copyFileSync(this.arq, path.join(this.dirBackup, nome)); }

  #gravar() {
    this.#backupDiario();
    const tmp = this.arq + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 1), 'utf8');
    fs.renameSync(tmp, this.arq);
    this.rev = Math.max(Date.now(), this.rev + 1);
    return this.rev;
  }

  // Antes da primeira gravação de cada dia, guarda uma cópia do banco como estava.
  #backupDiario() {
    if (!fs.existsSync(this.arq)) return;
    const dia = new Date().toLocaleDateString('sv');
    const alvo = path.join(this.dirBackup, `db-${dia}.json`);
    if (fs.existsSync(alvo)) return;
    fs.copyFileSync(this.arq, alvo);
    const antigos = fs.readdirSync(this.dirBackup).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    antigos.slice(0, Math.max(0, antigos.length - DIAS_BACKUP)).forEach(f => fs.rmSync(path.join(this.dirBackup, f), { force: true }));
  }
}

function objeto(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ErroStore(400, 'invalid_argument', 'O documento precisa ser um objeto.');
  return v;
}

function limpar(m) {
  const out = {};
  if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) if (ID.test(k) && !PROIBIDOS.has(k) && v && typeof v === 'object') out[k] = v;
  return out;
}
