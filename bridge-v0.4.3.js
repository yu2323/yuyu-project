import './bridge-v0.4.2.js';
import { getCtx, getState, save } from './memory-v0.4.0.js';

const VER = '0.4.3';
const MIGRATION_KEY = 'real_data_cleanup_v043';
const APP = '#lingyu-jade-app';

const DEMO_NOTICES = new Set([
  '北城门今晚临时增加盘查。',
  '鬼哭林外围有人看见陌生灵兽踪迹。',
  '珍宝阁今日赤霄果限购。',
  '北城门刚又加了一轮盘查。',
]);

const DEMO_STRANGER = '昨夜鬼哭林里，你是不是见过一个戴银面的人？';
const DEMO_THREAD_RULES = {
  '傅宁': new Set(['到哪了？', '到了给我回一声。']),
  '青霄宗执事': new Set(['明日辰时外院点名，迟到者记缺。']),
  '珍宝阁掌柜': new Set(['你上回问的青玉护身扣到了。']),
  '陌生传讯': new Set([DEMO_STRANGER]),
};

if (!window.__LINGYU_REAL_DATA_V043__) {
  window.__LINGYU_REAL_DATA_V043__ = true;
  boot();
}

function norm(v) {
  return String(v ?? '').trim();
}

function messageKey(m) {
  return `${norm(m?.from)}|${norm(m?.text)}|${norm(m?.time)}`;
}

function isUntouchedDemoThread(t) {
  const name = norm(t?.name);
  const allowed = DEMO_THREAD_RULES[name];
  if (!allowed) return false;
  const messages = Array.isArray(t?.messages) ? t.messages : [];
  if (!messages.length) return true;
  if (messages.some(m => m?.from === 'me')) return false;
  return messages.every(m => m?.from === 'them' && allowed.has(norm(m?.text)));
}

function dedupeMessages(messages) {
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    const key = messageKey(m);
    if (!norm(m?.text) || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function mergeThreads(threads) {
  const byName = new Map();
  for (const raw of Array.isArray(threads) ? threads : []) {
    if (!raw || isUntouchedDemoThread(raw)) continue;
    const name = norm(raw.name) || norm(raw.id) || '未命名往来';
    if (!byName.has(name)) {
      const t = { ...raw, name, messages: dedupeMessages(raw.messages), unread: Number(raw.unread || 0) };
      byName.set(name, t);
      continue;
    }
    const t = byName.get(name);
    t.messages = dedupeMessages([...(t.messages || []), ...(raw.messages || [])]);
    t.unread = Math.max(Number(t.unread || 0), Number(raw.unread || 0));
    t.preview = norm(raw.preview) || norm(t.preview);
  }
  return [...byName.values()];
}

function dedupeFeed(feed) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(feed) ? feed : []) {
    const id = norm(p?.id);
    if (['f1', 'f2', 'f3'].includes(id) || id.startsWith('world_')) continue;
    const key = `${norm(p?.author)}|${norm(p?.text)}|${norm(p?.image)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function dedupeFacts(facts) {
  const map = new Map();
  for (const f of Array.isArray(facts) ? facts : []) {
    const known = Array.isArray(f?.known_by) ? [...f.known_by].map(norm).sort().join(',') : '';
    const key = `${norm(f?.text)}|${norm(f?.visibility)}|${known}`;
    if (!norm(f?.text)) continue;
    map.set(key, f); // keep latest copy
  }
  return [...map.values()].slice(-24);
}

function cleanDemoProfile(s) {
  if (!s?.profile) return;
  if (norm(s.profile.location) === '云州 · 青霄宗外院') s.profile.location = '等待剧情同步';
  if (norm(s.profile.time) === '酉时二刻') s.profile.time = '—';
  if (norm(s.profile.identity) === '外院弟子') s.profile.identity = '—';
  if (Number(s.profile.stones) === 2430) s.profile.stones = null;
}

function cleanDemoCollections(s) {
  s.notices = [...new Set((Array.isArray(s.notices) ? s.notices : []).map(norm).filter(Boolean))]
    .filter(x => !DEMO_NOTICES.has(x))
    .slice(0, 8);
  s.threads = mergeThreads(s.threads);
  s.feed = dedupeFeed(s.feed);

  // These three lists were entirely static prototype content in v0.1-v0.4.2.
  const demoMarketNames = new Set(['赤霄果', '青玉护身扣', '归元丹']);
  s.market = (Array.isArray(s.market) ? s.market : []).filter(x => !demoMarketNames.has(norm(x?.name)));

  const demoPeople = new Set([
    '傅宁|申时连续传讯两次。',
    '裴照|刚发了一条留影。',
    '林惊鹤|在裴照的动态下留言。',
  ]);
  s.people = (Array.isArray(s.people) ? s.people : []).filter(x => !demoPeople.has(`${norm(x?.name)}|${norm(x?.recent)}`));

  if (s.bridge) s.bridge.facts = dedupeFacts(s.bridge.facts);
}

function sanitize({ migrateDemo = false } = {}) {
  const s = getState();
  if (!s) return false;
  const before = JSON.stringify({
    profile: s.profile,
    notices: s.notices,
    threads: s.threads,
    feed: s.feed,
    market: s.market,
    people: s.people,
    facts: s.bridge?.facts,
  });

  s.bridge ??= {};
  s.bridge.migrations ??= {};
  if (migrateDemo && !s.bridge.migrations[MIGRATION_KEY]) {
    cleanDemoProfile(s);
    cleanDemoCollections(s);
    s.bridge.migrations[MIGRATION_KEY] = Date.now();
  } else {
    // Even after migration, keep generic duplicate protection active.
    s.notices = [...new Set((Array.isArray(s.notices) ? s.notices : []).map(norm).filter(Boolean))].slice(0, 8);
    s.threads = mergeThreads(s.threads);
    s.feed = dedupeFeed(s.feed);
    if (s.bridge) s.bridge.facts = dedupeFacts(s.bridge.facts);
  }

  const after = JSON.stringify({
    profile: s.profile,
    notices: s.notices,
    threads: s.threads,
    feed: s.feed,
    market: s.market,
    people: s.people,
    facts: s.bridge?.facts,
  });
  if (before !== after) {
    save();
    return true;
  }
  return false;
}

function patchVisiblePanel() {
  const app = document.querySelector(APP);
  if (!(app instanceof HTMLElement)) return;

  // Prototype refresh used to inject canned world data. Retire it permanently.
  app.querySelector('[data-act="refresh"]')?.remove();

  const sync = app.querySelector('.lingyu-bridge-sync');
  if (sync instanceof HTMLElement) {
    sync.title = '同步当前剧情';
    sync.setAttribute('aria-label', '同步当前剧情');
  }

  const s = getState();
  if (s?.profile?.stones == null) {
    const stoneValue = app.querySelector('.lingyu-status-meta > div:nth-child(3) strong');
    if (stoneValue) stoneValue.textContent = '—';
  }

  const noticeList = app.querySelector('.lingyu-notice-list');
  if (noticeList && !noticeList.children.length) {
    noticeList.innerHTML = '<div class="lingyu-empty">暂无从剧情确认的外部异动。</div>';
  }

  const threadList = app.querySelector('.lingyu-thread-list');
  if (threadList && !threadList.children.length) {
    threadList.innerHTML = '<div class="lingyu-empty">暂无从剧情确认的往来。</div>';
  }

  const marketList = app.querySelector('.lingyu-market-list');
  if (marketList && !marketList.children.length) {
    marketList.innerHTML = '<div class="lingyu-empty">暂无从剧情确认的行情。</div>';
  }

  const personList = app.querySelector('.lingyu-person-list');
  if (personList && !personList.children.length) {
    personList.innerHTML = '<div class="lingyu-empty">暂无从剧情确认的人物信息。</div>';
  }
}

function rerenderIfOpen() {
  const active = document.querySelector(`${APP} [data-tab].active`);
  if (active instanceof HTMLElement) active.click();
  setTimeout(patchVisiblePanel, 0);
}

function migrateCurrentChat() {
  const changed = sanitize({ migrateDemo: true });
  if (changed) rerenderIfOpen();
}

function waitForBridgeIdle() {
  let ticks = 0;
  let sawBusy = false;
  const timer = setInterval(() => {
    const s = getState();
    const busy = Boolean(s?.bridge?.busy);
    sawBusy ||= busy;
    ticks++;
    if ((sawBusy && !busy) || (!sawBusy && ticks >= 5) || ticks >= 100) {
      clearInterval(timer);
      const changed = sanitize();
      if (changed) rerenderIfOpen();
      else patchVisiblePanel();
    }
  }, 200);
}

function bindSafetyNet() {
  // If an old refresh button flashes in during a render, never allow its canned-data handler to run.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest(`${APP} [data-act="refresh"]`) : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const sync = document.querySelector(`${APP} .lingyu-bridge-sync`);
    if (sync instanceof HTMLElement) sync.click();
  }, true);

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest(`${APP} .lingyu-bridge-sync`) : null;
    if (target) setTimeout(waitForBridgeIdle, 50);
  }, true);

  const observer = new MutationObserver(() => patchVisiblePanel());
  observer.observe(document.body, { childList: true, subtree: true });

  const c = getCtx();
  const es = c?.eventSource;
  const et = c?.eventTypes || c?.event_types || {};
  if (es && et.CHARACTER_MESSAGE_RENDERED) {
    es.on(et.CHARACTER_MESSAGE_RENDERED, () => setTimeout(waitForBridgeIdle, 120));
  }
  if (es && et.CHAT_CHANGED) {
    es.on(et.CHAT_CHANGED, () => setTimeout(() => {
      migrateCurrentChat();
      patchVisiblePanel();
    }, 350));
  }
}

function prime(attempt = 0) {
  if (getState()) {
    migrateCurrentChat();
    patchVisiblePanel();
    return;
  }
  if (attempt < 50) setTimeout(() => prime(attempt + 1), 200);
}

function boot() {
  const start = () => {
    bindSafetyNet();
    setTimeout(() => prime(), 250);
    console.log(`[lingyu_bridge] v${VER} real-data cleanup ready`);
  };
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', start, { once: true })
    : start();
}
