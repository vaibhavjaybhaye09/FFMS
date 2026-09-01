import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import apiClient from '../src/api/client';
import { saveRefreshToken, saveToken, saveUser } from '../src/storage/token';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('DRIVER');
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({ visible: false, title: '', message: '', type: 'error' });
  const router = useRouter();

  const normalizeMobileNumber = (value) => value.replace(/\s+/g, '').replace(/[^0-9]/g, '');

  const handleAuth = async () => {
    const cleanMobileNumber = normalizeMobileNumber(mobileNumber);

    if (!cleanMobileNumber || !password || (!isLogin && !firstName)) {
      setPopup({ visible: true, title: 'Missing fields', message: 'Please complete all required fields.', type: 'error' });
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const response = await apiClient.post('/api/login/', {
          mobile_number: cleanMobileNumber,
          password,
        });

        const accessToken = response.data?.tokens?.access;
        const refreshToken = response.data?.tokens?.refresh;
        const user = response.data?.user;
        const userRole = user?.role;

        if (!accessToken || !refreshToken) {
          throw new Error('No access token returned by server.');
        }

        await saveToken(accessToken);
        await saveRefreshToken(refreshToken);
        await saveUser(user);

        if (userRole === 'DRIVER') {
          router.replace('/driver');
        } else if (userRole === 'OPERATOR') {
          router.replace('/operator');
        } else {
          setPopup({ visible: true, title: 'Login successful', message: 'Role not recognized.', type: 'error' });
        }
      } else {
        await apiClient.post('/api/register/', {
          first_name: firstName.trim(),
          mobile_number: cleanMobileNumber,
          password,
          role,
        });

        setPopup({
          visible: true,
          title: 'Registration sent',
          message: 'Your account is pending admin approval. Please wait for verification before login.',
          type: 'success',
        });
        setIsLogin(true);
      }
    } catch (error) {
      const responseData = error?.response?.data;
      let message = 'Something went wrong. Please try again.';

      if (responseData) {
        if (typeof responseData === 'string') {
          message = responseData;
        } else if (responseData.detail) {
          message = responseData.detail;
        } else if (responseData.error) {
          message = responseData.error;
        } else if (responseData.message) {
          message = responseData.message;
        } else if (responseData.non_field_errors && responseData.non_field_errors.length > 0) {
          message = responseData.non_field_errors[0];
        } else if (typeof responseData === 'object' && responseData !== null) {
          const firstKey = Object.keys(responseData)[0];
          if (firstKey && Array.isArray(responseData[firstKey]) && responseData[firstKey].length > 0) {
            message = `${firstKey}: ${responseData[firstKey][0]}`;
          } else {
            message = JSON.stringify(responseData);
          }
        }
      } else if (error.message) {
        message = error.message;
      }

      setPopup({ visible: true, title: isLogin ? 'Login failed' : 'Registration failed', message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>{isLogin ? 'Fuel Fleet Login' : 'Register Account'}</Text>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggle, isLogin && styles.toggleActive]}
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggle, !isLogin && styles.toggleActive]}
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>Register</Text>
            </TouchableOpacity>
          </View>

          {!isLogin && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Full name"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />

              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[styles.roleButton, role === 'DRIVER' && styles.roleButtonSelected]}
                  onPress={() => setRole('DRIVER')}
                >
                  <Text style={[styles.roleText, role === 'DRIVER' && styles.roleTextSelected]}>Driver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleButton, role === 'OPERATOR' && styles.roleButtonSelected]}
                  onPress={() => setRole('OPERATOR')}
                >
                  <Text style={[styles.roleText, role === 'OPERATOR' && styles.roleTextSelected]}>Operator</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Mobile number"
            value={mobileNumber}
            onChangeText={setMobileNumber}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />

            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#64748b"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Custom Popup Modal */}
      <Modal
        visible={popup.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPopup({ ...popup, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.iconCircle, popup.type === 'error' ? styles.iconCircleError : styles.iconCircleSuccess]}>
              <Ionicons 
                name={popup.type === 'error' ? 'close' : 'checkmark'} 
                size={38} 
                color={popup.type === 'error' ? '#ef4444' : '#22c55e'} 
              />
            </View>
            <Text style={styles.modalTitle}>{popup.title}</Text>
            <Text style={styles.modalMessage}>{popup.message}</Text>
            <TouchableOpacity 
              style={[styles.modalButton, popup.type === 'error' ? styles.modalButtonError : styles.modalButtonSuccess]}
              onPress={() => setPopup({ ...popup, visible: false })}
            >
              <Text style={styles.modalButtonText}>Okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: '#0f172a',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
  },
  toggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: '#2563eb',
  },
  toggleText: {
    color: '#334155',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  roleRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  roleButtonSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  roleText: {
    fontWeight: '600',
    color: '#334155',
  },
  roleTextSelected: {
    color: '#1d4ed8',
  },
  input: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  passwordContainer: {
    position: 'relative',
    marginBottom: 14,
  },

  passwordInput: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingRight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    fontSize: 16,
  },

  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircleError: {
    backgroundColor: '#fef2f2',
  },
  iconCircleSuccess: {
    backgroundColor: '#f0fdf4',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonError: {
    backgroundColor: '#ef4444',
  },
  modalButtonSuccess: {
    backgroundColor: '#22c55e',
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});