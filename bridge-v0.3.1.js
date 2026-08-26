import './index.js';
import { getContext } from '../../../extensions.js';

const META = 'lingyu_jade_state_v1';
const PROMPT_KEY = 'lingyu_jade_story_bridge';
const BRIDGE_VER = '0.3.1';
const MAX_RECENT_MESSAGES = 8;
const MAX_INJECTION_CHARS = 1800;

if (!window.__LINGYU_STORY_BRIDGE_V031__) {
    window.__LINGYU_STORY_BRIDGE_V031__ = true;
    bootBridge();
}

function getCtx() {
    try { return getContext(); }
    catch (e) { console.warn('[lingyu_bridge] context', e); return null; }
}

function getState() {
    const c = getCtx();
    const s = c?.chatMetadata?.[META];
    if (!s) return null;
    s.bridge ??= {};
    Object.assign(s.bridge, {
        auto: Boolean(s.bridge.auto),
        busy: Boolean(s.bridge.busy),
        lastSignature: String(s.bridge.lastSignature || ''),
        lastSyncAt: Number(s.bridge.lastSyncAt || 0),
        lastError: String(s.bridge.lastError || ''),
        facts: Array.isArray(s.bridge.facts) ? s.bridge.facts : [],
        history: Array.isArray(s.bridge.history) ? s.bridge.history : [],
    });
    return s;
}

function save() {
    const c = getCtx();
    try {
        if (typeof c?.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
        else if (typeof c?.saveMetadata === 'function') void c.saveMetadata();
    } catch (e) {
        console.warn('[lingyu_bridge] save', e);
    }
}

function notify(text, type = 'info') {
    const t = globalThis.toastr;
    if (t && typeof t[type] === 'function') t[type](text);
    else console.log(`[lingyu_bridge] ${text}`);
}

function normalizeArray(v) {
    return Array.isArray(v) ? v : [];
}

function normalizeKnownBy(v) {
    return normalizeArray(v).map(x => String(x || '').trim()).filter(Boolean).slice(0, 8);
}

function simpleHash(text) {
    let h = 2166136261;
    for (let i = 0; i < String(text).length; i++) {
        h ^= String(text).charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}

function recentStory() {
    const c = getCtx();
    const chat = Array.isArray(c?.chat) ? c.chat : [];
    return chat
        .filter(m => !m?.is_system && typeof m?.mes === 'string' && m.mes.trim())
        .slice(-MAX_RECENT_MESSAGES)
        .map((m, i) => {
            const speaker = m.is_user ? (c?.name1 || 'USER') : (m.name || c?.name2 || 'CHAR');
            return `${i + 1}. ${speaker}: ${m.mes.trim()}`;
        })
        .join('\n\n');
}

function storySignature() {
    const c = getCtx();
    const chat = Array.isArray(c?.chat) ? c.chat.filter(m => !m?.is_system && m?.mes) : [];
    const last = chat.at(-1);
    return `${chat.length}:${simpleHash(String(last?.mes || '').slice(-240))}`;
}

function bridgeSystemPrompt() {
    return `你是世界状态数据提取器，不是正文作者，不是角色扮演者。\n你的输出会被程序直接解析。\n\n只根据用户提供的“最近剧情”提取明确发生、可观察、可确认的事实；只有存在直接因果依据时，才生成最多 2 个设备/社交/消息侧反应。\n\n硬规则：\n- 禁止读取 USER 未外显心理。\n- 禁止把旁白知道的信息自动赋予角色。\n- 禁止凭空补身份、关系、地点、时间、组织、货币或世界设定。\n- 私密事实必须写明可知者。\n- side_effects 必须由最近剧情直接推出；没有合理外部反应就返回 []。\n- location/time 只有剧情明确变化时填写，否则空字符串。\n- 不续写正文，不解释，不评价。\n\n你必须只输出一个合法 JSON 对象。第一个字符必须是 {，最后一个字符必须是 }。不要 Markdown、不要代码块、不要星号、不要前言、不要尾注。\n\n固定结构：\n{\n  "scene":{"location":"","time":""},\n  "facts":[{"text":"已发生事实","known_by":["USER","角色名"],"visibility":"public|shared|user_private","importance":1}],\n  "side_effects":[\n    {"type":"notice","text":"公开或附近可见变化","known_by":["USER"]},\n    {"type":"message","from":"发送者","text":"消息内容","known_by":["USER","发送者"]},\n    {"type":"feed","author":"发布者","text":"动态正文","image":"","known_by":["USER","公开"]}\n  ]\n}\nimportance 只能是 1、2、3。最多 8 条 facts、2 条 side_effects。`;
}

function stripModelNoise(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();
}

function tryParseJson(text) {
    const raw = stripModelNoise(text);
    const candidates = [raw];
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));

    for (const candidate of candidates) {
        const repaired = candidate
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/,\s*([}\]])/g, '$1')
            .trim();
        try {
            const value = JSON.parse(repaired);
            if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        } catch (_) {
            // Keep trying; plain-text fallback below is intentional.
        }
    }
    return null;
}

function plainTextFallback(text) {
    const raw = stripModelNoise(text);
    const lines = raw
        .split(/\r?\n/)
        .map(x => x.replace(/^\s*(?:[-*•>]+|\d+[.)、])\s*/, '').trim())
        .filter(Boolean)
        .filter(x => !/^(?:事实|场景|side_effects?|facts?|scene|总结|分析)\s*[:：]?$/i.test(x));

    let location = '';
    let time = '';
    const facts = [];
    for (const line of lines) {
        const loc = line.match(/^(?:地点|位置|location)\s*[:：]\s*(.+)$/i);
        const tm = line.match(/^(?:时间|时辰|time)\s*[:：]\s*(.+)$/i);
        if (loc) { location = loc[1].trim(); continue; }
        if (tm) { time = tm[1].trim(); continue; }

        const cleaned = line.replace(/^[:：]+\s*/, '').trim();
        if (!cleaned || cleaned.length < 3 || cleaned.length > 240) continue;
        facts.push({
            text: cleaned,
            known_by: ['USER'],
            visibility: 'shared',
            importance: 1,
        });
        if (facts.length >= 8) break;
    }

    if (!location && !time && !facts.length) return null;
    return { scene: { location, time }, facts, side_effects: [], _fallback: true };
}

function parseBridgeAnswer(answer) {
    return tryParseJson(answer) || plainTextFallback(answer);
}

async function requestBridge(story) {
    const c = getCtx();
    if (typeof c?.generateRaw === 'function') {
        return await c.generateRaw({
            prompt: `【最近剧情】\n${story}`,
            systemPrompt: bridgeSystemPrompt(),
            responseLength: 700,
        });
    }
    if (typeof c?.generateQuietPrompt === 'function') {
        return await c.generateQuietPrompt({
            quietPrompt: `${bridgeSystemPrompt()}\n\n【最近剧情】\n${story}`,
            skipWIAN: true,
            responseLength: 700,
        });
    }
    throw new Error('当前酒馆版本没有可用的后台生成接口');
}

async function syncFromStory({ silent = false } = {}) {
    const s = getState();
    if (!s) {
        if (!silent) notify('当前聊天还没有可用的玉简状态。', 'warning');
        return;
    }
    if (s.bridge.busy) return;

    const story = recentStory();
    if (!story) {
        if (!silent) notify('还没有正文可以同步。', 'warning');
        return;
    }

    const signature = storySignature();
    if (signature && signature === s.bridge.lastSignature) {
        if (!silent) notify('剧情桥已经是最新。');
        refreshBridgeUi();
        return;
    }

    s.bridge.busy = true;
    s.bridge.lastError = '';
    refreshBridgeUi();

    try {
        const answer = await requestBridge(story);
        const parsed = parseBridgeAnswer(answer);
        if (!parsed) {
            const preview = stripModelNoise(answer).slice(0, 160).replace(/\s+/g, ' ');
            throw new Error(`模型返回无法解析：${preview || '空响应'}`);
        }

        const result = applyBridgeResult(parsed, signature);
        applyInjection();
        save();
        refreshBridgeUi(true);

        if (!silent) {
            const suffix = parsed._fallback ? '（模型没按 JSON 回，已用宽松模式接住）' : '';
            notify(`同步完成：${result.factCount} 条事实，${result.effectCount} 个世界反应${suffix}`, 'success');
            if (!result.effectCount) {
                setTimeout(() => notify('本轮没有足够因果依据生成外部反应，所以页面不会硬凑新消息。'), 120);
            }
        }
    } catch (e) {
        console.error('[lingyu_bridge] sync failed', e);
        s.bridge.lastError = String(e?.message || e || 'unknown error');
        if (!silent) notify(`剧情同步失败：${s.bridge.lastError}`, 'error');
    } finally {
        s.bridge.busy = false;
        save();
        refreshBridgeUi();
    }
}

function applyBridgeResult(data, signature) {
    const s = getState();
    if (!s) return { factCount: 0, effectCount: 0 };
    const bridge = s.bridge;
    const scene = data?.scene || {};
    if (scene.location && s.profile) s.profile.location = String(scene.location).trim();
    if (scene.time && s.profile) s.profile.time = String(scene.time).trim();

    const facts = normalizeArray(data?.facts)
        .map(f => ({
            text: String(f?.text || '').trim(),
            known_by: normalizeKnownBy(f?.known_by),
            visibility: String(f?.visibility || 'shared'),
            importance: Math.max(1, Math.min(3, Number(f?.importance || 1))),
        }))
        .filter(f => f.text)
        .slice(0, 8);

    const effects = normalizeArray(data?.side_effects).slice(0, 2);
    const appliedEffects = [];
    for (const e of effects) {
        const applied = applySideEffect(e, s);
        if (applied) appliedEffects.push(applied);
    }

    bridge.facts = [...normalizeArray(bridge.facts), ...facts].slice(-24);
    bridge.history = [...normalizeArray(bridge.history), {
        at: Date.now(), signature, facts, effects: appliedEffects,
    }].slice(-6);
    bridge.lastSignature = signature;
    bridge.lastSyncAt = Date.now();
    bridge.lastError = '';

    return { factCount: facts.length, effectCount: appliedEffects.length };
}

function applySideEffect(e, s) {
    const type = String(e?.type || '').trim();
    const knownBy = normalizeKnownBy(e?.known_by);

    if (type === 'notice') {
        const text = String(e?.text || '').trim();
        if (!text) return null;
        s.notices ??= [];
        if (!s.notices.includes(text)) s.notices.unshift(text);
        s.notices = s.notices.slice(0, 8);
        return { type, text, known_by: knownBy };
    }

    if (type === 'message') {
        const from = String(e?.from || '').trim();
        const text = String(e?.text || '').trim();
        if (!from || !text) return null;
        s.threads ??= [];
        let thread = s.threads.find(x => x.name === from);
        if (!thread) {
            thread = { id: `bridge_${simpleHash(from)}`, name: from, preview: '', unread: 0, messages: [] };
            s.threads.unshift(thread);
        }
        thread.messages ??= [];
        const last = thread.messages.at(-1);
        if (!(last?.from === 'them' && last?.text === text)) {
            thread.messages.push({ from: 'them', text, time: '刚刚' });
            thread.preview = text;
            thread.unread = Number(thread.unread || 0) + 1;
        }
        return { type, from, text, known_by: knownBy.length ? knownBy : ['USER', from] };
    }

    if (type === 'feed') {
        const author = String(e?.author || '').trim();
        const text = String(e?.text || '').trim();
        const image = String(e?.image || '').trim();
        if (!author || (!text && !image)) return null;
        s.feed ??= [];
        const exists = s.feed.some(x => x.author === author && x.text === text && x.image === image);
        if (!exists) {
            s.feed.unshift({
                id: `bridge_feed_${Date.now()}_${simpleHash(author + text)}`,
                author, role: '世界动态', time: '刚刚', text, image,
                likes: [], comments: [],
            });
        }
        return { type, author, text, image, known_by: knownBy.length ? knownBy : ['USER', '公开'] };
    }
    return null;
}

function collectDeviceActions(s) {
    const out = [];
    for (const t of normalizeArray(s?.threads)) {
        const mine = normalizeArray(t?.messages).filter(m => m?.from === 'me' && String(m?.text || '').trim()).at(-1);
        if (mine) out.push({
            text: `USER 已通过设备向“${t.name}”发送：“${String(mine.text).trim()}”`,
            known_by: ['USER', String(t.name || '').trim()].filter(Boolean),
        });
    }
    const minePosts = normalizeArray(s?.feed)
        .filter(p => p?.role === '我的留影' && String(p?.text || '').trim())
        .slice(0, 2)
        .map(p => ({ text: `USER 已发布设备动态：“${String(p.text).trim()}”`, known_by: ['USER', '动态可见者'] }));
    return [...out.slice(-3), ...minePosts];
}

function buildInjectionText() {
    const s = getState();
    if (!s) return '';
    const lines = [];
    const importantFacts = normalizeArray(s.bridge.facts)
        .filter(f => Number(f?.importance || 1) >= 2)
        .slice(-8);

    for (const f of importantFacts) {
        const known = normalizeKnownBy(f.known_by);
        lines.push(`- ${f.text}${known.length ? `（可知者：${known.join('、')}）` : ''}`);
    }

    for (const batch of normalizeArray(s.bridge.history).slice(-3)) {
        for (const e of normalizeArray(batch?.effects)) {
            if (e.type === 'message') lines.push(`- ${e.from} 已通过设备向 USER 发送：“${e.text}”（可知者：${normalizeKnownBy(e.known_by).join('、') || `USER、${e.from}`}）`);
            if (e.type === 'notice') lines.push(`- 世界侧变化：${e.text}`);
            if (e.type === 'feed') lines.push(`- ${e.author} 已发布动态：“${e.text || e.image}”（可见范围按设备状态处理）`);
        }
    }

    for (const a of collectDeviceActions(s)) {
        lines.push(`- ${a.text}（可知者：${a.known_by.join('、')}）`);
    }

    const unique = [...new Set(lines)].slice(-12);
    if (!unique.length) return '';
    const text = `【世界侧连续性 / 设备状态】\n这些内容是已发生的连续性事实，不要逐条复述，只在自然相关时体现。\n${unique.join('\n')}\n信息边界：括号中“可知者”之外的角色不得自动获知；USER 的私密设备内容除非被展示、转述、窥见或通过合理渠道获取，否则不能被其他角色知道。`;
    return text.slice(0, MAX_INJECTION_CHARS);
}

function applyInjection() {
    const c = getCtx();
    if (typeof c?.setExtensionPrompt !== 'function') return;
    try {
        c.setExtensionPrompt(PROMPT_KEY, buildInjectionText(), 1, 1, false, 0);
    } catch (e) {
        console.warn('[lingyu_bridge] injection', e);
    }
}

function toggleAuto() {
    const s = getState();
    if (!s) return;
    s.bridge.auto = !s.bridge.auto;
    save();
    refreshBridgeUi();
    notify(s.bridge.auto ? '自动剧情联动已开启：每轮角色正文后额外调用一次当前 API。' : '自动剧情联动已关闭。', s.bridge.auto ? 'success' : 'info');
    if (s.bridge.auto) void syncFromStory({ silent: true });
}

function injectBridgeStyle() {
    if (document.getElementById('lingyu-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'lingyu-bridge-style';
    style.textContent = `#lingyu-jade-app .lingyu-bridge-auto.active{color:var(--lingyu-jade)!important;background:rgba(72,104,88,.12)!important}#lingyu-jade-app .lingyu-bridge-sync.busy i{animation:lingyuBridgeSpin .8s linear infinite}@keyframes lingyuBridgeSpin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(style);
}

function decoratePanel() {
    const actions = document.querySelector('#lingyu-jade-app .lingyu-head-actions');
    if (!actions) return;
    injectBridgeStyle();

    if (!actions.querySelector('.lingyu-bridge-sync')) {
        const syncBtn = document.createElement('button');
        syncBtn.type = 'button';
        syncBtn.className = 'lingyu-bridge-sync';
        syncBtn.title = '从最近正文同步世界状态';
        syncBtn.setAttribute('aria-label', '同步剧情');
        syncBtn.innerHTML = '<i class="fa-solid fa-link"></i>';
        syncBtn.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            void syncFromStory();
        });
        actions.prepend(syncBtn);
    }

    if (!actions.querySelector('.lingyu-bridge-auto')) {
        const autoBtn = document.createElement('button');
        autoBtn.type = 'button';
        autoBtn.className = 'lingyu-bridge-auto';
        autoBtn.title = '自动剧情联动（每轮额外调用一次 API）';
        autoBtn.setAttribute('aria-label', '自动剧情联动');
        autoBtn.innerHTML = '<i class="fa-solid fa-bolt"></i>';
        autoBtn.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            toggleAuto();
        });
        actions.prepend(autoBtn);
    }
    refreshBridgeUi();
}

function refreshBridgeUi(rerender = false) {
    const s = getState();
    const syncBtn = document.querySelector('#lingyu-jade-app .lingyu-bridge-sync');
    const autoBtn = document.querySelector('#lingyu-jade-app .lingyu-bridge-auto');
    syncBtn?.classList.toggle('busy', !!s?.bridge?.busy);
    syncBtn?.toggleAttribute('disabled', !!s?.bridge?.busy);
    autoBtn?.classList.toggle('active', !!s?.bridge?.auto);
    if (autoBtn) autoBtn.title = s?.bridge?.auto ? '自动剧情联动：已开启' : '自动剧情联动：已关闭';

    if (rerender) {
        const active = document.querySelector('#lingyu-jade-app [data-tab].active');
        if (active instanceof HTMLElement) active.click();
        setTimeout(decoratePanel, 0);
    }
}

function bindDeviceActions() {
    document.addEventListener('submit', ev => {
        const el = ev.target;
        if (!(el instanceof HTMLElement)) return;
        if (el.id !== 'lingyu-message-form' && el.id !== 'lingyu-feed-form') return;
        setTimeout(() => { applyInjection(); save(); }, 0);
    });
}

function bindStoryEvents() {
    const c = getCtx();
    const es = c?.eventSource;
    const et = c?.eventTypes || c?.event_types || {};
    if (!es) return;

    const onRendered = () => {
        const s = getState();
        if (s?.bridge?.auto) setTimeout(() => void syncFromStory({ silent: true }), 80);
    };
    const onChatChanged = () => setTimeout(() => { applyInjection(); refreshBridgeUi(); }, 80);

    if (et.CHARACTER_MESSAGE_RENDERED) {
        if (typeof es.makeLast === 'function') es.makeLast(et.CHARACTER_MESSAGE_RENDERED, onRendered);
        else es.on(et.CHARACTER_MESSAGE_RENDERED, onRendered);
    }
    if (et.CHAT_CHANGED) es.on(et.CHAT_CHANGED, onChatChanged);
}

function watchPanel() {
    const observer = new MutationObserver(() => decoratePanel());
    observer.observe(document.body, { childList: true, subtree: true });
    decoratePanel();
}

function bootBridge() {
    const start = () => {
        bindDeviceActions();
        bindStoryEvents();
        watchPanel();
        setTimeout(applyInjection, 300);
        console.log(`[lingyu_bridge] v${BRIDGE_VER} ready`);
    };
    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', start, { once: true })
        : start();
}
