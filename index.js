const MODULE_ID = 'lingyu_jade_mvp';
const META_KEY = 'lingyu_jade_state_v1';

let currentTab = 'home';
let isOpen = false;
let activeThreadId = null;
let refreshIndex = 0;

const worldBursts = [
    {
        feed: {
            id: 'world_' + Date.now() + '_1',
            author: '云州闲谈',
            role: '天下',
            time: '一刻前',
            text: '北城门忽然加了两轮盘查，有人说是昨夜有东西从城外进来了。官面上还没消息。',
            image: '夜色里的北城门，灯火比平日亮了许多。',
            likes: ['沈砚', '路过的散修'],
            comments: [
                { author: '青竹客', text: '我刚从那边回来，确实查得严。' },
                { author: '云州闲谈', text: '有后续我再更。' }
            ]
        },
        message: {
            id: 'stranger_' + Date.now() + '_1',
            name: '陌生传讯',
            preview: '昨夜鬼哭林里，你是不是见过一个戴银面的人？',
            unread: 1,
            messages: [
                { from: 'them', text: '昨夜鬼哭林里，你是不是见过一个戴银面的人？', time: '刚刚' }
            ]
        }
    },
    {
        feed: {
            id: 'world_' + Date.now() + '_2',
            author: '珍宝阁·云州分号',
            role: '商家',
            time: '半个时辰前',
            text: '赤霄果今日到货不多，每人限购三枚。',
            image: '木匣里摆着三枚赤红灵果，表皮有细碎金纹。',
            likes: ['祁越', '温庭', '沈翊'],
            comments: [
                { author: '林照', text: '又涨价？' },
                { author: '珍宝阁·云州分号', text: '今年灵田收成一般。' }
            ]
        },
        message: {
            id: 'bao_' + Date.now() + '_2',
            name: '珍宝阁掌柜',
            preview: '你上回问的青玉护身扣到了。',
            unread: 1,
            messages: [
                { from: 'them', text: '你上回问的青玉护身扣到了。', time: '刚刚' },
                { from: 'them', text: '若还要，我替你留到酉时。', time: '刚刚' }
            ]
        }
    },
    {
        feed: {
            id: 'world_' + Date.now() + '_3',
            author: '裴照',
            role: '好友',
            time: '刚刚',
            text: '今日剑坪有人把第三块试剑石劈了。',
            image: '断成两截的黑色试剑石，旁边围了一圈看热闹的弟子。',
            likes: ['林惊鹤', '谢临渊'],
            comments: [
                { author: '林惊鹤', text: '谁？' },
                { author: '裴照', text: '你师弟。' },
                { author: '林惊鹤', text: '……赔钱了吗。' }
            ]
        },
        message: {
            id: 'pei_' + Date.now() + '_3',
            name: '裴照',
            preview: '你今天没去剑坪？错过大戏了。',
            unread: 1,
            messages: [
                { from: 'them', text: '你今天没去剑坪？错过大戏了。', time: '刚刚' }
            ]
        }
    }
];

function getContextSafe() {
    try {
        return SillyTavern.getContext();
    } catch (error) {
        console.warn(`[${MODULE_ID}] getContext failed`, error);
        return null;
    }
}

function defaultState() {
    return {
        profile: {
            name: '虞昭',
            location: '云州 · 青霄宗外院',
            time: '酉时二刻',
            stones: 2430,
            identity: '外院弟子'
        },
        notices: [
            '北城门今晚临时增加盘查。',
            '鬼哭林外围有人看见陌生灵兽踪迹。',
            '珍宝阁今日赤霄果限购。'
        ],
        threads: [
            {
                id: 'funing',
                name: '傅宁',
                preview: '到了给我回一声。',
                unread: 2,
                messages: [
                    { from: 'them', text: '到哪了？', time: '申时三刻' },
                    { from: 'them', text: '到了给我回一声。', time: '申时四刻' }
                ]
            },
            {
                id: 'sect',
                name: '青霄宗执事',
                preview: '明日辰时外院点名。',
                unread: 0,
                messages: [
                    { from: 'them', text: '明日辰时外院点名，迟到者记缺。', time: '未时' }
                ]
            },
            {
                id: 'shopkeeper',
                name: '珍宝阁掌柜',
                preview: '上次说的青玉护身扣到了。',
                unread: 0,
                messages: [
                    { from: 'them', text: '上次说的青玉护身扣到了。', time: '午时' }
                ]
            }
        ],
        feed: [
            {
                id: 'feed_1',
                author: '裴照',
                role: '好友',
                time: '一刻前',
                text: '今日剑坪有人把第三块试剑石劈了。',
                image: '断成两截的黑色试剑石，碎屑落了一地。',
                likes: ['林惊鹤', '谢临渊'],
                comments: [
                    { author: '林惊鹤', text: '谁？' },
                    { author: '裴照', text: '你师弟。' },
                    { author: '林惊鹤', text: '……赔钱了吗。' }
                ]
            },
            {
                id: 'feed_2',
                author: '珍宝阁·云州分号',
                role: '商家',
                time: '半个时辰前',
                text: '赤霄果今日到货不多，每人限购三枚。',
                image: '木匣中三枚赤红灵果被细绢垫着。',
                likes: ['祁越', '温庭', '沈翊'],
                comments: [
                    { author: '林照', text: '价格呢？' },
                    { author: '珍宝阁·云州分号', text: '比昨日高一成。' }
                ]
            },
            {
                id: 'feed_3',
                author: '傅宁',
                role: '好友',
                time: '一个时辰前',
                text: '',
                image: '窗边放着一盏清茶，旁边压着半卷书。',
                likes: ['沈砚'],
                comments: [
                    { author: '沈砚', text: '难得。' }
                ]
            }
        ],
        market: [
            { name: '赤霄果', price: '38 中品灵石', status: '涨', stock: '限购三枚' },
            { name: '青玉护身扣', price: '120 中品灵石', status: '平', stock: '余 2 件' },
            { name: '归元丹', price: '16 中品灵石', status: '跌', stock: '充足' },
            { name: '鬼哭林外围图', price: '9 中品灵石', status: '平', stock: '新图' }
        ],
        people: [
            { name: '傅宁', relation: '熟识', location: '不明', recent: '申时连续传讯两次。' },
            { name: '裴照', relation: '好友', location: '青霄宗剑坪', recent: '刚发了一条留影。' },
            { name: '林惊鹤', relation: '认识', location: '内院', recent: '在裴照的动态下留言。' },
            { name: '谢临渊', relation: '认识', location: '宗门外', recent: '昨夜曾去过鬼哭林。' }
        ]
    };
}

function loadState() {
    const context = getContextSafe();
    if (!context) return defaultState();
    context.chatMetadata ||= {};
    if (!context.chatMetadata[META_KEY]) {
        context.chatMetadata[META_KEY] = defaultState();
        saveState();
    }
    return context.chatMetadata[META_KEY];
}

function saveState() {
    const context = getContextSafe();
    if (!context) return;
    try {
        context.saveMetadataDebounced();
    } catch (error) {
        console.warn(`[${MODULE_ID}] saveMetadataDebounced failed`, error);
    }
}

function esc(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function unreadCount(state) {
    return state.threads.reduce((sum, thread) => sum + Number(thread.unread || 0), 0);
}

function render() {
    const state = loadState();
    renderBadge(state);
    renderPanel(state);
}

function renderBadge(state) {
    const badge = document.querySelector('#lingyu-jade-badge');
    if (!badge) return;
    const count = unreadCount(state);
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count <= 0;
}

function panelShell(content) {
    return `
        <div class="lingyu-shell">
            <div class="lingyu-topbar">
                <div class="lingyu-title-wrap">
                    <div class="lingyu-seal">灵</div>
                    <div>
                        <div class="lingyu-title">灵枢玉简</div>
                        <div class="lingyu-subtitle">同一方天地，另一扇窗</div>
                    </div>
                </div>
                <div class="lingyu-top-actions">
                    <button class="lingyu-icon-btn" data-action="refresh-world" title="刷新世界">↻</button>
                    <button class="lingyu-icon-btn" data-action="close" title="关闭">×</button>
                </div>
            </div>
            <div class="lingyu-body">${content}</div>
            <div class="lingyu-tabs">
                ${tabButton('home', '首页', '⌂')}
                ${tabButton('messages', '灵讯', '✉')}
                ${tabButton('feed', '留影', '◉')}
                ${tabButton('market', '坊市', '◇')}
                ${tabButton('people', '人物簿', '人')}
            </div>
        </div>
    `;
}

function tabButton(tab, label, icon) {
    return `<button class="lingyu-tab ${currentTab === tab ? 'active' : ''}" data-tab="${tab}"><span>${icon}</span><small>${label}</small></button>`;
}

function renderPanel(state) {
    const panel = document.querySelector('#lingyu-jade-panel');
    if (!panel) return;
    panel.classList.toggle('open', isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));

    let body = '';
    if (currentTab === 'home') body = renderHome(state);
    if (currentTab === 'messages') body = renderMessages(state);
    if (currentTab === 'feed') body = renderFeed(state);
    if (currentTab === 'market') body = renderMarket(state);
    if (currentTab === 'people') body = renderPeople(state);
    panel.innerHTML = panelShell(body);
    bindPanelEvents();
}

function renderHome(state) {
    const p = state.profile;
    return `
        <section class="lingyu-hero">
            <div class="lingyu-hero-line"><span>${esc(p.identity)}</span><span>${esc(p.time)}</span></div>
            <h2>${esc(p.location)}</h2>
            <div class="lingyu-stone"><span>灵石</span><strong>${Number(p.stones).toLocaleString()}</strong></div>
        </section>
        <section class="lingyu-section">
            <div class="lingyu-section-title"><span>附近异动</span><small>世界没有停下来</small></div>
            <div class="lingyu-notice-list">
                ${state.notices.map((n, i) => `<div class="lingyu-notice"><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(n)}</p></div>`).join('')}
            </div>
        </section>
        <section class="lingyu-section">
            <div class="lingyu-section-title"><span>未读灵讯</span><small>${unreadCount(state)} 条</small></div>
            ${state.threads.filter(x => x.unread).slice(0, 3).map(thread => threadCard(thread, true)).join('') || `<div class="lingyu-empty">眼下无人催你。</div>`}
        </section>
    `;
}

function threadCard(thread, compact = false) {
    return `
        <button class="lingyu-thread ${compact ? 'compact' : ''}" data-thread="${esc(thread.id)}">
            <div class="lingyu-avatar">${esc(thread.name.slice(0, 1))}</div>
            <div class="lingyu-thread-main">
                <div class="lingyu-thread-row"><strong>${esc(thread.name)}</strong>${thread.unread ? `<span class="lingyu-count">${thread.unread}</span>` : ''}</div>
                <p>${esc(thread.preview || '')}</p>
            </div>
        </button>
    `;
}

function renderMessages(state) {
    if (activeThreadId) {
        const thread = state.threads.find(x => x.id === activeThreadId);
        if (thread) {
            thread.unread = 0;
            saveState();
            return `
                <div class="lingyu-chat-head">
                    <button class="lingyu-back" data-action="back-threads">‹</button>
                    <div><strong>${esc(thread.name)}</strong><small>灵讯往来</small></div>
                </div>
                <div class="lingyu-chat-log">
                    ${thread.messages.map(msg => `
                        <div class="lingyu-bubble-row ${msg.from === 'me' ? 'mine' : ''}">
                            <div class="lingyu-bubble">${esc(msg.text)}</div>
                            <small>${esc(msg.time || '')}</small>
                        </div>
                    `).join('')}
                </div>
                <form id="lingyu-message-form" class="lingyu-compose">
                    <input id="lingyu-message-input" autocomplete="off" placeholder="写一道灵讯……" />
                    <button type="submit">发送</button>
                </form>
            `;
        }
        activeThreadId = null;
    }

    return `
        <section class="lingyu-section no-top">
            <div class="lingyu-section-title"><span>灵讯</span><small>${state.threads.length} 个往来</small></div>
            <div class="lingyu-thread-list">${state.threads.map(x => threadCard(x)).join('')}</div>
        </section>
    `;
}

function renderFeed(state) {
    return `
        <section class="lingyu-section no-top">
            <div class="lingyu-section-title"><span>留影</span><small>好友 · 宗门 · 天下</small></div>
            <form id="lingyu-feed-form" class="lingyu-feed-compose">
                <textarea id="lingyu-feed-input" rows="2" placeholder="留下一句话……"></textarea>
                <button type="submit">发布</button>
            </form>
            <div class="lingyu-feed-list">
                ${state.feed.map(post => feedCard(post)).join('')}
            </div>
        </section>
    `;
}

function feedCard(post) {
    const likedByMe = post.likes?.includes('我');
    return `
        <article class="lingyu-post">
            <div class="lingyu-post-head">
                <div class="lingyu-avatar">${esc(post.author.slice(0, 1))}</div>
                <div><strong>${esc(post.author)}</strong><small>${esc(post.role || '')} · ${esc(post.time || '')}</small></div>
            </div>
            ${post.text ? `<p class="lingyu-post-text">${esc(post.text)}</p>` : ''}
            ${post.image ? `<div class="lingyu-image-placeholder"><span>留影</span><p>${esc(post.image)}</p></div>` : ''}
            <div class="lingyu-post-actions">
                <button data-like="${esc(post.id)}" class="${likedByMe ? 'liked' : ''}">${likedByMe ? '已赞' : '点赞'}</button>
                <span>${post.likes?.length || 0} 人赞</span>
            </div>
            ${(post.likes?.length || post.comments?.length) ? `
                <div class="lingyu-social-box">
                    ${post.likes?.length ? `<div class="lingyu-likes">♡ ${post.likes.map(esc).join('、')}</div>` : ''}
                    ${(post.comments || []).map(c => `<div class="lingyu-comment"><strong>${esc(c.author)}：</strong>${esc(c.text)}</div>`).join('')}
                </div>` : ''}
        </article>
    `;
}

function renderMarket(state) {
    return `
        <section class="lingyu-section no-top">
            <div class="lingyu-section-title"><span>坊市</span><small>云州今日行情</small></div>
            <div class="lingyu-market-list">
                ${state.market.map(item => `
                    <div class="lingyu-market-item">
                        <div><strong>${esc(item.name)}</strong><small>${esc(item.stock)}</small></div>
                        <div class="lingyu-price"><strong>${esc(item.price)}</strong><span class="${item.status === '涨' ? 'up' : item.status === '跌' ? 'down' : ''}">${esc(item.status)}</span></div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

function renderPeople(state) {
    return `
        <section class="lingyu-section no-top">
            <div class="lingyu-section-title"><span>人物簿</span><small>你目前知道的事</small></div>
            <div class="lingyu-person-list">
                ${state.people.map(person => `
                    <div class="lingyu-person">
                        <div class="lingyu-avatar large">${esc(person.name.slice(0, 1))}</div>
                        <div class="lingyu-person-main">
                            <div><strong>${esc(person.name)}</strong><span>${esc(person.relation)}</span></div>
                            <small>${esc(person.location)}</small>
                            <p>${esc(person.recent)}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

function bindPanelEvents() {
    const panel = document.querySelector('#lingyu-jade-panel');
    if (!panel) return;

    panel.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTab = btn.dataset.tab;
            activeThreadId = null;
            render();
        });
    });

    panel.querySelector('[data-action="close"]')?.addEventListener('click', closePanel);
    panel.querySelector('[data-action="refresh-world"]')?.addEventListener('click', refreshWorld);
    panel.querySelector('[data-action="back-threads"]')?.addEventListener('click', () => {
        activeThreadId = null;
        render();
    });

    panel.querySelectorAll('[data-thread]').forEach(btn => {
        btn.addEventListener('click', () => {
            activeThreadId = btn.dataset.thread;
            currentTab = 'messages';
            render();
        });
    });

    panel.querySelectorAll('[data-like]').forEach(btn => {
        btn.addEventListener('click', () => toggleLike(btn.dataset.like));
    });

    panel.querySelector('#lingyu-message-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = panel.querySelector('#lingyu-message-input');
        const text = input?.value.trim();
        if (!text || !activeThreadId) return;
        const state = loadState();
        const thread = state.threads.find(x => x.id === activeThreadId);
        if (!thread) return;
        thread.messages.push({ from: 'me', text, time: '现在' });
        thread.preview = text;
        saveState();
        render();
    });

    panel.querySelector('#lingyu-feed-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = panel.querySelector('#lingyu-feed-input');
        const text = input?.value.trim();
        if (!text) return;
        const state = loadState();
        state.feed.unshift({
            id: `mine_${Date.now()}`,
            author: state.profile.name || '我',
            role: '我的留影',
            time: '刚刚',
            text,
            image: '',
            likes: [],
            comments: []
        });
        saveState();
        render();
    });
}

function toggleLike(postId) {
    const state = loadState();
    const post = state.feed.find(x => x.id === postId);
    if (!post) return;
    post.likes ||= [];
    const index = post.likes.indexOf('我');
    if (index >= 0) post.likes.splice(index, 1);
    else post.likes.push('我');
    saveState();
    render();
}

function refreshWorld() {
    const state = loadState();
    const burst = worldBursts[refreshIndex % worldBursts.length];
    refreshIndex += 1;

    const feed = JSON.parse(JSON.stringify(burst.feed));
    feed.id = `world_${Date.now()}_${refreshIndex}`;
    state.feed.unshift(feed);

    const message = JSON.parse(JSON.stringify(burst.message));
    const existing = state.threads.find(x => x.name === message.name);
    if (existing) {
        existing.messages.push(...message.messages);
        existing.preview = message.preview;
        existing.unread = Number(existing.unread || 0) + Number(message.unread || 0);
    } else {
        message.id = `thread_${Date.now()}_${refreshIndex}`;
        state.threads.unshift(message);
    }

    state.notices.unshift(feed.text || `${feed.author} 刚刚更新了一条留影。`);
    state.notices = state.notices.slice(0, 5);
    saveState();
    render();
}

function openPanel() {
    isOpen = true;
    render();
}

function closePanel() {
    isOpen = false;
    render();
}

function mount() {
    if (document.querySelector('#lingyu-jade-root')) return;
    const root = document.createElement('div');
    root.id = 'lingyu-jade-root';
    root.innerHTML = `
        <button id="lingyu-jade-fab" aria-label="打开灵枢玉简">
            <span class="lingyu-fab-rune">简</span>
            <span id="lingyu-jade-badge" class="lingyu-badge" hidden></span>
        </button>
        <div id="lingyu-jade-panel" aria-hidden="true"></div>
    `;
    document.body.appendChild(root);
    root.querySelector('#lingyu-jade-fab')?.addEventListener('click', () => {
        isOpen ? closePanel() : openPanel();
    });
    render();
}

function bindChatEvents() {
    const context = getContextSafe();
    if (!context?.eventSource || !context?.event_types) return;
    const eventTypes = context.event_types;
    if (eventTypes.CHAT_CHANGED) {
        context.eventSource.on(eventTypes.CHAT_CHANGED, () => {
            activeThreadId = null;
            currentTab = 'home';
            render();
        });
    }
}

export async function onActivate() {
    mount();
    bindChatEvents();
}

jQuery(async () => {
    mount();
    bindChatEvents();
});
