(function () {
    if (window.__LINGYU_BOOTSTRAP_LOADED__) return;
    window.__LINGYU_BOOTSTRAP_LOADED__ = true;

    function getBaseUrl() {
        var current = document.currentScript;
        if (current && current.src) return new URL('.', current.src).href;
        var scripts = Array.prototype.slice.call(document.scripts || []);
        var hit = scripts.find(function (s) { return /\/bootstrap\.js(?:\?|$)/.test(s.src || ''); });
        return hit && hit.src ? new URL('.', hit.src).href : '';
    }

    function injectToolbarStyle() {
        if (document.getElementById('lingyu-toolbar-style')) return;
        var style = document.createElement('style');
        style.id = 'lingyu-toolbar-style';
        style.textContent = [
            '#lingyu-jade-fab.lingyu-toolbar-mode{',
            'position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;',
            'width:var(--topBarBlockSize,38px)!important;height:var(--topBarBlockSize,38px)!important;min-width:34px!important;',
            'margin:0!important;padding:0!important;border:0!important;border-radius:0!important;',
            'background:transparent!important;box-shadow:none!important;color:var(--SmartThemeBodyColor,currentColor)!important;',
            'opacity:.78!important;display:flex!important;align-items:center!important;justify-content:center!important;',
            'z-index:auto!important;transform:none!important;touch-action:manipulation!important;',
            '}',
            '#lingyu-jade-fab.lingyu-toolbar-mode:hover,#lingyu-jade-fab.lingyu-toolbar-mode:active{opacity:1!important;}',
            '#lingyu-jade-fab.lingyu-toolbar-mode .lingyu-fab-rune{font-size:20px!important;line-height:1!important;font-family:serif!important;}',
            '#lingyu-jade-fab.lingyu-toolbar-mode .lingyu-badge{top:0!important;right:-2px!important;}',
            '@media(max-width:520px){#lingyu-jade-fab.lingyu-toolbar-mode{width:34px!important;height:var(--topBarBlockSize,38px)!important;min-width:34px!important;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function attachToToolbar() {
        var fab = document.getElementById('lingyu-jade-fab');
        if (!fab) return false;

        var toolbar = document.getElementById('top-settings-holder');
        if (!toolbar) return false;

        fab.classList.add('lingyu-toolbar-mode');
        fab.removeAttribute('style');
        fab.setAttribute('title', '灵枢玉简');
        fab.setAttribute('aria-label', '打开灵枢玉简');
        toolbar.appendChild(fab);
        try { localStorage.removeItem('lingyu_jade_fab_pos_v1'); } catch (_) {}
        console.log('[Lingyu] toolbar mode attached');
        return true;
    }

    function startToolbarWatcher() {
        injectToolbarStyle();
        if (attachToToolbar()) return;
        var tries = 0;
        var timer = setInterval(function () {
            tries += 1;
            if (attachToToolbar() || tries > 80) clearInterval(timer);
        }, 125);
    }

    function loadCore() {
        var base = getBaseUrl();
        if (!base) {
            console.error('[Lingyu] cannot resolve extension base URL');
            return;
        }
        var script = document.createElement('script');
        script.src = base + 'index.js?v=0.1.3';
        script.async = false;
        script.onload = startToolbarWatcher;
        script.onerror = function () { console.error('[Lingyu] failed to load index.js'); };
        document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadCore, { once: true });
    } else {
        loadCore();
    }
})();
