const MODULE_ID = 'lingyu_jade_mvp';
const META_KEY = 'lingyu_jade_state_v1';
const POS_KEY = 'lingyu_jade_fab_pos_v1';

let currentTab = 'home';
let activeThreadId = null;
let isOpen = false;
let fallbackState = null;
let chatEventBound = false;

function getContextSafe() {
    try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern && typeof SillyTavern.getContext === 'function') {
            return SillyTavern.getContext();
        }
    } catch (err) {
        console.warn('[Lingyu] context unavailable', err);
    }
    return null;
}

function defaultState() {
    return {
        profile: { name: '虞昭', location: '云州 · 青霄宗外院', time: '酉时二刻', stones: 2430, identity: '外院弟子' },
        notices: [
            '北城门今晚临时增加盘查。',
            '鬼哭林外围有人看见陌生灵兽踪迹。',
            '珍宝阁今日赤霄果限购。'
        ],
        threads: [
            { id: 'funing', name: '傅宁', preview: '到了给我回一声。', unread: 2, messages: [
                { from: 'them', text: '到哪了？', time: '申时三刻' },
                { from: 'them', text: '到了给我回一声。', time: '申时四刻' }
            ] },
            { id: 'sect', name: '青霄宗执事', preview: '明日辰时外院点名。', unread: 0, messages: [
                { from: 'them', text: '明日辰时外院点名，迟到者记缺。', time: '未时' }
            ] },
            { id: 'shop', name: '珍宝阁掌柜', preview: '你上回问的青玉护身扣到了。', unread: 0, messages: [
                { from: 'them', text: '你上回问的青玉护身扣到了。', time: '午时' }
            ] }
        ],
        feed: [
            { id: 'feed1', author: '裴照', role: '好友', time: '一刻前', text: '今日剑坪有人把第三块试剑石劈了。', image: '断成两截的黑色试剑石，碎屑落了一地。', likes: ['林惊鹤', '谢临渊'], comments: [
                { author: '林惊鹤', text: '谁？' }, { author: '裴照', text: '你师弟。' }, { author: '林惊鹤', text: '……赔钱了吗。' }
            ] },
            { id: 'feed2', author: '珍宝阁·云州分号', role: '商家', time: '半个时辰前', text: '赤霄果今日到货不多，每人限购三枚。', image: '木匣中三枚赤红灵果被细绢垫着。', likes: ['祁越', '温庭'], comments: [
                { author: '林照', text: '价格呢？' }, { author: '珍宝阁·云州分号', text: '比昨日高一成。' }
            ] }
        ],
        market: [
            { name: '赤霄果', price: '38 中品灵石', status: '涨', stock: '限购三枚' },
            { name: '青玉护身扣', price: '120 中品灵石', status: '平', stock: '余 2 件' },
            { name: '归元丹', price: '16 中品灵石', status: '跌', stock: '充足' }
        ],
        people: [
            { name: '傅宁', relation: '熟识', location: '不明', recent: '申时连续传讯两次。' },
            { name: '裴照', relation: '好友', location: '青霄宗剑坪', recent: '刚发了一条留影。' },
            { name: '林惊鹤', relation: '认识', location: '内院', recent: '在裴照的动态下留言。' }
        ]
    };
}

function loadState() {
    const ctx = getContextSafe();
    if (ctx) {
        if (!ctx.chatMetadata) ctx.chatMetadata = {};
        if (!ctx.chatMetadata[META_KEY]) ctx.chatMetadata[META_KEY] = defaultState();
        return ctx.chatMetadata[META_KEY];
    }
    if (!fallbackState) fallbackState = defaultState();
    return fallbackState;
}

function saveState() {
    const ctx = getContextSafe();
    if (!ctx) return;
    try {
        if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
        else if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
    } catch (err) {
        console.warn('[Lingyu] save failed', err);
    }
}

function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function unreadCount(state) {
    return state.threads.reduce((sum, item) => sum + Number(item.unread || 0), 0);
}

function tabButton(tab, label, icon) {
    return '<button class="lingyu-tab ' + (currentTab === tab ? 'active' : '') + '" data-tab="' + tab + '"><span>' + icon + '</span><small>' + label + '</small></button>';
}

function panelShell(body) {
    return '<div class="lingyu-shell">' +
        '<div class="lingyu-topbar"><div class="lingyu-title-wrap"><div class="lingyu-seal">灵</div><div><div class="lingyu-title">灵枢玉简</div><div class="lingyu-subtitle">同一方天地，另一扇窗</div></div></div>' +
        '<div class="lingyu-top-actions"><button class="lingyu-icon-btn" data-action="refresh-world">↻</button><button class="lingyu-icon-btn" data-action="close">×</button></div></div>' +
        '<div class="lingyu-body">' + body + '</div>' +
        '<div class="lingyu-tabs">' + tabButton('home','首页','⌂') + tabButton('messages','灵讯','✉') + tabButton('feed','留影','◉') + tabButton('market','坊市','◇') + tabButton('people','人物簿','人') + '</div>' +
        '</div>';
}

function renderHome(state) {
    const p = state.profile;
    return '<section class="lingyu-hero"><div class="lingyu-hero-line"><span>' + esc(p.identity) + '</span><span>' + esc(p.time) + '</span></div><h2>' + esc(p.location) + '</h2><div class="lingyu-stone"><span>灵石</span><strong>' + Number(p.stones || 0).toLocaleString() + '</strong></div></section>' +
        '<section class="lingyu-section"><div class="lingyu-section-title"><span>附近异动</span><small>世界没有停下来</small></div><div class="lingyu-notice-list">' +
        state.notices.map(function(n, i){ return '<div class="lingyu-notice"><span>' + String(i + 1).padStart(2,'0') + '</span><p>' + esc(n) + '</p></div>'; }).join('') + '</div></section>' +
        '<section class="lingyu-section"><div class="lingyu-section-title"><span>未读灵讯</span><small>' + unreadCount(state) + ' 条</small></div>' +
        (state.threads.filter(function(x){ return x.unread; }).slice(0,3).map(function(x){ return threadCard(x, true); }).join('') || '<div class="lingyu-empty">眼下无人催你。</div>') + '</section>';
}

function threadCard(t, compact) {
    return '<button class="lingyu-thread ' + (compact ? 'compact' : '') + '" data-thread="' + esc(t.id) + '"><div class="lingyu-avatar">' + esc(t.name.slice(0,1)) + '</div><div class="lingyu-thread-main"><div class="lingyu-thread-row"><strong>' + esc(t.name) + '</strong>' + (t.unread ? '<span class="lingyu-count">' + Number(t.unread) + '</span>' : '') + '</div><p>' + esc(t.preview || '') + '</p></div></button>';
}

function renderMessages(state) {
    if (activeThreadId) {
        const t = state.threads.find(function(x){ return x.id === activeThreadId; });
        if (t) {
            t.unread = 0; saveState();
            return '<div class="lingyu-chat-head"><button class="lingyu-back" data-action="back-threads">‹</button><div><strong>' + esc(t.name) + '</strong><small>灵讯往来</small></div></div>' +
                '<div class="lingyu-chat-log">' + t.messages.map(function(m){ return '<div class="lingyu-bubble-row ' + (m.from === 'me' ? 'mine' : '') + '"><div class="lingyu-bubble">' + esc(m.text) + '</div><small>' + esc(m.time || '') + '</small></div>'; }).join('') + '</div>' +
                '<form id="lingyu-message-form" class="lingyu-compose"><input id="lingyu-message-input" autocomplete="off" placeholder="写一道灵讯……"><button type="submit">发送</button></form>';
        }
        activeThreadId = null;
    }
    return '<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>灵讯</span><small>' + state.threads.length + ' 个往来</small></div><div class="lingyu-thread-list">' + state.threads.map(function(x){ return threadCard(x, false); }).join('') + '</div></section>';
}

function feedCard(post) {
    const liked = (post.likes || []).indexOf('我') >= 0;
    return '<article class="lingyu-post"><div class="lingyu-post-head"><div class="lingyu-avatar">' + esc(post.author.slice(0,1)) + '</div><div><strong>' + esc(post.author) + '</strong><small>' + esc(post.role || '') + ' · ' + esc(post.time || '') + '</small></div></div>' +
        (post.text ? '<p class="lingyu-post-text">' + esc(post.text) + '</p>' : '') +
        (post.image ? '<div class="lingyu-image-placeholder"><span>留影</span><p>' + esc(post.image) + '</p></div>' : '') +
        '<div class="lingyu-post-actions"><button data-like="' + esc(post.id) + '" class="' + (liked ? 'liked' : '') + '">' + (liked ? '已赞' : '点赞') + '</button><span>' + (post.likes || []).length + ' 人赞</span></div>' +
        (((post.likes || []).length || (post.comments || []).length) ? '<div class="lingyu-social-box">' + ((post.likes || []).length ? '<div class="lingyu-likes">♡ ' + post.likes.map(esc).join('、') + '</div>' : '') + (post.comments || []).map(function(c){ return '<div class="lingyu-comment"><strong>' + esc(c.author) + '：</strong>' + esc(c.text) + '</div>'; }).join('') + '</div>' : '') + '</article>';
}

function renderFeed(state) {
    return '<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>留影</span><small>好友 · 宗门 · 天下</small></div><form id="lingyu-feed-form" class="lingyu-feed-compose"><textarea id="lingyu-feed-input" rows="2" placeholder="留下一句话……"></textarea><button type="submit">发布</button></form><div class="lingyu-feed-list">' + state.feed.map(feedCard).join('') + '</div></section>';
}

function renderMarket(state) {
    return '<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>坊市</span><small>云州今日行情</small></div><div class="lingyu-market-list">' + state.market.map(function(item){ return '<div class="lingyu-market-item"><div><strong>' + esc(item.name) + '</strong><small>' + esc(item.stock) + '</small></div><div class="lingyu-price"><strong>' + esc(item.price) + '</strong><span class="' + (item.status === '涨' ? 'up' : item.status === '跌' ? 'down' : '') + '">' + esc(item.status) + '</span></div></div>'; }).join('') + '</div></section>';
}

function renderPeople(state) {
    return '<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>人物簿</span><small>你目前知道的事</small></div><div class="lingyu-person-list">' + state.people.map(function(p){ return '<div class="lingyu-person"><div class="lingyu-avatar large">' + esc(p.name.slice(0,1)) + '</div><div class="lingyu-person-main"><div><strong>' + esc(p.name) + '</strong><span>' + esc(p.relation) + '</span></div><small>' + esc(p.location) + '</small><p>' + esc(p.recent) + '</p></div></div>'; }).join('') + '</div></section>';
}

function renderPanel(state) {
    const panel = document.getElementById('lingyu-jade-panel');
    if (!panel) return;
    let body = '';
    if (currentTab === 'home') body = renderHome(state);
    else if (currentTab === 'messages') body = renderMessages(state);
    else if (currentTab === 'feed') body = renderFeed(state);
    else if (currentTab === 'market') body = renderMarket(state);
    else body = renderPeople(state);
    panel.innerHTML = panelShell(body);
    panel.classList.toggle('open', isOpen);
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    bindPanelEvents();
}

function render() {
    try {
        const state = loadState();
        const badge = document.getElementById('lingyu-jade-badge');
        if (badge) {
            const n = unreadCount(state); badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = n <= 0;
        }
        renderPanel(state);
    } catch (err) {
        console.error('[Lingyu] render failed', err);
        const panel = document.getElementById('lingyu-jade-panel');
        if (panel) {
            panel.innerHTML = '<div class="lingyu-shell"><div class="lingyu-body"><h3>玉简加载失败</h3><p class="lingyu-post-text">请截图这一页给我。错误：' + esc(err && err.message ? err.message : err) + '</p></div></div>';
            panel.classList.add('open'); panel.style.pointerEvents = 'auto'; panel.style.opacity = '1';
        }
    }
}

function togglePanel() { isOpen = !isOpen; render(); }
function closePanel() { isOpen = false; render(); }

function refreshWorld() {
    const s = loadState();
    const now = Date.now();
    s.feed.unshift({ id: 'world_' + now, author: '云州闲谈', role: '天下', time: '刚刚', text: '北城门刚又加了一轮盘查，坊间开始有人打听昨夜进城的人。', image: '城门灯火亮着，守卫比平时多了一倍。', likes: [], comments: [] });
    s.threads.unshift({ id: 'stranger_' + now, name: '陌生传讯', preview: '昨夜鬼哭林里，你是不是见过一个戴银面的人？', unread: 1, messages: [{ from: 'them', text: '昨夜鬼哭林里，你是不是见过一个戴银面的人？', time: '刚刚' }] });
    s.notices.unshift('北城门刚又加了一轮盘查。'); s.notices = s.notices.slice(0,5); saveState(); render();
}

function bindPanelEvents() {
    const panel = document.getElementById('lingyu-jade-panel');
    if (!panel) return;
    panel.querySelectorAll('[data-tab]').forEach(function(btn){ btn.addEventListener('click', function(){ currentTab = btn.getAttribute('data-tab'); activeThreadId = null; render(); }); });
    const close = panel.querySelector('[data-action="close"]'); if (close) close.addEventListener('click', closePanel);
    const refresh = panel.querySelector('[data-action="refresh-world"]'); if (refresh) refresh.addEventListener('click', refreshWorld);
    const back = panel.querySelector('[data-action="back-threads"]'); if (back) back.addEventListener('click', function(){ activeThreadId = null; render(); });
    panel.querySelectorAll('[data-thread]').forEach(function(btn){ btn.addEventListener('click', function(){ activeThreadId = btn.getAttribute('data-thread'); currentTab = 'messages'; render(); }); });
    panel.querySelectorAll('[data-like]').forEach(function(btn){ btn.addEventListener('click', function(){ const s = loadState(); const p = s.feed.find(function(x){ return x.id === btn.getAttribute('data-like'); }); if (!p) return; if (!p.likes) p.likes = []; const i = p.likes.indexOf('我'); if (i >= 0) p.likes.splice(i,1); else p.likes.push('我'); saveState(); render(); }); });
    const msgForm = panel.querySelector('#lingyu-message-form');
    if (msgForm) msgForm.addEventListener('submit', function(e){ e.preventDefault(); const input = panel.querySelector('#lingyu-message-input'); const text = input && input.value.trim(); if (!text || !activeThreadId) return; const s = loadState(); const t = s.threads.find(function(x){ return x.id === activeThreadId; }); if (!t) return; t.messages.push({ from:'me', text:text, time:'现在' }); t.preview = text; saveState(); render(); });
    const feedForm = panel.querySelector('#lingyu-feed-form');
    if (feedForm) feedForm.addEventListener('submit', function(e){ e.preventDefault(); const input = panel.querySelector('#lingyu-feed-input'); const text = input && input.value.trim(); if (!text) return; const s = loadState(); s.feed.unshift({ id:'mine_' + Date.now(), author:s.profile.name || '我', role:'我的留影', time:'刚刚', text:text, image:'', likes:[], comments:[] }); saveState(); render(); });
}

function applySavedPosition(fab) {
    try {
        const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
        if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return;
        fab.style.left = Math.max(4, Math.min(window.innerWidth - fab.offsetWidth - 4, saved.x)) + 'px';
        fab.style.top = Math.max(4, Math.min(window.innerHeight - fab.offsetHeight - 4, saved.y)) + 'px';
        fab.style.right = 'auto'; fab.style.bottom = 'auto';
    } catch (_) {}
}

function bindDragAndTap(fab) {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    fab.addEventListener('pointerdown', function(e){ dragging = true; moved = false; sx = e.clientX; sy = e.clientY; const r = fab.getBoundingClientRect(); ox = r.left; oy = r.top; try { fab.setPointerCapture(e.pointerId); } catch (_) {} });
    fab.addEventListener('pointermove', function(e){ if (!dragging) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 8) moved = true; if (!moved) return; const x = Math.max(4, Math.min(window.innerWidth - fab.offsetWidth - 4, ox + dx)); const y = Math.max(4, Math.min(window.innerHeight - fab.offsetHeight - 4, oy + dy)); fab.style.left = x + 'px'; fab.style.top = y + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto'; e.preventDefault(); });
    fab.addEventListener('pointerup', function(e){ if (!dragging) return; dragging = false; if (moved) { const r = fab.getBoundingClientRect(); try { localStorage.setItem(POS_KEY, JSON.stringify({x:r.left,y:r.top})); } catch (_) {} } else { togglePanel(); } e.preventDefault(); });
    fab.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); } });
}

function mount() {
    if (document.getElementById('lingyu-jade-root')) return;
    const root = document.createElement('div');
    root.id = 'lingyu-jade-root';
    root.innerHTML = '<button id="lingyu-jade-fab" type="button" aria-label="打开灵枢玉简"><span class="lingyu-fab-rune">简</span><span id="lingyu-jade-badge" class="lingyu-badge" hidden></span></button><div id="lingyu-jade-panel" aria-hidden="true"></div>';
    document.body.appendChild(root);
    const fab = document.getElementById('lingyu-jade-fab');
    if (fab) { applySavedPosition(fab); bindDragAndTap(fab); }
    render();
    bindChatEvents();
    console.log('[Lingyu] v0.1.2 mounted');
}

function bindChatEvents() {
    if (chatEventBound) return;
    const ctx = getContextSafe();
    if (!ctx || !ctx.eventSource || !ctx.event_types || !ctx.event_types.CHAT_CHANGED) return;
    ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, function(){ activeThreadId = null; currentTab = 'home'; isOpen = false; render(); });
    chatEventBound = true;
}

function boot() {
    try { mount(); }
    catch (err) { console.error('[Lingyu] boot failed', err); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else setTimeout(boot, 0);
