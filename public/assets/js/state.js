import { api } from './api.js';
import { setDisplayUnit } from './format.js';

const listeners = new Map();

export const store = {
    version: null,
    username: null,
    defaultPassword: false,
    preferences: null,
    providers: [],
    categories: [],
    customKinds: [],
    status: null,
    assets: [],
    assetMap: new Map(),
    assetsLoadedAt: 0,
    portfolio: null,

    on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event).delete(handler);
    },

    emit(event, payload) {
        for (const handler of [...(listeners.get(event) || [])]) {
            try {
                handler(payload);
            } catch (error) {
                console.error(error);
            }
        }
    },

    async bootstrap() {
        const data = await api.get('/api/bootstrap');
        this.version = data.version;
        this.username = data.username;
        this.defaultPassword = data.defaultPassword;
        this.providers = data.providers;
        this.categories = data.categories;
        this.customKinds = data.customKinds;
        this.setPreferences(data.preferences);
        this.setStatus(data.status);
    },

    setPreferences(preferences) {
        const previousUnit = this.preferences && this.preferences.displayUnit;
        this.preferences = preferences;
        setDisplayUnit(preferences.displayUnit);
        this.emit('preferences', preferences);
        if (previousUnit && previousUnit !== preferences.displayUnit) this.emit('unit', preferences.displayUnit);
    },

    setStatus(status) {
        const previous = this.status;
        this.status = status;
        this.emit('status', status);
        if (previous && status.lastSuccessAt && previous.lastSuccessAt !== status.lastSuccessAt) {
            this.assetsLoadedAt = 0;
            this.emit('synced', status);
        }
    },

    async refreshStatus() {
        this.setStatus(await api.get('/api/status'));
        return this.status;
    },

    async loadAssets({ force = false } = {}) {
        if (!force && this.assets.length && Date.now() - this.assetsLoadedAt < 60 * 1000) return this.assets;
        const list = await api.get('/api/assets');
        this.assets = list;
        this.assetMap = new Map(list.map((asset) => [asset.symbol, asset]));
        this.assetsLoadedAt = Date.now();
        this.emit('assets', list);
        return list;
    },

    asset(symbol) {
        return this.assetMap.get(symbol) || null;
    },

    async loadPortfolio() {
        this.portfolio = await api.get('/api/portfolio');
        return this.portfolio;
    },

    holding(symbol) {
        const holdings = this.portfolio ? this.portfolio.holdings : [];
        return holdings.find((holding) => holding.symbol === symbol) || null;
    },

    async savePreferences(patch) {
        const result = await api.put('/api/settings', patch);
        this.setPreferences(result.preferences);
        this.setStatus(result.status);
        return result;
    },

    isWatched(symbol) {
        return Boolean(this.preferences && this.preferences.watchlist.includes(symbol));
    },

    async toggleWatch(symbol) {
        const list = [...this.preferences.watchlist];
        const index = list.indexOf(symbol);
        if (index === -1) list.push(symbol);
        else list.splice(index, 1);
        await this.savePreferences({ watchlist: list });
        return index === -1;
    },

    /** Call after transactions or custom assets change. */
    dataChanged() {
        this.assetsLoadedAt = 0;
        this.emit('data-changed');
    },
};
