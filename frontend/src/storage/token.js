import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'user_jwt_token';
const REFRESH_TOKEN_KEY = 'user_jwt_refresh_token';
const USER_KEY = 'logged_in_user';

export const saveToken = async (token) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    console.error('Error saving token', e);
  }
};

export const getToken = async () => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.error('Error reading token', e);
    return null;
  }
};

export const saveRefreshToken = async (token) => {
  try {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch (e) {
    console.error('Error saving refresh token', e);
  }
};

export const getRefreshToken = async () => {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (e) {
    console.error('Error reading refresh token', e);
    return null;
  }
};

export const saveUser = async (user) => {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  } catch (e) {
    console.error('Error saving user', e);
  }
};

export const getUser = async () => {
  try {
    const value = await AsyncStorage.getItem(USER_KEY);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    console.error('Error reading user', e);
    return null;
  }
};

export const removeToken = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  } catch (e) {
    console.error('Error removing token', e);
  }
};