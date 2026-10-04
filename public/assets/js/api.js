export class ApiError extends Error {
    constructor(message, status = 0, code = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

async function request(method, url, body) {
    const headers = { 'X-Requested-With': 'DollarBaan', Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
        response = await fetch(url, {
            method,
            headers,
            credentials: 'same-origin',
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError('ارتباط با سرور دلاربان برقرار نشد؛ اتصال شبکه را بررسی کنید');
    }

    if (response.status === 401 && !url.startsWith('/api/auth/')) {
        window.location.href = '/login';
        throw new ApiError('نشست شما به پایان رسیده است', 401, 'unauthorized');
    }
    if (response.status === 204) return null;

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }
    if (!response.ok) {
        throw new ApiError((data && data.error) || `خطای سرور (${response.status})`, response.status, data && data.code);
    }
    return data;
}

export const api = {
    get: (url) => request('GET', url),
    post: (url, body = {}) => request('POST', url, body),
    put: (url, body = {}) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
};
