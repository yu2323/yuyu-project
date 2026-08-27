import { getContext } from '../../../extensions.js';

export const META = 'lingyu_jade_state_v1';
const GLOBAL_CARD_CACHE_KEY = 'lingyu_character_card_cache_v1';
const MAX_RECENT_MESSAGES = 8;
const MAX_CARD_SOURCE_CHARS = 14000;
const MAX_CARD_BUILDS_PER_SYNC = 2;
const MAX_MEMORY_CONTEXT_CHARS = 4600;

const CARD_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    name: { type: 'string' },
    identity: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    stable_traits: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    speech_style: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    relationships: { type: 'array', maxItems: 10, items: {
      type: 'object', additionalProperties: false,
      properties: { target: { type: 'string' }, relation: { type: 'string' } },
      required: ['target', 'relation'],
    } },
    hard_limits: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    keywords: { type: 'array', items: { type: 'string' }, maxItems: 12 },
  },
  required: ['name','identity','stable_traits','speech_style','relationships','hard_limits','keywords'],
};

export function getCtx() {
  try { return getContext(); }
  catch (e) { console.warn('[lingyu_memory] context', e); return null; }
}

export function getState() {
  const c = getCtx();
  const s = c?.chatMetadata?.[META];
  if (!s) return null;
  s.characterMemory ??= {};
  s.characterMemory.version = 1;
  s.characterMemory.manual ??= {};
  s.characterMemory.base ??= {};
  s.characterMemory.runtime ??= {};
  s.characterMemory.important = Array.isArray(s.characterMemory.important) ? s.characterMemory.important : [];
  s.characterMemory.lastInitAt = Number(s.characterMemory.lastInitAt || 0);
  return s;
}

export function save() {
  const c = getCtx();
  try {
    if (typeof c?.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
    else if (typeof c?.saveMetadata === 'function') void c.saveMetadata();
  } catch (e) { console.warn('[lingyu_memory] save', e); }
}

export function normalizeArray(v) { return Array.isArray(v) ? v : []; }
export function uniqueStrings(v, max = 12) {
  return [...new Set(normalizeArray(v).map(x => String(x || '').trim()).filter(Boolean))].slice(-max);
}
export function simpleHash(text) {
  let h = 2166136261; const value = String(text || '');
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function parseJsonLike(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').replace(/^\uFEFF/,'').replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```(?:json)?/gi,'').replace(/```/g,'').trim();
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}');
  const candidate = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
  return JSON.parse(candidate.replace(/[“”]/g,'"').replace(/,\s*([}\]])/g,'$1'));
}

function readCache() {
  try { const x = JSON.parse(localStorage.getItem(GLOBAL_CARD_CACHE_KEY) || '{}'); return x && typeof x === 'object' ? x : {}; }
  catch (_) { return {}; }
}
function writeCache(cache) {
  try {
    const entries = Object.entries(cache || {}).sort((a,b)=>Number(b[1]?.cachedAt||0)-Number(a[1]?.cachedAt||0)).slice(0,40);
    localStorage.setItem(GLOBAL_CARD_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (e) { console.warn('[lingyu_memory] cache', e); }
}

export function currentCharacterIds() {
  const c = getCtx(); const ids = [];
  const current = Number(c?.characterId);
  if (Number.isInteger(current) && current >= 0) ids.push(current);
  const recentNames = new Set(normalizeArray(c?.chat).slice(-MAX_RECENT_MESSAGES).filter(m=>!m?.is_user&&!m?.is_system).map(m=>String(m?.name||'').trim()).filter(Boolean));
  normalizeArray(c?.characters).forEach((ch,i)=>{
    const name = String(ch?.name || ch?.data?.name || '').trim();
    if (name && recentNames.has(name)) ids.push(i);
  });
  return [...new Set(ids)].slice(0,6);
}

export function getCardSnapshot(chid) {
  const c = getCtx(); if (!c || typeof c.getCharacterCardFields !== 'function') return null;
  const ch = c.characters?.[chid]; if (!ch) return null;
  let fields;
  try { fields = c.getCharacterCardFields({ chid }); }
  catch (e) { console.warn('[lingyu_memory] getCharacterCardFields', e); return null; }
  const name = String(ch?.name || ch?.data?.name || '').trim(); if (!name) return null;
  const source = {
    name,
    description: String(fields?.description || ''), personality: String(fields?.personality || ''),
    scenario: String(fields?.scenario || ''), system: String(fields?.system || ''),
    creatorNotes: String(fields?.creatorNotes || ''), mesExamples: String(fields?.mesExamples || ''),
    firstMessage: String(fields?.firstMessage || ''), charDepthPrompt: String(fields?.charDepthPrompt || ''),
    version: String(fields?.version || ''),
  };
  const raw = JSON.stringify(source);
  return { chid, name, source, cardHash: simpleHash(raw), sourceText: raw.slice(0, MAX_CARD_SOURCE_CHARS) };
}

function fallbackProfile(snapshot) {
  const s = snapshot?.source || {};
  return {
    name: snapshot?.name || '',
    identity: s.description ? [s.description.slice(0,220)] : [],
    stable_traits: s.personality ? [s.personality.slice(0,320)] : [],
    speech_style: [], relationships: [], hard_limits: [], keywords: [],
  };
}

async function summarizeCard(snapshot) {
  const c = getCtx(); if (typeof c?.generateRaw !== 'function') return null;
  const systemPrompt = '你是角色卡资料整理器。把角色卡压缩成长期人物基底，供后台生成私信、动态、评论时防止 OOC。只提取角色卡明确、稳定、长期的信息：身份、核心性格、说话风格、明确关系、行为边界、检索关键词。不要续写剧情，不要推断未写出的心理，不要把开场白或示例中的一次性状态固化成人设。输出必须符合 JSON Schema。';
  const prompt = `【角色卡原文】\n${snapshot.sourceText}\n\n只整理明确写出的长期信息。关系只记录角色卡明确支持的对象。`;
  const answer = await c.generateRaw({ prompt, systemPrompt, responseLength: 650, jsonSchema: CARD_SCHEMA });
  return parseJsonLike(answer);
}

export async function ensureCardBase(chid, { force = false, silent = true } = {}) {
  const s = getState(); if (!s) return null;
  const snap = getCardSnapshot(chid); if (!snap) return null;
  const mem = s.characterMemory;
  if (mem.manual?.[snap.name] && !force) return { name:snap.name, source:'manual', profile:mem.manual[snap.name], cardHash:snap.cardHash };
  const existing = mem.base?.[snap.name];
  if (!force && existing?.cardHash === snap.cardHash && existing?.profile && !existing?.needsSummary) return existing;

  const cache = readCache(); const cached = cache[snap.cardHash];
  if (!force && cached?.profile) {
    mem.base[snap.name] = { ...cached, source:'card_cache', cardHash:snap.cardHash, chid, name:snap.name };
    mem.lastInitAt = Date.now(); save(); return mem.base[snap.name];
  }

  let profile = null, source = 'card_fallback', needsSummary = true;
  try { profile = await summarizeCard(snap); source = 'card_ai'; needsSummary = false; }
  catch (e) { console.warn('[lingyu_memory] card summary failed', e); }
  profile ??= fallbackProfile(snap);
  const record = { name:snap.name, chid, source, cardHash:snap.cardHash, profile, needsSummary, updatedAt:Date.now() };
  mem.base[snap.name] = record; mem.lastInitAt = Date.now(); save();
  if (!needsSummary) { cache[snap.cardHash] = { ...record, cachedAt:Date.now() }; writeCache(cache); }
  if (!silent) globalThis.toastr?.[needsSummary ? 'info' : 'success']?.(needsSummary ? `${snap.name} 已建立本地人物基底。` : `${snap.name} 的人物基底已从角色卡建立。`);
  return record;
}

export async function ensureRelevantCharacterBases({ forceCurrent = false, silent = true } = {}) {
  const ids = currentCharacterIds(); let built = 0;
  for (const chid of ids) {
    if (built >= MAX_CARD_BUILDS_PER_SYNC) break;
    const snap = getCardSnapshot(chid); if (!snap) continue;
    const s = getState(); const manual = s?.characterMemory?.manual?.[snap.name]; const old = s?.characterMemory?.base?.[snap.name];
    const need = forceCurrent || (!manual && (!old || old.cardHash !== snap.cardHash || old.needsSummary));
    if (!need) continue;
    await ensureCardBase(chid, { force:forceCurrent, silent }); built++;
  }
}

export function effectiveCharacterProfile(name) {
  const s = getState(); if (!s || !name) return null;
  const manual = s.characterMemory.manual?.[name]; if (manual) return { source:'manual', profile:manual };
  const base = s.characterMemory.base?.[name]; return base?.profile ? { source:base.source || 'card', profile:base.profile } : null;
}

function relevantNames() {
  const c = getCtx(); const s = getState(); const names = normalizeArray(c?.chat).slice(-MAX_RECENT_MESSAGES).filter(m=>!m?.is_system).map(m=>m?.is_user?'USER':String(m?.name||c?.name2||'').trim()).filter(Boolean);
  for (const n of normalizeArray(s?.characterMemory?.important)) names.push(String(n||'').trim());
  return [...new Set(names)].filter(Boolean).slice(0,8);
}

export function buildCharacterMemoryContext() {
  const s = getState(); if (!s) return '';
  const blocks = [];
  for (const name of relevantNames()) {
    if (name === 'USER') continue;
    const base = effectiveCharacterProfile(name); const runtime = s.characterMemory.runtime?.[name];
    if (!base && !runtime) continue;
    const lines = [`【${name}】`];
    if (base) lines.push(`长期基底(${base.source})：${JSON.stringify(base.profile)}`);
    if (runtime) lines.push(`当前状态：${JSON.stringify({ current_state:runtime.current_state||'', current_goal:runtime.current_goal||'', location:runtime.location||'', known_facts:uniqueStrings(runtime.known_facts,6), relationship_deltas:uniqueStrings(runtime.relationship_deltas,4), recent_events:uniqueStrings(runtime.recent_events,5) })}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n').slice(0, MAX_MEMORY_CONTEXT_CHARS);
}

export function applyCharacterUpdates(updates, signature) {
  const s = getState(); if (!s) return [];
  const out = [];
  for (const x of normalizeArray(updates).slice(0,6)) {
    const name = String(x?.name || '').trim(); if (!name || name === 'USER') continue;
    const old = s.characterMemory.runtime[name] || {};
    const next = {
      ...old,
      current_state: String(x?.current_state || old.current_state || '').trim(),
      current_goal: String(x?.current_goal || old.current_goal || '').trim(),
      location: String(x?.location || old.location || '').trim(),
      known_facts: uniqueStrings([...(old.known_facts||[]), ...normalizeArray(x?.known_facts)], 12),
      relationship_deltas: uniqueStrings([...(old.relationship_deltas||[]), ...normalizeArray(x?.relationship_deltas)], 8),
      recent_events: uniqueStrings([...(old.recent_events||[]), ...normalizeArray(x?.recent_events)], 10),
      lastEvidenceSignature: signature, lastUpdatedAt: Date.now(), source:'story_confirmed',
    };
    s.characterMemory.runtime[name] = next; out.push({ name, ...next });
  }
  return out;
}

export async function rebuildCurrentCharacter() {
  const ids = currentCharacterIds(); if (!ids.length) return null;
  return await ensureCardBase(ids[0], { force:true, silent:false });
}

export function currentMemoryStatus() {
  const ids = currentCharacterIds(); const snap = ids.length ? getCardSnapshot(ids[0]) : null; const s = getState();
  if (!snap || !s) return '人物记忆：暂无角色卡';
  if (s.characterMemory.manual?.[snap.name]) return `人物记忆：${snap.name} · 手动设定优先`;
  const base = s.characterMemory.base?.[snap.name];
  if (!base) return `人物记忆：${snap.name} · 尚未建档`;
  if (base.needsSummary) return `人物记忆：${snap.name} · 本地基底`;
  return `人物记忆：${snap.name} · 已建档`;
}

export function exposeMemoryApi() {
  window.LingyuCharacterMemory = {
    get(name) { const s=getState(); return s ? { base:effectiveCharacterProfile(name), runtime:s.characterMemory.runtime?.[name]||null } : null; },
    setManual(name, profile) { const s=getState(), key=String(name||'').trim(); if(!s||!key)return false; s.characterMemory.manual[key]=profile; if(!s.characterMemory.important.includes(key))s.characterMemory.important.push(key); save(); return true; },
    clearManual(name) { const s=getState(), key=String(name||'').trim(); if(!s||!key)return false; delete s.characterMemory.manual[key]; save(); return true; },
    rebuild: rebuildCurrentCharacter,
  };
}
