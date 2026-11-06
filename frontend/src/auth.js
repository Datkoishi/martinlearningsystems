export const csrfToken = () => document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('eduassess_csrf='))?.split('=').slice(1).join('=') || '';

export const csrfHeaders = () => ({ 'x-csrf-token': decodeURIComponent(csrfToken()) });

export const hasRole = (user, ...roles) => user?.roles?.some((role) => roles.includes(role)) === true;
