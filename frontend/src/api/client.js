import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getRefreshToken, getToken, removeToken, saveToken } from '../storage/token';

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }

  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost || Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:8000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://127.0.0.1:8000';
};

const BASE_URL = getBaseUrl();

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getToken();
  
  const isPublicEndpoint = config.url?.includes('/api/login/') || config.url?.includes('/api/register/');
  
  if (token && !isPublicEndpoint) {
    console.log('[API] Token found: ✓ Yes');
    config.headers.Authorization = `Bearer ${token}`;
    console.log('[API] Authorization header set:', `Bearer ${token.substring(0, 20)}...`);
  } else if (!isPublicEndpoint) {
    console.log('[API] ⚠️ WARNING: No token available for protected request:', config.url);
  }
  
  return config;
});

let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isRefreshRequest = originalRequest?.url?.includes('/api/token/refresh/');
    const isPublicEndpoint = originalRequest?.url?.includes('/api/login/') || originalRequest?.url?.includes('/api/register/');

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry || isRefreshRequest || isPublicEndpoint) {
      return Promise.reject(error);
    }

    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await removeToken();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      refreshPromise ||= axios.post(`${BASE_URL}/api/token/refresh/`, { refresh: refreshToken });
      const response = await refreshPromise;
      refreshPromise = null;

      const accessToken = response.data?.access;
      if (!accessToken) {
        throw new Error('No access token returned while refreshing session.');
      }

      await saveToken(accessToken);
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      refreshPromise = null;
      await removeToken();
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
