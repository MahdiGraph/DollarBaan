import { html, icon, setHtml } from '../lib/dom.js';

/**
 * Opens a modal <dialog>. Returns { dialog, body, foot, close(result) }.
 * `onClose(result)` runs once; dismissing (Esc, backdrop, X) closes with null.
 */
export function openDialog({ title, size = '', body = '', footer = null, onClose, dismissible = true } = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = `dialog ${size}`.trim();
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    setHtml(dialog, html`
        <div class="dialog-head">
            <h2 id="dialog-title">${title}</h2>
            <button type="button" class="icon-btn plain" data-close aria-label="بستن">${icon('x')}</button>
        </div>
        <div class="dialog-body"></div>
        <div class="dialog-foot" hidden></div>
    `);
    const bodyElement = dialog.querySelector('.dialog-body');
    const footElement = dialog.querySelector('.dialog-foot');
    setHtml(bodyElement, body);
    if (footer) {
        setHtml(footElement, footer);
        footElement.hidden = false;
    }

    let closed = false;
    const close = (result = null) => {
        if (closed) return;
        closed = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        if (onClose) onClose(result);
    };

    const outside = (event) => {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    let pressedOnBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => {
        pressedOnBackdrop = event.target === dialog && outside(event);
    });
    dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-close]')) {
            close(null);
            return;
        }
        if (dismissible && pressedOnBackdrop && event.target === dialog && outside(event)) close(null);
    });
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (dismissible) close(null);
    });

    document.body.append(dialog);
    dialog.showModal();
    return { dialog, body: bodyElement, foot: footElement, close };
}

export function confirmDialog({ title, message, confirmText = 'تأیید', cancelText = 'انصراف', danger = false }) {
    return new Promise((resolve) => {
        const instance = openDialog({
            title,
            size: 'sm',
            body: html`<p class="dialog-message">${message}</p>`,
            footer: html`
                <button type="button" class="btn btn-ghost" data-close>${cancelText}</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmText}</button>
            `,
            onClose: (result) => resolve(result === true),
        });
        const confirm = instance.foot.querySelector('[data-confirm]');
        confirm.addEventListener('click', () => instance.close(true));
        confirm.focus();
    });
}

/** Puts a button into a busy state while `task` runs. */
export async function withBusy(button, task) {
    const original = button.innerHTML;
    const label = button.textContent.trim();
    button.disabled = true;
    button.classList.add('spin');
    setHtml(button, html`${icon('refresh-cw', 'spin')}${label ? html`<span>${label}</span>` : ''}`);
    try {
        return await task();
    } finally {
        button.disabled = false;
        button.classList.remove('spin');
        button.innerHTML = original;
    }
}
