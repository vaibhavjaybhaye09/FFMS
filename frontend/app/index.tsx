import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ImageBackground,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../src/api/client';
import { saveRefreshToken, saveToken, saveUser } from '../src/storage/token';
import { useTranslation } from '../src/i18n/LanguageContext';

const { width, height } = Dimensions.get('window');

// ── BRAND COLOR PALETTE ─────────────────────────────────────
const C = {
  primary: '#0284C7',
  primaryDark: '#0369A1',
  primaryGlow: '#38BDF8',
  yellow: '#D97706',
  yellowGlow: '#F59E0B',
  white: '#FFFFFF',
  red: '#DC2626',
  green: '#16A34A',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  night: '#F8FAFC',
  nightCard: '#FFFFFF',
  nightBorder: '#E2E8F0',
  neon: '#0284C7',
  text: '#0F172A',
  textMuted: '#64748B',
  textSub: '#475569',
  inputBg: '#F8FAFC',
};

export default function AuthScreen() {
  const { language, setLanguage, t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Popup state
  const [popup, setPopup] = useState({ visible: false, title: '', message: '', type: 'error' });

  // First-time password change modal state
  const [firstTimeModal, setFirstTimeModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string>('');

  const router = useRouter();

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1.15, duration: 1800, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const routeForRole = (userRole: string): string => {
    if (userRole === 'DRIVER') return '/driver';
    if (userRole === 'OPERATOR') return '/operator';
    if (userRole === 'TRUCK_OWNER' || userRole === 'REGULAR_CUSTOMER') return '/customer';
    if (userRole === 'PUMP_ADMIN' || userRole === 'ADMIN') return '/pump-admin';
    return '/pump-admin';
  };

  const handleLogin = async () => {
    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier || !password) {
      setPopup({
        visible: true,
        title: 'Missing Credentials',
        message: 'Please enter your Username or Mobile Number, and Password.',
        type: 'error',
      });
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post('/api/login/', {
        username: cleanIdentifier,
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

      if (user?.language) {
        await setLanguage(user.language);
      }

      const nextRoute = routeForRole(userRole);

      // If user was assigned an auto-generated password, require password change
      if (user?.must_change_password) {
        setTargetRoute(nextRoute);
        setFirstTimeModal(true);
      } else {
        router.replace(nextRoute as any);
      }
    } catch (error: any) {
      const responseData = error?.response?.data;
      let message = 'Invalid credentials or unable to sign in.';
      if (responseData) {
        if (typeof responseData === 'string') message = responseData;
        else if (responseData.detail) message = responseData.detail;
        else if (responseData.error) message = responseData.error;
        else if (responseData.message) message = responseData.message;
        else if (responseData.role) {
          message = Array.isArray(responseData.role) ? responseData.role[0] : responseData.role;
        } else if (responseData.non_field_errors?.length) {
          message = responseData.non_field_errors[0];
        } else if (typeof responseData === 'object') {
          const k = Object.keys(responseData)[0];
          if (k && Array.isArray(responseData[k])) message = `${responseData[k][0]}`;
          else message = JSON.stringify(responseData);
        }
      } else if (error.message) {
        message = error.message;
      }
      setPopup({ visible: true, title: 'Login Failed', message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      setPopup({ visible: true, title: 'Password Too Short', message: 'New password must be at least 6 characters.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPopup({ visible: true, title: 'Mismatch', message: 'Passwords do not match.', type: 'error' });
      return;
    }

    setChangingPassword(true);
    try {
      await apiClient.post('/api/change-password/', { new_password: newPassword });
      setFirstTimeModal(false);
      setPopup({
        visible: true,
        title: 'Password Set Successfully',
        message: 'Your personal password has been saved. Welcome!',
        type: 'success',
      });
      setTimeout(() => {
        router.replace((targetRoute || '/driver') as any);
      }, 1200);
    } catch (err: any) {
      setPopup({
        visible: true,
        title: 'Error Setting Password',
        message: err.response?.data?.message || err.message || 'Failed to update password.',
        type: 'error',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Full Page Background with download1.jpg ── */}
      <ImageBackground
        source={require('../assets/images/download1.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {/* Soft atmospheric overlay */}
        <View style={styles.darkOverlay}>
          {/* Glow accent bar at top */}
          <View style={styles.neonTopBar} />

          {/* ── Logo / Brand ── */}
          <Animated.View style={[styles.brandBlock, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Animated.View style={[styles.logoRing, { transform: [{ scale: glowPulse }] }]}>
              <Ionicons name="flash" size={30} color="#F59E0B" />
            </Animated.View>
            <View style={styles.brandTitleRow}>
              <Text style={styles.brandName}>FuelFleet</Text>
              <View style={styles.portalBadge}>
                <Text style={styles.portalBadgeText}>{t('portal', 'PORTAL')}</Text>
              </View>
            </View>
            <Text style={styles.brandTagline}>{t('brand_tagline', 'Fuel Station Admin Console & Analytical Reports')}</Text>

            {/* Quick Language Switcher Pills */}
            <View style={styles.langPillsRow}>
              {[
                { code: 'en', label: 'English' },
                { code: 'mr', label: 'मराठी' },
                { code: 'hi', label: 'हिंदी' },
              ].map((l) => {
                const isActive = language === l.code;
                return (
                  <TouchableOpacity
                    key={l.code}
                    style={[styles.langPill, isActive && styles.langPillActive]}
                    onPress={() => setLanguage(l.code as any)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.langPillText, isActive && styles.langPillTextActive]}>
                      {l.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>

          {/* ── Glassmorphic Auth Card with Mobile Keyboard Responsiveness ── */}
          <KeyboardAvoidingView
            style={styles.cardWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              bounces={true}
            >
              <Animated.View style={[styles.glassCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.secureBadge}>
                    <Ionicons name="shield-checkmark" size={13} color="#000000" style={{ marginRight: 4 }} />
                    <Text style={styles.secureBadgeText}>{t('authorized_only', 'AUTHORIZED ACCESS ONLY')}</Text>
                  </View>
                  <Text style={styles.sectionTitle}>{t('system_login', 'System Login')}</Text>
                  <Text style={styles.sectionSub}>{t('login_prompt', 'Enter your credentials to access your dashboard')}</Text>
                </View>

                {/* ── Field 2: Username or Mobile Number ── */}
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>{t('username_or_mobile', 'USERNAME OR MOBILE NUMBER *')}</Text>
                  <View style={styles.inputIconRow}>
                    <Ionicons name="person-outline" size={18} color="#000000" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('username_placeholder', 'Username (9-chars) or 10-digit Mobile')}
                      placeholderTextColor="#334155"
                      value={identifier}
                      onChangeText={setIdentifier}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                {/* ── Field 3: Password ── */}
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>{t('password', 'PASSWORD *')}</Text>
                  <View style={styles.inputIconRow}>
                    <Ionicons name="lock-closed-outline" size={18} color="#000000" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('password_placeholder', 'Enter your account password')}
                      placeholderTextColor="#334155"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#000000"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── Submit Button ── */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.88}
                >
                  {loading ? (
                    <ActivityIndicator color={C.white} size="small" />
                  ) : (
                    <View style={styles.btnContent}>
                      <Text style={styles.submitBtnText}>{t('sign_in', 'Sign In to Dashboard')}</Text>
                      <Ionicons name="arrow-forward" size={18} color={C.white} style={{ marginLeft: 8 }} />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Security note */}
                <View style={styles.footerNote}>
                  <Ionicons name="lock-closed" size={12} color="#000000" style={{ marginRight: 5 }} />
                  <Text style={styles.footerNoteText}>
                    {t('role_auto_verified', 'Role is automatically verified. Pump Admin, Operator, Truck Owner & Driver.')}
                  </Text>
                </View>
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </ImageBackground>

      {/* ── Alert Popup Modal ── */}
      <Modal visible={popup.visible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.popupCard}>
            <View
              style={[
                styles.popupIconWrap,
                { backgroundColor: popup.type === 'success' ? 'rgba(0,200,83,0.15)' : 'rgba(229,57,53,0.15)' },
              ]}
            >
              <Ionicons
                name={popup.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={40}
                color={popup.type === 'success' ? C.green : C.red}
              />
            </View>
            <Text style={styles.popupTitle}>{popup.title}</Text>
            <Text style={styles.popupMessage}>{popup.message}</Text>
            <TouchableOpacity
              style={[
                styles.popupBtn,
                { backgroundColor: popup.type === 'success' ? C.primary : C.red },
              ]}
              onPress={() => setPopup({ ...popup, visible: false })}
            >
              <Text style={styles.popupBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── First-Time Login Password Change Modal ── */}
      <Modal visible={firstTimeModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.firstTimeCard}>
            <View style={styles.firstTimeIconWrap}>
              <Ionicons name="key" size={32} color={C.yellow} />
            </View>
            <Text style={styles.firstTimeTitle}>Password Change Required</Text>
            <Text style={styles.firstTimeSub}>
              You logged in with a system-generated password. Please create your own secure personal password to continue.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>NEW PASSWORD (MIN 6 CHARACTERS)</Text>
              <View style={styles.inputIconRow}>
                <Ionicons name="lock-closed-outline" size={18} color={C.neon} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter new password"
                  placeholderTextColor={C.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
              <View style={styles.inputIconRow}>
                <Ionicons name="lock-closed-outline" size={18} color={C.neon} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm new password"
                  placeholderTextColor={C.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.primary, marginTop: 14 }]}
              onPress={handlePasswordChange}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <ActivityIndicator color={C.white} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Save Password & Proceed</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
  },
  neonTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.primary,
  },
  brandBlock: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 36,
    paddingBottom: 10,
  },
  logoRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  portalBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  portalBadgeText: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  brandTagline: {
    fontSize: 12,
    color: '#BAE6FD',
    letterSpacing: 0.5,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  langPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  langPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  langPillText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  langPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  cardWrapper: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 70,
    justifyContent: 'center',
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    marginBottom: 18,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 8,
  },
  secureBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.2,
  },
  sectionSub: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '700',
    marginTop: 3,
  },
  inputGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
    marginBottom: 6,
  },
  inputIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 12,
    height: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  eyeBtn: {
    padding: 6,
  },
  chipScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipSelected: {
    backgroundColor: '#E0F2FE',
    borderColor: C.primary,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textSub,
    letterSpacing: 0.6,
  },
  chipTextSelected: {
    color: C.primary,
  },
  submitBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitBtnText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 8,
  },
  footerNoteText: {
    fontSize: 11,
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  popupIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 13,
    color: C.textSub,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  popupBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 36,
  },
  popupBtnText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 14,
  },
  firstTimeCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  firstTimeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  firstTimeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
  },
  firstTimeSub: {
    fontSize: 12,
    color: C.textSub,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
});