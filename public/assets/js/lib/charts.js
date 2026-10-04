import { raw } from './dom.js';
import { compactMoney, money, jalaliLong, faDigits } from '../format.js';
import { isoToJalali, MONTH_NAMES } from './jalali.js';

export function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let configured = false;

function configure() {
    if (configured || !window.Chart) return;
    const { Chart } = window;
    Chart.defaults.font.family = "'Vazirmatn', system-ui, -apple-system, 'Segoe UI', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.animation.duration = 350;
    configured = true;
}

/** Vertical hairline that follows the hovered date. */
const crosshair = {
    id: 'dbCrosshair',
    afterDatasetsDraw(chart) {
        const active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
        if (!active.length) return;
        const { x } = active[0].element;
        const { top, bottom } = chart.chartArea;
        const { ctx } = chart;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = cssVar('--border-strong');
        ctx.stroke();
        ctx.restore();
    },
};

/** HTML tooltip: value first, then series name, keyed by a short line in the series color. */
function htmlTooltip({ formatValue, formatTitle }) {
    return (context) => {
        const { chart, tooltip } = context;
        const host = chart.canvas.parentNode;
        let element = host.querySelector('.chart-tooltip');
        if (!element) {
            element = document.createElement('div');
            element.className = 'chart-tooltip';
            host.append(element);
        }
        const points = (tooltip.dataPoints || []).filter((point) => point.raw !== null && point.raw !== undefined);
        if (tooltip.opacity === 0 || !points.length) {
            element.style.opacity = '0';
            return;
        }
        element.replaceChildren();
        const title = document.createElement('div');
        title.className = 'chart-tooltip-title';
        title.textContent = formatTitle(points[0]);
        element.append(title);
        for (const point of points) {
            const row = document.createElement('div');
            row.className = 'chart-tooltip-row';
            const key = document.createElement('span');
            key.className = 'chart-tooltip-key';
            key.style.background = point.dataset.keyColor || point.dataset.borderColor;
            const value = document.createElement('strong');
            value.textContent = formatValue(point);
            const label = document.createElement('span');
            label.textContent = point.dataset.label;
            row.append(key, value, label);
            element.append(row);
        }
        element.style.opacity = '1';
        const width = element.offsetWidth;
        const hostWidth = host.clientWidth;
        let left = tooltip.caretX + 14;
        if (left + width > hostWidth - 4) left = tooltip.caretX - width - 14;
        element.style.left = `${Math.max(4, left)}px`;
    };
}

/** Axis label for a date depending on the visible span. */
export function dateTick(iso, spanDays) {
    const { jy, jm, jd } = isoToJalali(iso);
    if (spanDays > 400) return faDigits(`${MONTH_NAMES[jm - 1]} ${String(jy).slice(2)}`);
    return faDigits(`${jd} ${MONTH_NAMES[jm - 1]}`);
}

function spanOf(dates) {
    if (dates.length < 2) return 0;
    return (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000;
}

/**
 * Line chart over dates.
 * series: [{ label, values, color, fill, stepped, endDot, type, pointStyle, keyColor }]
 */
export function lineChart(canvas, { dates, series, formatValue = (value) => money(value), formatAxis = (value) => compactMoney(value) }) {
    configure();
    const { Chart } = window;
    if (!Chart) return null;
    const surface = cssVar('--surface');
    const span = spanOf(dates);

    const datasets = series.map((item, index) => {
        if (item.type === 'markers') {
            return {
                label: item.label,
                data: item.values,
                showLine: false,
                borderColor: item.color,
                backgroundColor: item.color,
                keyColor: item.color,
                pointRadius: 5,
                pointHoverRadius: 6,
                pointBorderColor: surface,
                pointBorderWidth: 2,
                pointHitRadius: 12,
                pointStyle: item.pointStyle || 'circle',
                order: -1,
            };
        }
        const last = item.values.length - 1;
        return {
            label: item.label,
            data: item.values,
            borderColor: item.color,
            backgroundColor: item.fill || 'transparent',
            fill: item.fill ? 'origin' : false,
            borderWidth: 2,
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            tension: item.stepped ? 0 : 0.25,
            stepped: item.stepped ? 'before' : false,
            pointRadius: (ctx) => (item.endDot && ctx.dataIndex === last ? 4 : 0),
            pointHoverRadius: 4,
            pointBackgroundColor: item.color,
            pointBorderColor: surface,
            pointBorderWidth: 2,
            pointHitRadius: 10,
            spanGaps: true,
            order: index,
        };
    });

    return new Chart(canvas, {
        type: 'line',
        data: { labels: dates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            normalized: true,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 6, left: 6, right: 2 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: htmlTooltip({
                        formatValue: (point) => formatValue(point.raw, point),
                        formatTitle: (point) => jalaliLong(dates[point.dataIndex]),
                    }),
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: cssVar('--chart-axis'),
                        maxRotation: 0,
                        autoSkip: true,
                        autoSkipPadding: 24,
                        maxTicksLimit: 6,
                        callback(value) {
                            return dateTick(this.getLabelForValue(value), span);
                        },
                    },
                },
                y: {
                    position: 'right',
                    grace: '6%',
                    grid: { color: cssVar('--chart-grid'), drawTicks: false },
                    border: { display: false },
                    ticks: { color: cssVar('--chart-axis'), maxTicksLimit: 5, padding: 10, callback: (value) => formatAxis(value) },
                },
            },
        },
        plugins: [crosshair],
    });
}

/** Tiny trend line; the newest point gets the accent dot. */
export function sparkline(values, { width = 88, height = 32 } = {}) {
    if (!values || values.length < 2) return raw('<svg class="spark" aria-hidden="true"></svg>');
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 4;
    const points = values.map((value, index) => [
        pad + (index / (values.length - 1)) * (width - pad * 2),
        pad + (1 - (value - min) / range) * (height - pad * 2),
    ]);
    const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const [lastX, lastY] = points[points.length - 1];
    return raw(`<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${path}"></polyline><circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3"></circle></svg>`);
}

