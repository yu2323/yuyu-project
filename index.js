import { getContext } from '../../../extensions.js';
import { Popup, POPUP_TYPE } from '../../../../scripts/popup.js';

const ID = 'lingyu_jade';
const META = 'lingyu_jade_state_v1';
const VER = '0.2.1';

let tab = 'home';
let threadId = null;
let popup = null;
let root = null;
let bound = false;
let retry = null;
let fallback = null;
let refreshNo = 0;

function defaults() {
    return {
        profile: { name: '虞昭', location: '云州 · 青霄宗外院', time: '酉时二刻', stones: 2430, identity: '外院弟子' },
        notices: ['北城门今晚临时增加盘查。', '鬼哭林外围有人看见陌生灵兽踪迹。', '珍宝阁今日赤霄果限购。'],
        threads: [
            { id: 'funing', name: '傅宁', preview: '到了给我回一声。', unread: 2, messages: [{ from: 'them', text: '到哪了？', time: '申时三刻' }, { from: 'them', text: '到了给我回一声。', time: '申时四刻' }] },
            { id: 'sect', name: '青霄宗执事', preview: '明日辰时外院点名。', unread: 0, messages: [{ from: 'them', text: '明日辰时外院点名，迟到者记缺。', time: '未时' }] },
            { id: 'shop', name: '珍宝阁掌柜', preview: '你上回问的青玉护身扣到了。', unread: 0, messages: [{ from: 'them', text: '你上回问的青玉护身扣到了。', time: '午时' }] },
        ],
        feed: [
            { id: 'f1', author: '裴照', role: '好友', time: '一刻前', text: '今日剑坪有人把第三块试剑石劈了。', image: '断成两截的黑色试剑石，碎屑落了一地。', likes: ['林惊鹤', '谢临渊'], comments: [{ author: '林惊鹤', text: '谁？' }, { author: '裴照', text: '你师弟。' }, { author: '林惊鹤', text: '……赔钱了吗。' }] },
            { id: 'f2', author: '珍宝阁·云州分号', role: '商家', time: '半个时辰前', text: '赤霄果今日到货不多，每人限购三枚。', image: '木匣中三枚赤红灵果被细绢垫着。', likes: ['祁越', '温庭'], comments: [{ author: '林照', text: '价格呢？' }, { author: '珍宝阁·云州分号', text: '比昨日高一成。' }] },
            { id: 'f3', author: '傅宁', role: '好友', time: '一个时辰前', text: '', image: '窗边放着一盏清茶，旁边压着半卷书。', likes: ['沈砚'], comments: [{ author: '沈砚', text: '难得。' }] },
        ],
        market: [
            { name: '赤霄果', price: '38 中品灵石', status: '涨', stock: '限购三枚' },
            { name: '青玉护身扣', price: '120 中品灵石', status: '平', stock: '余 2 件' },
            { name: '归元丹', price: '16 中品灵石', status: '跌', stock: '充足' },
        ],
        people: [
            { name: '傅宁', relation: '熟识', location: '不明', recent: '申时连续传讯两次。' },
            { name: '裴照', relation: '好友', location: '青霄宗剑坪', recent: '刚发了一条留影。' },
            { name: '林惊鹤', relation: '认识', location: '内院', recent: '在裴照的动态下留言。' },
        ],
    };
}

function ctx() {
    try { return getContext(); }
    catch (e) { console.warn(`[${ID}] context`, e); return null; }
}

function state() {
    const c = ctx();
    if (!c) {
        fallback ??= defaults();
        return fallback;
    }
    c.chatMetadata ??= {};
    if (!c.chatMetadata[META]) {
        c.chatMetadata[META] = defaults();
        save();
    }
    return c.chatMetadata[META];
}

function save() {
    const c = ctx();
    try {
        if (typeof c?.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
        else if (typeof c?.saveMetadata === 'function') void c.saveMetadata();
    } catch (e) {
        console.warn(`[${ID}] save`, e);
    }
}

function esc(v = '') {
    return String(v)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function unread(s = state()) {
    return s.threads.reduce((n, x) => n + Number(x.unread || 0), 0);
}

function syncTop() {
    document.querySelector('#lingyu-top-entry .drawer-icon')?.classList.toggle('lingyu-active', !!popup);
    const b = document.getElementById('lingyu-top-badge');
    if (b) {
        const n = unread();
        b.textContent = n > 99 ? '99+' : String(n);
        b.hidden = n <= 0;
    }
}

function tbtn(k, n, icon) {
    return `<button type="button" class="lingyu-tab ${tab === k ? 'active' : ''}" data-tab="${k}"><i class="fa-solid ${icon}" aria-hidden="true"></i><small>${n}</small></button>`;
}

function shell(body) {
    return `<div class="lingyu-app-shell">
        <header class="lingyu-app-head">
            <div class="lingyu-brand">
                <strong>灵枢玉简</strong>
                <small>同一方天地，另一扇窗</small>
            </div>
            <div class="lingyu-head-actions">
                <button type="button" data-act="refresh" title="刷新玉简" aria-label="刷新玉简"><i class="fa-solid fa-rotate-right"></i></button>
                <button type="button" data-act="close" title="关闭" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </header>
        <main class="lingyu-app-body">${body}</main>
        <nav class="lingyu-tabs">
            ${tbtn('home', '首页', 'fa-house')}
            ${tbtn('messages', '灵讯', 'fa-envelope')}
            ${tbtn('feed', '留影', 'fa-images')}
            ${tbtn('market', '坊市', 'fa-store')}
            ${tbtn('people', '人簿', 'fa-address-book')}
        </nav>
    </div>`;
}

function threadCard(x, compact = false) {
    return `<button type="button" class="lingyu-thread ${compact ? 'compact' : ''}" data-thread="${esc(x.id)}">
        <div class="lingyu-avatar">${esc(x.name.slice(0, 1))}</div>
        <div class="lingyu-thread-main">
            <div class="lingyu-thread-row"><strong>${esc(x.name)}</strong>${x.unread ? `<span class="lingyu-count">${x.unread}</span>` : ''}</div>
            <p>${esc(x.preview || '')}</p>
        </div>
    </button>`;
}

function home(s) {
    const p = s.profile;
    const u = s.threads.filter(x => x.unread).slice(0, 3);
    return `<section class="lingyu-status-card">
        <div class="lingyu-status-kicker">当前所在</div>
        <h2>${esc(p.location)}</h2>
        <div class="lingyu-status-meta">
            <div><span>身份</span><strong>${esc(p.identity)}</strong></div>
            <div><span>时辰</span><strong>${esc(p.time)}</strong></div>
            <div><span>灵石</span><strong>${Number(p.stones || 0).toLocaleString()}</strong></div>
        </div>
    </section>
    <section class="lingyu-section">
        <div class="lingyu-section-title"><span>附近异动</span><small>${s.notices.length} 条</small></div>
        <div class="lingyu-notice-list">${s.notices.map((n, i) => `<div class="lingyu-notice"><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(n)}</p></div>`).join('')}</div>
    </section>
    <section class="lingyu-section">
        <div class="lingyu-section-title"><span>未读灵讯</span><small>${unread(s)} 条</small></div>
        ${u.map(x => threadCard(x, true)).join('') || '<div class="lingyu-empty">眼下无人催你。</div>'}
    </section>`;
}

function messages(s) {
    if (threadId) {
        const t = s.threads.find(x => x.id === threadId);
        if (t) {
            if (t.unread) {
                t.unread = 0;
                save();
                syncTop();
            }
            return `<div class="lingyu-chat-head">
                <button type="button" class="lingyu-back" data-act="back" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>
                <div><strong>${esc(t.name)}</strong><small>灵讯往来</small></div>
            </div>
            <div class="lingyu-chat-log">${t.messages.map(m => `<div class="lingyu-bubble-row ${m.from === 'me' ? 'mine' : ''}"><div class="lingyu-bubble">${esc(m.text)}</div><small>${esc(m.time || '')}</small></div>`).join('')}</div>
            <form id="lingyu-message-form" class="lingyu-compose"><input id="lingyu-message-input" autocomplete="off" placeholder="写一道灵讯……"><button type="submit">发送</button></form>`;
        }
        threadId = null;
    }
    return `<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>灵讯</span><small>${s.threads.length} 个往来</small></div><div class="lingyu-thread-list">${s.threads.map(x => threadCard(x)).join('')}</div></section>`;
}

function post(p) {
    const liked = (p.likes || []).includes('我');
    return `<article class="lingyu-post">
        <div class="lingyu-post-head"><div class="lingyu-avatar">${esc(p.author.slice(0, 1))}</div><div><strong>${esc(p.author)}</strong><small>${esc(p.role || '')} · ${esc(p.time || '')}</small></div></div>
        ${p.text ? `<p class="lingyu-post-text">${esc(p.text)}</p>` : ''}
        ${p.image ? `<div class="lingyu-image-placeholder"><span>留影</span><p>${esc(p.image)}</p></div>` : ''}
        <div class="lingyu-post-actions"><button type="button" data-like="${esc(p.id)}" class="${liked ? 'liked' : ''}">${liked ? '已赞' : '点赞'}</button><span>${(p.likes || []).length} 人赞</span></div>
        ${((p.likes || []).length || (p.comments || []).length) ? `<div class="lingyu-social-box">${(p.likes || []).length ? `<div class="lingyu-likes">♡ ${(p.likes || []).map(esc).join('、')}</div>` : ''}${(p.comments || []).map(c => `<div class="lingyu-comment"><strong>${esc(c.author)}：</strong>${esc(c.text)}</div>`).join('')}</div>` : ''}
    </article>`;
}

function feed(s) {
    return `<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>留影</span><small>好友 · 宗门 · 天下</small></div><form id="lingyu-feed-form" class="lingyu-feed-compose"><textarea id="lingyu-feed-input" rows="2" placeholder="留下一句话……"></textarea><button type="submit">发布</button></form><div>${s.feed.map(post).join('')}</div></section>`;
}

function market(s) {
    return `<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>坊市</span><small>云州今日行情</small></div><div class="lingyu-market-list">${s.market.map(x => `<div class="lingyu-market-item"><div><strong>${esc(x.name)}</strong><small>${esc(x.stock)}</small></div><div class="lingyu-price"><strong>${esc(x.price)}</strong><span>${esc(x.status)}</span></div></div>`).join('')}</div></section>`;
}

function people(s) {
    return `<section class="lingyu-section no-top"><div class="lingyu-section-title"><span>人物簿</span><small>你目前知道的事</small></div><div class="lingyu-person-list">${s.people.map(x => `<div class="lingyu-person"><div class="lingyu-avatar large">${esc(x.name.slice(0, 1))}</div><div class="lingyu-person-main"><div><strong>${esc(x.name)}</strong><span>${esc(x.relation)}</span></div><small>${esc(x.location)}</small><p>${esc(x.recent)}</p></div></div>`).join('')}</div></section>`;
}

function render() {
    if (!root) return;
    const s = state();
    root.innerHTML = shell(tab === 'home' ? home(s) : tab === 'messages' ? messages(s) : tab === 'feed' ? feed(s) : tab === 'market' ? market(s) : people(s));
    bindApp();
    syncTop();
}

function bindApp() {
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; threadId = null; render(); });
    root.querySelector('[data-act="close"]')?.addEventListener('click', () => void closePanel());
    root.querySelector('[data-act="refresh"]')?.addEventListener('click', refresh);
    root.querySelector('[data-act="back"]')?.addEventListener('click', () => { threadId = null; render(); });
    root.querySelectorAll('[data-thread]').forEach(b => b.onclick = () => { threadId = b.dataset.thread; tab = 'messages'; render(); });
    root.querySelectorAll('[data-like]').forEach(b => b.onclick = () => like(b.dataset.like));
    root.querySelector('#lingyu-message-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const text = root.querySelector('#lingyu-message-input')?.value.trim();
        const t = state().threads.find(x => x.id === threadId);
        if (!text || !t) return;
        t.messages.push({ from: 'me', text, time: '现在' });
        t.preview = text;
        save();
        render();
    });
    root.querySelector('#lingyu-feed-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const text = root.querySelector('#lingyu-feed-input')?.value.trim();
        if (!text) return;
        const s = state();
        s.feed.unshift({ id: `mine_${Date.now()}`, author: s.profile.name || '我', role: '我的留影', time: '刚刚', text, image: '', likes: [], comments: [] });
        save();
        render();
    });
}

function like(id) {
    const p = state().feed.find(x => x.id === id);
    if (!p) return;
    p.likes ??= [];
    const i = p.likes.indexOf('我');
    i >= 0 ? p.likes.splice(i, 1) : p.likes.push('我');
    save();
    render();
}

function refresh() {
    const s = state();
    const now = Date.now();
    refreshNo++;
    s.feed.unshift({ id: `world_${now}_${refreshNo}`, author: '云州闲谈', role: '天下', time: '刚刚', text: '北城门刚又加了一轮盘查，坊间开始有人打听昨夜进城的人。', image: '城门灯火亮着，守卫比平时多了一倍。', likes: [], comments: [] });
    s.threads.unshift({ id: `stranger_${now}_${refreshNo}`, name: '陌生传讯', preview: '昨夜鬼哭林里，你是不是见过一个戴银面的人？', unread: 1, messages: [{ from: 'them', text: '昨夜鬼哭林里，你是不是见过一个戴银面的人？', time: '刚刚' }] });
    s.notices.unshift('北城门刚又加了一轮盘查。');
    s.notices = s.notices.slice(0, 5);
    save();
    render();
}

async function openPanel() {
    if (popup) return;
    root = document.createElement('div');
    root.id = 'lingyu-jade-app';
    render();
    const p = new Popup(root, POPUP_TYPE.DISPLAY, '', {
        large: true,
        wider: true,
        leftAlign: true,
        allowVerticalScrolling: false,
        animation: 'fast',
        onClose: () => {
            if (popup === p) popup = null;
            root = null;
            syncTop();
        },
    });
    popup = p;
    syncTop();
    try { await p.show(); }
    catch (e) { console.error(`[${ID}] popup`, e); }
    finally {
        if (popup === p) popup = null;
        root = null;
        syncTop();
    }
}

async function closePanel() {
    if (!popup) return;
    const p = popup;
    try { await p.completeCancelled(); }
    catch (e) { console.warn(`[${ID}] close`, e); }
}

function toggle() {
    popup ? void closePanel() : void openPanel();
}

function mountTop() {
    if (document.getElementById('lingyu-top-entry')) return true;
    const h = document.getElementById('top-settings-holder');
    if (!h) return false;
    const e = document.createElement('div');
    e.id = 'lingyu-top-entry';
    e.className = 'drawer lingyu-top-entry';
    e.innerHTML = '<div class="drawer-toggle drawer-header" role="button" tabindex="0" title="灵枢玉简" aria-label="灵枢玉简"><div class="drawer-icon fa-solid fa-scroll fa-fw closedIcon"></div><span id="lingyu-top-badge" class="lingyu-top-badge" hidden></span></div>';
    const a = document.getElementById('persona-management-button');
    a?.parentElement === h ? a.after(e) : h.appendChild(e);
    const t = e.querySelector('.drawer-toggle');
    t.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        toggle();
    });
    t.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        ev.stopPropagation();
        toggle();
    });
    syncTop();
    console.log(`[${ID}] v${VER} mounted`);
    return true;
}

function ensureTop() {
    if (mountTop() || retry) return;
    let n = 0;
    retry = setInterval(() => {
        if (mountTop() || ++n >= 60) {
            clearInterval(retry);
            retry = null;
        }
    }, 250);
}

function bindChat() {
    if (bound) return;
    const c = ctx();
    if (!c?.eventSource || !c?.event_types?.CHAT_CHANGED) return;
    c.eventSource.on(c.event_types.CHAT_CHANGED, () => {
        threadId = null;
        tab = 'home';
        popup ? void closePanel() : syncTop();
    });
    bound = true;
}

function boot() {
    ensureTop();
    bindChat();
    setTimeout(bindChat, 1000);
}

document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
