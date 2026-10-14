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

const { width, height } = Dimensions.get('window');

// ── BRAND COLOR PALETTE ─────────────────────────────────────
const C = {
  primary:    '#1565C0',
  primaryDark:'#0D47A1',
  primaryGlow:'#1E88E5',
  yellow:     '#FFC928',
  yellowGlow: '#FFD740',
  white:      '#FFFFFF',
  red:        '#E53935',
  green:      '#00C853',
  night:      '#0B1220',
  nightCard:  '#121C30',
  nightBorder:'#1E2E4A',
  neon:       '#00B8FF',
  textMuted:  '#627794',
  textSub:    '#8FA3BF',
  inputBg:    '#0D1626',
};

const SUPPORTED_ROLES = [
  'SUPER ADMIN',
  'PUMP ADMIN',
  'PUMP OPERATOR',
  'TRUCK OWNER',
  'DRIVER',
];

export default function AuthScreen() {
  const [role, setRole] = useState('');
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
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1.15, duration: 1800, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 1,    duration: 1800, useNativeDriver: true }),
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
    const cleanRole = role.trim();
    const cleanIdentifier = identifier.trim();

    if (!cleanRole) {
      setPopup({
        visible: true,
        title: 'Role Required',
        message: 'Please enter your role in CAPITAL LETTERS (e.g. SUPER ADMIN, PUMP ADMIN, PUMP OPERATOR, TRUCK OWNER, DRIVER).',
        type: 'error',
      });
      return;
    }

    if (cleanRole !== cleanRole.toUpperCase()) {
      setPopup({
        visible: true,
        title: 'Capital Letters Required',
        message: 'Your role must be typed in ALL CAPITAL LETTERS.',
        type: 'error',
      });
      return;
    }

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
        role: cleanRole,
        username: cleanIdentifier,
        password,
      });

      const accessToken  = response.data?.tokens?.access;
      const refreshToken = response.data?.tokens?.refresh;
      const user         = response.data?.user;
      const userRole     = user?.role;

      if (!accessToken || !refreshToken) {
        throw new Error('No access token returned by server.');
      }

      await saveToken(accessToken);
      await saveRefreshToken(refreshToken);
      await saveUser(user);

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
        else if (responseData.detail)  message = responseData.detail;
        else if (responseData.error)   message = responseData.error;
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
      <StatusBar barStyle="light-content" backgroundColor={C.night} />

      {/* ── Hero Background Image ── */}
      <ImageBackground
        source={require('../assets/images/pump_night.jpg')}
        style={styles.heroBg}
        resizeMode="cover"
      >
        <View style={styles.heroOverlay} />

        {/* Neon glow bar at top */}
        <View style={styles.neonTopBar} />

        {/* ── Logo / Brand ── */}
        <Animated.View style={[styles.brandBlock, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Animated.View style={[styles.logoRing, { transform: [{ scale: glowPulse }] }]}>
            <Ionicons name="flash" size={34} color={C.yellow} />
          </Animated.View>
          <Text style={styles.brandName}>FuelFleet</Text>
          <Text style={styles.brandTagline}>Role-Based Fuel Management System</Text>
        </Animated.View>
      </ImageBackground>

      {/* ── Auth Card ── */}
      <KeyboardAvoidingView
        style={styles.cardWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={styles.secureBadge}>
                <Ionicons name="shield-checkmark" size={14} color={C.neon} style={{ marginRight: 4 }} />
                <Text style={styles.secureBadgeText}>AUTHORIZED ACCESS ONLY</Text>
              </View>
              <Text style={styles.sectionTitle}>System Login</Text>
              <Text style={styles.sectionSub}>Enter your role, credentials, and security password</Text>
            </View>

            {/* ── Field 1: Role in CAPITAL LETTERS ── */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>ENTER ROLE (IN CAPITAL LETTERS) *</Text>
              <View style={styles.inputIconRow}>
                <Ionicons name="briefcase-outline" size={18} color={C.neon} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. SUPER ADMIN, PUMP ADMIN..."
                  placeholderTextColor={C.textMuted}
                  value={role}
                  onChangeText={(text) => setRole(text.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {role.length > 0 && (
                  <TouchableOpacity onPress={() => setRole('')}>
                    <Ionicons name="close-circle" size={18} color={C.textMuted} style={{ marginRight: 10 }} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Quick Select Chips */}
              <View style={styles.chipScroll}>
                {SUPPORTED_ROLES.map((r) => {
                  const isSelected = role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => setRole(r)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Field 2: Username or Mobile Number ── */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>USERNAME OR MOBILE NUMBER *</Text>
              <View style={styles.inputIconRow}>
                <Ionicons name="person-outline" size={18} color={C.neon} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Username (9-chars) or 10-digit Mobile"
                  placeholderTextColor={C.textMuted}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* ── Field 3: Password ── */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>PASSWORD *</Text>
              <View style={styles.inputIconRow}>
                <Ionicons name="lock-closed-outline" size={18} color={C.neon} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your account password"
                  placeholderTextColor={C.textMuted}
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
                    color={C.textSub}
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
                  <Text style={styles.submitBtnText}>Sign In to Dashboard</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.white} style={{ marginLeft: 8 }} />
                </View>
              )}
            </TouchableOpacity>

            {/* Security note */}
            <View style={styles.footerNote}>
              <Ionicons name="lock-closed" size={12} color={C.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.footerNoteText}>
                No public registration. Accounts are issued by Super Admin & Pump Admins.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    backgroundColor: C.night,
  },
  heroBg: {
    width: '100%',
    height: height * 0.36,
    justifyContent: 'flex-end',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,18,32,0.76)',
  },
  neonTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.neon,
    shadowColor: C.neon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  brandBlock: {
    alignItems: 'center',
    paddingBottom: 22,
  },
  logoRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(21,101,192,0.3)',
    borderWidth: 2,
    borderColor: C.neon,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: C.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 10,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  brandTagline: {
    fontSize: 12,
    color: C.textSub,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  cardWrapper: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 36,
  },
  card: {
    backgroundColor: C.nightCard,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: C.nightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  cardHeader: {
    marginBottom: 18,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,184,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,184,255,0.4)',
    marginBottom: 8,
  },
  secureBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.neon,
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.white,
  },
  sectionSub: {
    fontSize: 12,
    color: C.textSub,
    marginTop: 3,
  },
  inputGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textSub,
    letterSpacing: 1,
    marginBottom: 6,
  },
  inputIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.nightBorder,
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: C.white,
    fontSize: 14,
    fontWeight: '500',
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
    backgroundColor: 'rgba(30,46,74,0.6)',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  chipSelected: {
    backgroundColor: 'rgba(0,184,255,0.18)',
    borderColor: C.neon,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textSub,
    letterSpacing: 0.6,
  },
  chipTextSelected: {
    color: C.neon,
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
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
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
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupCard: {
    backgroundColor: C.nightCard,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.nightBorder,
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
    color: C.white,
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
    backgroundColor: C.nightCard,
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  firstTimeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,201,40,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,201,40,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  firstTimeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
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