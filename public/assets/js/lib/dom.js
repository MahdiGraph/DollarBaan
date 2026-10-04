// Minimal templating: every interpolated value is escaped unless it is already Html.

class Html {
    constructor(text) {
        this.text = text;
    }

    toString() {
        return this.text;
    }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function render(value) {
    if (value === null || value === undefined || value === false) return '';
    if (value instanceof Html) return value.text;
    if (Array.isArray(value)) return value.map(render).join('');
    return escapeHtml(value);
}

export function html(strings, ...values) {
    let out = strings[0];
    for (let i = 0; i < values.length; i += 1) out += render(values[i]) + strings[i + 1];
    return new Html(out);
}

/** Marks trusted markup (never pass user data here). */
export function raw(text) {
    return new Html(String(text));
}

export function setHtml(element, content) {
    element.innerHTML = render(content);
    return element;
}

export function icon(name, className = '') {
    return raw(`<svg class="icon${className ? ` ${className}` : ''}" aria-hidden="true"><use href="/assets/icons.svg#${name}"></use></svg>`);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Delegated event listener; returns a function that removes it. */
export function on(root, type, selector, handler) {
    const listener = (event) => {
        const target = event.target.closest(selector);
        if (target && root.contains(target)) handler(event, target);
    };
    root.addEventListener(type, listener);
    return () => root.removeEventListener(type, listener);
}

export function debounce(fn, wait = 200) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}
