import { html, icon } from '../lib/dom.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { KIND_LABELS, currencyLabel, toDisplay, fromDisplay, money } from '../format.js';
import { openDialog, withBusy } from './dialog.js';
import { bindNumberInput } from './number-input.js';
import { notify } from './toast.js';

const MONEY_KINDS = new Set(['cash', 'deposit']);

/** Create or edit a manually priced asset. Resolves with the saved asset or null. */
export function openCustomAssetForm({ asset = null, name = '' } = {}) {
    return new Promise((resolve) => {
        const editing = Boolean(asset);
        const kinds = store.customKinds.length ? store.customKinds : Object.keys(KIND_LABELS);
        const instance = openDialog({
            title: editing ? 'ویرایش دارایی دستی' : 'تعریف دارایی دستی',
            body: html`
                <form class="form-grid" novalidate>
                    <p class="full field-hint">
                        برای دارایی‌هایی که قیمت آنلاین ندارند (ملک، خودرو، سپرده بانکی، سهام و…) قیمت را خودتان وارد و هر وقت لازم بود به‌روز کنید.
                    </p>
                    <div class="field full">
                        <label for="ca-name">نام دارایی</label>
                        <input id="ca-name" class="input" maxlength="80" required placeholder="مثلاً آپارتمان ونک یا سپرده بانک ملت">
                    </div>
                    <div class="field">
                        <label for="ca-kind">نوع</label>
                        <select id="ca-kind" class="select">
                            ${kinds.map((kind) => html`<option value="${kind}">${KIND_LABELS[kind] || kind}</option>`)}
                        </select>
                    </div>
                    <div class="field">
                        <label for="ca-unit">واحد شمارش</label>
                        <input id="ca-unit" class="input" maxlength="24" placeholder="مثلاً واحد، متر، دستگاه">
                    </div>
                    <div class="field full">
                        <label for="ca-price">قیمت هر واحد</label>
                        <div class="input-group">
                            <input id="ca-price" class="input" placeholder="۰">
                            <span class="addon">${currencyLabel()}</span>
                        </div>
                        <span class="field-hint" data-kind-hint></span>
                    </div>
                    <div class="full field-error" data-error role="alert"></div>
                </form>`,
            footer: html`
                <button type="button" class="btn btn-ghost" data-close>انصراف</button>
                <button type="button" class="btn btn-primary" data-save>${icon('check')}<span>${editing ? 'ذخیره تغییرات' : 'افزودن دارایی'}</span></button>`,
            onClose: (result) => resolve(result || null),
        });

        const form = instance.body.querySelector('form');
        const nameInput = form.querySelector('#ca-name');
        const kindSelect = form.querySelector('#ca-kind');
        const unitInput = form.querySelector('#ca-unit');
        const price = bindNumberInput(form.querySelector('#ca-price'));
        const hint = form.querySelector('[data-kind-hint]');
        const error = form.querySelector('[data-error]');
        let unitTouched = editing;
        let priceTouched = editing;

        function applyKind() {
            const moneyLike = MONEY_KINDS.has(kindSelect.value);
            hint.textContent = moneyLike
                ? `برای پول نقد یا سپرده، واحد را «تومان» و قیمت را ${money(1)} بگذارید تا مقدار همان مبلغ به تومان باشد.`
                : 'ارزش فعلی یک واحد از این دارایی را وارد کنید.';
            if (moneyLike) {
                if (!unitTouched) unitInput.value = 'تومان';
                if (!priceTouched) price.value = toDisplay(1);
            } else {
                if (!unitTouched && unitInput.value === 'تومان') unitInput.value = '';
                if (!priceTouched && price.value === toDisplay(1)) price.value = null;
            }
        }

        nameInput.value = editing ? asset.name : name;
        kindSelect.value = editing && asset.kind ? asset.kind : 'other';
        unitInput.value = editing && asset.unit && asset.unit !== 'unit' ? asset.unit : '';
        if (editing) price.value = toDisplay(asset.price);
        applyKind();

        unitInput.addEventListener('input', () => { unitTouched = true; });
        form.querySelector('#ca-price').addEventListener('input', () => { priceTouched = true; });
        kindSelect.addEventListener('change', applyKind);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            instance.foot.querySelector('[data-save]').click();
        });
        nameInput.focus();

        const saveButton = instance.foot.querySelector('[data-save]');
        saveButton.addEventListener('click', () => withBusy(saveButton, async () => {
            error.textContent = '';
            const payload = {
                name: nameInput.value.trim(),
                kind: kindSelect.value,
                unit: unitInput.value.trim(),
                price: price.value === null ? null : fromDisplay(price.value),
            };
            if (!payload.name) {
                error.textContent = 'نام دارایی را وارد کنید';
                nameInput.focus();
                return;
            }
            if (!(payload.price > 0)) {
                error.textContent = 'قیمت هر واحد را وارد کنید';
                return;
            }
            try {
                const saved = editing
                    ? await api.put(`/api/custom-assets/${encodeURIComponent(asset.symbol)}`, payload)
                    : await api.post('/api/custom-assets', payload);
                await store.loadAssets({ force: true });
                notify.success(editing ? 'دارایی به‌روز شد' : 'دارایی دستی اضافه شد');
                store.dataChanged();
                instance.close(saved);
            } catch (failure) {
                error.textContent = failure.message;
            }
        }));
    });
}
