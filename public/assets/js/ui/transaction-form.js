import { html, icon, setHtml } from '../lib/dom.js';
import { api } from '../api.js';
import { store } from '../state.js';
import {
    money, quantity as formatQuantity, unitLabel, currencyLabel, toDisplay, fromDisplay, jalaliDate, todayIso,
} from '../format.js';
import { openDialog, confirmDialog, withBusy } from './dialog.js';
import { createAssetPicker } from './asset-picker.js';
import { createDatePicker } from './datepicker.js';
import { bindNumberInput } from './number-input.js';
import { openCustomAssetForm } from './custom-asset-form.js';
import { notify } from './toast.js';

const EPSILON = 1e-9;

/**
 * Add or edit a buy/sell transaction. Resolves true when something was saved or deleted.
 */
export async function openTransactionForm({ transaction = null, symbol = null, side = 'buy' } = {}) {
    try {
        await Promise.all([store.loadAssets(), store.loadPortfolio()]);
    } catch (error) {
        notify.error(error.message);
        return false;
    }

    return new Promise((resolve) => {
        const editing = Boolean(transaction);
        const state = {
            side: editing ? transaction.side : side,
            symbol: editing ? transaction.symbol : symbol,
            mode: 'quantity',
            priceTouched: editing,
            market: null,
            request: 0,
        };

        const instance = openDialog({
            title: editing ? 'ویرایش تراکنش' : 'ثبت تراکنش جدید',
            body: html`
                <form class="form-grid" novalidate autocomplete="off">
                    <div class="full segmented block side" role="group" aria-label="نوع تراکنش" data-side>
                        <button type="button" data-value="buy">${icon('arrow-down-left', 'icon-sm')}<span>خرید</span></button>
                        <button type="button" data-value="sell">${icon('arrow-up-right', 'icon-sm')}<span>فروش</span></button>
                    </div>
                    <div class="field full">
                        <span class="field-label">دارایی</span>
                        <div data-picker></div>
                    </div>
                    <div class="field">
                        <span class="field-label">تاریخ (شمسی)</span>
                        <div data-date></div>
                    </div>
                    <div class="field">
                        <span class="field-label">ورود بر اساس</span>
                        <div class="segmented block" role="group" aria-label="روش ورود" data-mode>
                            <button type="button" data-value="quantity">مقدار</button>
                            <button type="button" data-value="amount">مبلغ کل</button>
                        </div>
                    </div>
                    <div class="field" data-quantity-field>
                        <label for="tx-quantity">مقدار</label>
                        <div class="input-group">
                            <input id="tx-quantity" class="input" placeholder="۰">
                            <span class="addon" data-unit>واحد</span>
                        </div>
                        <span class="field-hint" data-holding></span>
                    </div>
                    <div class="field" data-amount-field hidden>
                        <label for="tx-amount">مبلغ کل</label>
                        <div class="input-group">
                            <input id="tx-amount" class="input" placeholder="۰">
                            <span class="addon">${currencyLabel()}</span>
                        </div>
                    </div>
                    <div class="field">
                        <label for="tx-price">قیمت هر واحد</label>
                        <div class="input-group">
                            <input id="tx-price" class="input" placeholder="۰">
                            <span class="addon">${currencyLabel()}</span>
                        </div>
                        <div class="price-hint" data-price-hint aria-live="polite"></div>
                    </div>
                    <div class="field">
                        <label for="tx-fee">کارمزد <span class="muted">(اختیاری)</span></label>
                        <div class="input-group">
                            <input id="tx-fee" class="input" placeholder="۰">
                            <span class="addon">${currencyLabel()}</span>
                        </div>
                    </div>
                    <div class="field">
                        <label for="tx-note">یادداشت <span class="muted">(اختیاری)</span></label>
                        <input id="tx-note" class="input" maxlength="500" placeholder="مثلاً خرید از صرافی">
                    </div>
                    <div class="full tx-summary" data-summary></div>
                    <div class="full field-error" data-error role="alert"></div>
                    <button type="submit" hidden></button>
                </form>`,
            footer: html`
                ${editing ? html`<button type="button" class="btn btn-danger-ghost" data-delete>${icon('trash-2')}<span>حذف</span></button>` : ''}
                <span class="grow"></span>
                <button type="button" class="btn btn-ghost" data-close>انصراف</button>
                <button type="button" class="btn btn-primary" data-save>${icon('check')}<span data-save-label>${editing ? 'ذخیره تغییرات' : 'ثبت خرید'}</span></button>`,
            onClose: (result) => resolve(Boolean(result)),
        });

        const form = instance.body.querySelector('form');
        const $ = (selector) => form.querySelector(selector);
        const errorBox = $('[data-error]');
        const priceHint = $('[data-price-hint]');
        const summary = $('[data-summary]');
        const holdingHint = $('[data-holding]');

        const quantity = bindNumberInput($('#tx-quantity'), { onChange: update });
        const amount = bindNumberInput($('#tx-amount'), { onChange: update });
        const price = bindNumberInput($('#tx-price'), {
            onChange: () => {
                state.priceTouched = true;
                renderPriceHint();
                update();
            },
        });
        const fee = bindNumberInput($('#tx-fee'), { onChange: update });
        const note = $('#tx-note');

        const picker = createAssetPicker($('[data-picker]'), {
            value: state.symbol,
            heldFirst: state.side === 'sell',
            onChange: (next) => {
                state.symbol = next;
                if (!editing) state.priceTouched = false;
                refreshUnit();
                loadMarketPrice();
                update();
            },
            onCreateCustom: (name) => openCustomAssetForm({ name }),
        });

        const date = createDatePicker($('[data-date]'), {
            value: editing ? transaction.date : todayIso(),
            onChange: () => {
                loadMarketPrice();
                update();
            },
        });

        function setSegment(container, value) {
            for (const button of container.querySelectorAll('button')) {
                button.setAttribute('aria-pressed', String(button.dataset.value === value));
            }
        }

        function setSide(value) {
            state.side = value;
            setSegment($('[data-side]'), value);
            if (!editing) instance.foot.querySelector('[data-save-label]').textContent = value === 'sell' ? 'ثبت فروش' : 'ثبت خرید';
            update();
        }

        function setMode(value) {
            const total = currentTotal();
            const units = currentQuantity();
            state.mode = value;
            setSegment($('[data-mode]'), value);
            $('[data-quantity-field]').hidden = value !== 'quantity';
            $('[data-amount-field]').hidden = value !== 'amount';
            if (value === 'amount' && total) amount.value = toDisplay(total);
            if (value === 'quantity' && units) quantity.value = units;
            update();
        }

        function unitPrice() {
            return price.value === null ? null : fromDisplay(price.value);
        }

        function currentQuantity() {
            if (state.mode === 'quantity') return quantity.value;
            const total = amount.value === null ? null : fromDisplay(amount.value);
            const perUnit = unitPrice();
            return total > 0 && perUnit > 0 ? total / perUnit : null;
        }

        function currentTotal() {
            if (state.mode === 'amount') return amount.value === null ? null : fromDisplay(amount.value);
            const units = quantity.value;
            const perUnit = unitPrice();
            return units > 0 && perUnit > 0 ? units * perUnit : null;
        }

        function refreshUnit() {
            const asset = store.asset(state.symbol);
            $('[data-unit]').textContent = asset ? unitLabel(asset.unit) : 'واحد';
        }

        function available() {
            const holding = store.holding(state.symbol);
            let units = holding ? holding.quantity : 0;
            // When editing a sale, its own quantity is part of what can be sold.
            if (editing && transaction.symbol === state.symbol) {
                units += transaction.side === 'sell' ? transaction.quantity : -transaction.quantity;
            }
            return Math.max(0, units);
        }

        function renderPriceHint() {
            const market = state.market;
            if (!state.symbol) {
                setHtml(priceHint, '');
                return;
            }
            if (market === 'loading') {
                setHtml(priceHint, html`${icon('refresh-cw', 'icon-sm spin')}<span>در حال دریافت قیمت بازار…</span>`);
                return;
            }
            if (!market || !(market.price > 0)) {
                setHtml(priceHint, html`<span>قیمت بازار برای این تاریخ پیدا نشد؛ قیمت را خودتان وارد کنید.</span>`);
                return;
            }
            const when = market.date === todayIso() ? 'امروز' : market.exact ? 'در این روز' : `در ${jalaliDate(market.date)}`;
            const differs = Math.abs((unitPrice() || 0) - market.price) > market.price * 1e-6;
            setHtml(priceHint, html`
                <span>قیمت بازار ${when}: <strong>${money(market.price)}</strong></span>
                ${differs ? html`<button type="button" data-apply-price>استفاده از این قیمت</button>` : ''}`);
        }

        async function loadMarketPrice() {
            if (!state.symbol || !date.value) return;
            const request = state.request + 1;
            state.request = request;
            state.market = 'loading';
            renderPriceHint();
            try {
                const result = await api.get(`/api/assets/${encodeURIComponent(state.symbol)}/price?date=${date.value}`);
                if (request !== state.request) return;
                state.market = result;
                if (!state.priceTouched && result.price > 0) price.value = toDisplay(result.price);
            } catch {
                if (request !== state.request) return;
                state.market = null;
            }
            renderPriceHint();
            update();
        }

        function update() {
            const asset = store.asset(state.symbol);
            const units = currentQuantity();
            const total = currentTotal();
            const feeValue = fee.value === null ? 0 : fromDisplay(fee.value);
            const unit = asset ? unitLabel(asset.unit) : 'واحد';

            if (state.side === 'sell' && state.symbol) {
                const free = available();
                setHtml(holdingHint, free > 0
                    ? html`موجودی فعلی: ${formatQuantity(free)} ${unit} · <button type="button" class="link-btn" data-sell-all>فروش همه</button>`
                    : html`<span class="neg">در حال حاضر از این دارایی موجودی ندارید.</span>`);
            } else {
                setHtml(holdingHint, '');
            }

            const rows = [];
            if (state.mode === 'amount') rows.push(html`<div class="row"><span>مقدار</span><strong>${units ? `${formatQuantity(units)} ${unit}` : '—'}</strong></div>`);
            else rows.push(html`<div class="row"><span>مبلغ معامله</span><strong>${money(total)}</strong></div>`);
            if (feeValue > 0 && total) {
                const label = state.side === 'buy' ? 'هزینه کل با کارمزد' : 'دریافتی پس از کارمزد';
                rows.push(html`<div class="row"><span>${label}</span><strong>${money(state.side === 'buy' ? total + feeValue : total - feeValue)}</strong></div>`);
            }
            if (asset && asset.price > 0 && units > 0) {
                rows.push(html`<div class="row"><span>ارزش به قیمت امروز</span><strong>${money(units * asset.price)}</strong></div>`);
            }
            if (state.side === 'sell' && units > available() + EPSILON && state.symbol) {
                rows.push(html`<div class="row neg"><span class="with-icon">${icon('triangle-alert', 'icon-sm')}مقدار فروش از موجودی فعلی بیشتر است.</span></div>`);
            }
            setHtml(summary, rows);
        }

        form.addEventListener('click', (event) => {
            if (event.target.closest('[data-apply-price]') && state.market && state.market.price > 0) {
                price.value = toDisplay(state.market.price);
                state.priceTouched = false;
                renderPriceHint();
                update();
            }
            if (event.target.closest('[data-sell-all]')) {
                const free = available();
                setMode('quantity');
                quantity.value = free;
                update();
            }
        });
        $('[data-side]').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (button) setSide(button.dataset.value);
        });
        $('[data-mode]').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (button) setMode(button.dataset.value);
        });

        if (editing) {
            quantity.value = transaction.quantity;
            price.value = toDisplay(transaction.unitPrice);
            fee.value = transaction.fee ? toDisplay(transaction.fee) : null;
            note.value = transaction.note || '';
        }
        setSide(state.side);
        setSegment($('[data-mode]'), state.mode);
        refreshUnit();
        update();
        if (state.symbol) loadMarketPrice();
        else setTimeout(() => picker.open(), 50);

        const saveButton = instance.foot.querySelector('[data-save]');
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            saveButton.click();
        });

        saveButton.addEventListener('click', () => withBusy(saveButton, async () => {
            errorBox.textContent = '';
            const units = currentQuantity();
            const perUnit = unitPrice();
            const problems = [];
            if (!state.symbol) problems.push('دارایی را انتخاب کنید');
            if (!date.isValid()) problems.push('تاریخ معتبر نیست');
            if (!(units > 0)) problems.push(state.mode === 'amount' ? 'مبلغ کل را وارد کنید' : 'مقدار را وارد کنید');
            if (!(perUnit > 0)) problems.push('قیمت هر واحد را وارد کنید');
            if (problems.length) {
                errorBox.textContent = problems.join('، ');
                return;
            }
            const payload = {
                symbol: state.symbol,
                side: state.side,
                date: date.value,
                quantity: units,
                unitPrice: perUnit,
                fee: fee.value === null ? 0 : fromDisplay(fee.value),
                note: note.value.trim(),
            };
            try {
                if (editing) await api.put(`/api/transactions/${transaction.id}`, payload);
                else await api.post('/api/transactions', payload);
                notify.success(editing ? 'تراکنش ویرایش شد' : 'تراکنش ثبت شد');
                store.dataChanged();
                instance.close(true);
            } catch (error) {
                errorBox.textContent = error.message;
            }
        }));

        const deleteButton = instance.foot.querySelector('[data-delete]');
        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                const confirmed = await confirmDialog({
                    title: 'حذف تراکنش',
                    message: 'این تراکنش برای همیشه حذف می‌شود. ادامه می‌دهید؟',
                    confirmText: 'حذف شود',
                    danger: true,
                });
                if (!confirmed) return;
                try {
                    await api.del(`/api/transactions/${transaction.id}`);
                    notify.success('تراکنش حذف شد');
                    store.dataChanged();
                    instance.close(true);
                } catch (error) {
                    errorBox.textContent = error.message;
                }
            });
        }
    });
}
