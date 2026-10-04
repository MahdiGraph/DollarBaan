import { api } from './api.js';
import { icon, setHtml } from './lib/dom.js';
import { effectiveTheme, toggleTheme } from './ui/theme.js';
import { store } from './state.js';

const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');
const errorText = document.getElementById('loginErrorText');
const button = document.getElementById('loginBtn');
const themeButton = document.getElementById('themeBtn');
const toggle = document.getElementById('togglePassword');

function showError(message) {
    errorText.textContent = message;
    errorBox.hidden = false;
}

function renderThemeIcon() {
    setHtml(themeButton, icon(effectiveTheme() === 'dark' ? 'sun' : 'moon'));
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) {
        showError('نام کاربری و رمز عبور را وارد کنید');
        return;
    }
    button.disabled = true;
    try {
        await api.post('/api/auth/login', { username, password });
        window.location.replace('/');
    } catch (error) {
        showError(error.message);
        button.disabled = false;
        form.password.select();
    }
});

toggle.addEventListener('click', () => {
    const visible = form.password.type === 'text';
    form.password.type = visible ? 'password' : 'text';
    toggle.setAttribute('aria-label', visible ? 'نمایش رمز عبور' : 'پنهان کردن رمز عبور');
    setHtml(toggle, icon(visible ? 'eye' : 'eye-off', 'icon-sm'));
});

themeButton.addEventListener('click', toggleTheme);
store.on('theme', renderThemeIcon);
renderThemeIcon();
