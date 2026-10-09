// Pure portfolio math. Amounts are toman; dates are YYYY-MM-DD strings.
// Cost basis uses the average-cost method: a sale removes cost at the running
// average price and the difference to the sale proceeds is realized profit.

import { addDays, diffDays } from './dates.js';

export const EPSILON = 1e-9;

function timeOf(tx) {
    const value = tx.createdAt instanceof Date ? tx.createdAt.getTime() : Date.parse(tx.createdAt);
    return Number.isFinite(value) ? value : 0;
}

/** Chronological order; on the same day buys come first so intraday round trips work. */
export function sortTransactions(transactions) {
    return [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
        || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1)
        || timeOf(a) - timeOf(b));
}

function emptyState() {
    return {
        quantity: 0,
        cost: 0,
        realized: 0,
        bought: 0,
        boughtQuantity: 0,
        proceeds: 0,
        soldQuantity: 0,
        fees: 0,
        count: 0,
        firstDate: null,
        lastDate: null,
        lastPrice: null,
    };
}

function isOversell(quantity, available) {
    return quantity > available + Math.max(EPSILON, available * 1e-9);
}

/** Applies one transaction to a holding state (mutates and returns it). */
function apply(state, tx) {
    const quantity = Number(tx.quantity);
    const price = Number(tx.unitPrice);
    const fee = Number(tx.fee) || 0;
    state.count += 1;
    state.fees += fee;
    state.lastPrice = price;
    if (!state.firstDate) state.firstDate = tx.date;
    state.lastDate = tx.date;

    if (tx.side === 'sell') {
        const sold = Math.min(quantity, state.quantity);
        const average = state.quantity > 0 ? state.cost / state.quantity : 0;
        const removedCost = average * sold;
        state.cost -= removedCost;
        state.quantity -= sold;
        state.realized += sold * price - fee - removedCost;
        state.proceeds += sold * price - fee;
        state.soldQuantity += sold;
        if (state.quantity <= EPSILON) {
            state.quantity = 0;
            state.cost = 0;
        }
    } else {
        state.quantity += quantity;
        state.cost += quantity * price + fee;
        state.bought += quantity * price + fee;
        state.boughtQuantity += quantity;
    }
    return state;
}

export function replay(transactions) {
    const states = new Map();
    for (const tx of sortTransactions(transactions)) {
        if (!states.has(tx.symbol)) states.set(tx.symbol, emptyState());
        apply(states.get(tx.symbol), tx);
    }
    return states;
}

/** First sale that sells more than was held at that point, or null. */
export function findOversell(transactions) {
    const held = new Map();
    for (const tx of sortTransactions(transactions)) {
        const available = held.get(tx.symbol) || 0;
        const quantity = Number(tx.quantity);
        if (tx.side === 'sell') {
            if (isOversell(quantity, available)) {
                return { symbol: tx.symbol, date: tx.date, available, requested: quantity, id: tx.id };
            }
            held.set(tx.symbol, Math.max(0, available - quantity));
        } else {
            held.set(tx.symbol, available + quantity);
        }
    }
    return null;
}

function pct(part, whole) {
    return whole > 0 ? (part / whole) * 100 : null;
}

/**
 * Holdings and totals at current prices.
 * quotes: Map(symbol -> { price, prevClose }) in toman; missing quotes fall back to
 * the latest transaction price so a holding never silently counts as zero.
 */
export function summarize(transactions, quotes = new Map()) {
    const holdings = [];
    const closed = [];
    const totals = {
        value: 0,
        cost: 0,
        unrealized: 0,
        realized: 0,
        invested: 0,
        dayChange: 0,
        fees: 0,
    };

    for (const [symbol, state] of replay(transactions)) {
        const quote = quotes.get(symbol) || null;
        const hasQuote = Boolean(quote && quote.price > 0);
        const price = hasQuote ? quote.price : state.lastPrice;
        const prevClose = hasQuote && quote.prevClose > 0 ? quote.prevClose : null;
        const value = state.quantity * price;
        const unrealized = value - state.cost;
        const dayChange = prevClose ? state.quantity * (price - prevClose) : 0;
        const row = {
            symbol,
            quantity: state.quantity,
            avgCost: state.quantity > 0 ? state.cost / state.quantity : null,
            cost: state.cost,
            price,
            value,
            unrealized,
            unrealizedPct: pct(unrealized, state.cost),
            realized: state.realized,
            invested: state.bought,
            proceeds: state.proceeds,
            pnl: unrealized + state.realized,
            pnlPct: pct(unrealized + state.realized, state.bought),
            dayChange,
            dayChangePct: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
            fees: state.fees,
            count: state.count,
            firstDate: state.firstDate,
            lastDate: state.lastDate,
            hasQuote,
        };

        totals.realized += state.realized;
        totals.invested += state.bought;
        totals.fees += state.fees;
        if (state.quantity > 0) {
            totals.value += value;
            totals.cost += state.cost;
            totals.dayChange += dayChange;
            holdings.push(row);
        } else {
            closed.push(row);
        }
    }

    totals.unrealized = totals.value - totals.cost;
    totals.unrealizedPct = pct(totals.unrealized, totals.cost);
    totals.pnl = totals.unrealized + totals.realized;
    totals.pnlPct = pct(totals.pnl, totals.invested);
    totals.dayChangePct = pct(totals.dayChange, totals.value - totals.dayChange);
    totals.holdings = holdings.length;

    for (const row of holdings) row.weight = totals.value > 0 ? (row.value / totals.value) * 100 : 0;
    holdings.sort((a, b) => b.value - a.value);
    closed.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
    return { totals, holdings, closed };
}

/** Sample dates from start to end (inclusive), evenly spaced backwards from end. */
export function sampleDates(start, end, maxPoints = 160) {
    if (!start || !end || start > end) return end ? [end] : [];
    const span = diffDays(start, end);
    const step = Math.max(1, Math.ceil(span / Math.max(1, maxPoints - 1)));
    const dates = [];
    for (let date = end; date >= start; date = addDays(date, -step)) dates.push(date);
    if (dates[dates.length - 1] !== start && dates.length < maxPoints) dates.push(start);
    return dates.reverse();
}

/** Latest point at or before `date` in a date-sorted series, moving a cursor forward. */
function makeCursor(series) {
    let index = -1;
    return (date) => {
        while (index + 1 < series.length && series[index + 1].date <= date) index += 1;
        return index >= 0 ? series[index] : null;
    };
}

/**
 * Portfolio value, invested capital (cost basis of open positions) and cumulative
 * realized profit on each date.
 * seriesBySymbol: Map(symbol -> [{ date, close }]) sorted by date, toman.
 * currentPrices: Map(symbol -> price) used for `today`.
 */
export function buildTimeline({ transactions, seriesBySymbol = new Map(), currentPrices = new Map(), dates, today }) {
    const sorted = sortTransactions(transactions);
    const states = new Map();
    const lastTrade = new Map();
    const cursors = new Map();
    const points = [];
    let next = 0;

    for (const date of dates) {
        while (next < sorted.length && sorted[next].date <= date) {
            const tx = sorted[next];
            if (!states.has(tx.symbol)) states.set(tx.symbol, emptyState());
            apply(states.get(tx.symbol), tx);
            lastTrade.set(tx.symbol, { date: tx.date, close: Number(tx.unitPrice) });
            next += 1;
        }

        let value = 0;
        let invested = 0;
        let realized = 0;
        for (const [symbol, state] of states) {
            realized += state.realized;
            if (state.quantity <= 0) continue;
            invested += state.cost;
            let price = null;
            if (date === today && currentPrices.get(symbol) > 0) {
                price = currentPrices.get(symbol);
            } else {
                if (!cursors.has(symbol)) cursors.set(symbol, makeCursor(seriesBySymbol.get(symbol) || []));
                const market = cursors.get(symbol)(date);
                const trade = lastTrade.get(symbol);
                // Use whichever observation is newer: the market close or the user's own trade.
                price = market && (!trade || market.date >= trade.date) ? market.close : trade.close;
            }
            value += state.quantity * price;
        }
        points.push({ date, value, invested, realized });
    }
    return points;
}

/**
 * Profit over a timeline window: change of (value − cost + realized) between the
 * first and last point, relative to the starting value plus money added meanwhile.
 */
export function windowPerformance(points, transactions) {
    if (points.length < 2) return null;
    const first = points[0];
    const last = points[points.length - 1];
    const totalAt = (point) => point.value - point.invested + point.realized;
    const pnl = totalAt(last) - totalAt(first);
    let inflow = 0;
    for (const tx of transactions) {
        if (tx.side === 'buy' && tx.date > first.date && tx.date <= last.date) {
            inflow += Number(tx.quantity) * Number(tx.unitPrice) + (Number(tx.fee) || 0);
        }
    }
    const base = first.value + inflow;
    return { pnl, pct: base > 0 ? (pnl / base) * 100 : null, from: first.date, to: last.date };
}

/** Latest close at or before `date` (binary search). */
export function closeAsOf(series, date) {
    let lo = 0;
    let hi = series.length - 1;
    let found = null;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (series[mid].date <= date) {
            found = series[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

/** Converts a native-currency series to toman with a rate series (as-of join). */
export function convertSeries(series, rateSeries) {
    if (!rateSeries) return series;
    const out = [];
    const rateAt = makeCursor(rateSeries);
    for (const point of series) {
        const rate = rateAt(point.date);
        if (rate) out.push({ date: point.date, close: point.close * rate.close });
    }
    return out;
}

/** Merges two date-sorted series; `primary` wins on equal dates. */
export function mergeSeries(secondary, primary) {
    if (!secondary.length) return primary;
    if (!primary.length) return secondary;
    const byDate = new Map(secondary.map((point) => [point.date, point]));
    for (const point of primary) byDate.set(point.date, point);
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
