import './bridge-v0.4.0.js';

const APP_ID = 'lingyu-jade-app';
const PROXY_ID = 'lingyu-top-toggle-proxy';

if (!window.__LINGYU_CLOSE_HOTFIX_V042__) {
    window.__LINGYU_CLOSE_HOTFIX_V042__ = true;
    bootCloseHotfix();
}

function getLingyuDialog() {
    const app = document.getElementById(APP_ID);
    return app?.closest('dialog.popup, .popup') || null;
}

function closeLingyuPanel() {
    const dialog = getLingyuDialog();
    const nativeClose = dialog?.querySelector('.popup-button-close');
    if (nativeClose instanceof HTMLElement) {
        nativeClose.click();
        return;
    }

    const internalClose = document.querySelector(`#${APP_ID} [data-act="close"]`);
    if (internalClose instanceof HTMLElement) internalClose.click();
}

function removeProxy() {
    document.getElementById(PROXY_ID)?.remove();
}

function syncTopToggleProxy() {
    const dialog = getLingyuDialog();
    if (!(dialog instanceof HTMLElement)) {
        removeProxy();
        return;
    }

    const source = document.querySelector('#lingyu-top-entry .drawer-toggle');
    if (!(source instanceof HTMLElement)) return;

    let proxy = dialog.querySelector(`#${PROXY_ID}`);
    if (!(proxy instanceof HTMLButtonElement)) {
        proxy = document.createElement('button');
        proxy.id = PROXY_ID;
        proxy.type = 'button';
        proxy.setAttribute('aria-label', '关闭灵枢玉简');
        proxy.title = '关闭灵枢玉简';
        proxy.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            closeLingyuPanel();
        });
        dialog.appendChild(proxy);
    }

    const rect = source.getBoundingClientRect();
    Object.assign(proxy.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${Math.max(34, rect.width)}px`,
        height: `${Math.max(34, rect.height)}px`,
        margin: '0',
        padding: '0',
        border: '0',
        background: 'transparent',
        opacity: '0.001',
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: '2147483647',
    });
}

function bootCloseHotfix() {
    const observer = new MutationObserver(() => syncTopToggleProxy());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', syncTopToggleProxy, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(syncTopToggleProxy, 80), { passive: true });
    syncTopToggleProxy();
}
