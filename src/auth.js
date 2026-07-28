export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
export const AUTH_TOKEN_KEY = 'nextgtools_auth_token';
export const ADMIN_TOKEN_KEY = 'nextgtools_admin_token';

export const authHeaders = () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const adminHeaders = () => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { 'X-Admin-Token': token } : {};
};
