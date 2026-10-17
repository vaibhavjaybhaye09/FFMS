import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient, { BASE_URL } from '../src/api/client';
import { getUser, removeToken } from '../src/storage/token';
import { LanguageSelectorCard } from '../src/components/LanguageSelectorCard';
import { useTranslation } from '../src/i18n/LanguageContext';

const C = {
  primary: '#0284C7',
  primaryDark: '#0369A1',
  primaryGlow: '#38BDF8',
  yellow: '#D97706',
  yellowLight: '#FEF3C7',
  white: '#FFFFFF',
  red: '#DC2626',
  redLight: '#FEE2E2',
  green: '#16A34A',
  greenLight: '#DCFCE7',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textSub: '#334155',
  textMuted: '#64748B',
  inputBg: '#F8FAFC',
};

export default function PumpAdminProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  // State
  const [adminUser, setAdminUser] = useState<any>(null);
  const [pump, setPump] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  const getLogoUrl = (logoPath: string | null) => {
    if (!logoPath) return null;
    if (logoPath.startsWith('http')) return logoPath;
    return `${BASE_URL.replace(/\/$/, '')}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;
  };

  const loadProfile = async () => {
    try {
      setLoading(true);
      const user = await getUser();
      setAdminUser(user);

      const res = await apiClient.get('/api/pump-admin/my-pump/');
      if (res.data?.pump) {
        const p = res.data.pump;
        setPump(p);
        setName(p.name || '');
        setContactNumber(p.contact_number || '');
        setCity(p.city || '');
        setAddress(p.address || '');
      }
    } catch (err) {
      console.error('Error fetching pump profile:', err);
      Alert.alert('Error', 'Unable to load pump profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Upload logo from library
  const handlePickLogo = async (useCamera: boolean = false) => {
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Denied', 'Camera access is required to take a station photo.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
          base64: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Denied', 'Gallery access is required to select a station logo.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
          base64: true,
        });
      }

      if (!result.canceled && result.assets && result.assets[0].base64) {
        setUploadingLogo(true);
        const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const res = await apiClient.patch('/api/pump-admin/my-pump/', {
          logo: base64Data,
        });
        if (res.data?.pump) {
          setPump(res.data.pump);
        }
        Alert.alert('Success 🎉', 'Station logo updated successfully!');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.response?.data?.error || 'Failed to update logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Remove station logo
  const handleRemoveLogo = () => {
    Alert.alert(
      'Remove Logo',
      'Are you sure you want to remove the current station logo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploadingLogo(true);
              const res = await apiClient.patch('/api/pump-admin/my-pump/', { logo: null });
              if (res.data?.pump) {
                setPump(res.data.pump);
              }
              Alert.alert('Removed', 'Station logo has been removed.');
            } catch (err) {
              Alert.alert('Error', 'Failed to remove logo.');
            } finally {
              setUploadingLogo(false);
            }
          },
        },
      ]
    );
  };

  // Save textual station information
  const handleSaveDetails = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a valid station name.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.patch('/api/pump-admin/my-pump/', {
        name: name.trim(),
        contact_number: contactNumber.trim(),
        city: city.trim(),
        address: address.trim(),
      });

      if (res.data?.pump) {
        setPump(res.data.pump);
      }
      Alert.alert('Saved Successfully 🎉', 'Station configuration and profile have been updated.');
    } catch (err: any) {
      Alert.alert('Update Failed', err?.response?.data?.error || 'Could not save station details.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of the admin console?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await removeToken();
          router.replace('/');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading station profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('profile', 'Station Profile & Settings')}</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={C.red} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Card 1: Admin Account Overview ── */}
          <View style={styles.card}>
            <View style={styles.adminHeaderRow}>
              <View style={styles.adminAvatar}>
                <Text style={styles.adminAvatarText}>
                  {(adminUser?.name || adminUser?.username || 'A').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={styles.rolePill}>
                  <Ionicons name="shield-checkmark" size={11} color={C.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.rolePillText}>PUMP ADMINISTRATOR</Text>
                </View>
                <Text style={styles.adminName}>{adminUser?.name || adminUser?.first_name || 'Admin User'}</Text>
                <Text style={styles.adminMeta}>
                  Username: @{adminUser?.username || 'N/A'} • Mobile: {adminUser?.mobile_number || 'N/A'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Language Setting Card ── */}
          <LanguageSelectorCard />

          {/* ── Card 2: Official Station Logo Configuration ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="image-outline" size={20} color={C.primary} />
              <Text style={styles.cardSectionTitle}>Official Station Logo</Text>
            </View>
            <Text style={styles.cardSectionSubtitle}>
              This logo represents your station on printed receipts, mobile dashboards, and web analytical portals.
            </Text>

            <View style={styles.logoSection}>
              <View style={styles.logoPreviewBox}>
                {pump?.logo ? (
                  <Image
                    source={{ uri: getLogoUrl(pump.logo) || '' }}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="business-outline" size={40} color={C.textMuted} />
                    <Text style={styles.logoPlaceholderText}>No Logo Assigned</Text>
                  </View>
                )}

                {uploadingLogo && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={styles.uploadingText}>Updating...</Text>
                  </View>
                )}
              </View>

              <View style={styles.logoActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => handlePickLogo(false)}
                  disabled={uploadingLogo}
                  activeOpacity={0.85}
                >
                  <Ionicons name="images-outline" size={16} color={C.white} style={{ marginRight: 6 }} />
                  <Text style={styles.btnTextWhite}>{pump?.logo ? 'Change from Gallery' : 'Upload Logo'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => handlePickLogo(true)}
                  disabled={uploadingLogo}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera-outline" size={16} color={C.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.btnTextPrimary}>Take Photo</Text>
                </TouchableOpacity>

                {pump?.logo && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDanger]}
                    onPress={handleRemoveLogo}
                    disabled={uploadingLogo}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={16} color={C.red} style={{ marginRight: 6 }} />
                    <Text style={styles.btnTextDanger}>Remove Logo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* ── Card 3: Station Information & Settings ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="business" size={20} color={C.primary} />
              <Text style={styles.cardSectionTitle}>Fuel Station Details</Text>
            </View>
            <Text style={styles.cardSectionSubtitle}>
              Update your station's commercial information and public contact details.
            </Text>

            {/* Station Code (Read Only) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>STATION CODE (UNIQUE IDENTIFIER)</Text>
              <View style={styles.readonlyInputRow}>
                <Ionicons name="barcode-outline" size={18} color={C.primary} style={{ marginRight: 8 }} />
                <Text style={styles.readonlyInputText}>{pump?.code || 'PUMP001'}</Text>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                </View>
              </View>
            </View>

            {/* Station Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>STATION NAME *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. City Central Fuel Station"
                placeholderTextColor={C.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Contact Number */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>OFFICIAL CONTACT NUMBER</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 9876543210"
                placeholderTextColor={C.textMuted}
                value={contactNumber}
                onChangeText={setContactNumber}
                keyboardType="phone-pad"
              />
            </View>

            {/* City / Region */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CITY / REGION</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Pune Highway, Mumbai"
                placeholderTextColor={C.textMuted}
                value={city}
                onChangeText={setCity}
              />
            </View>

            {/* Full Address */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>STATION PHYSICAL ADDRESS</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Complete street address or landmark"
                placeholderTextColor={C.textMuted}
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSaveDetails}
              disabled={saving}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator color={C.white} size="small" />
              ) : (
                <View style={styles.saveBtnContent}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={C.white} style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnText}>Save Configuration</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Card 4: System Operational Status ── */}
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Station Status: Online & Active</Text>
                <Text style={styles.statusSubtitle}>
                  Authorized operators can approve requests and meter readings at this pump.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: C.textSub,
    fontWeight: '600',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.redLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  adminHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#BAE6FD',
  },
  adminAvatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: C.white,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  rolePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: 0.5,
  },
  adminName: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  adminMeta: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    marginLeft: 8,
  },
  cardSectionSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 16,
    lineHeight: 17,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoPreviewBox: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  logoPlaceholderText: {
    fontSize: 9,
    fontWeight: '700',
    color: C.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.primary,
    marginTop: 4,
  },
  logoActions: {
    flex: 1,
    gap: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnPrimary: {
    backgroundColor: C.primary,
  },
  btnTextWhite: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  btnSecondary: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  btnTextPrimary: {
    fontSize: 12,
    fontWeight: '800',
    color: C.primary,
  },
  btnDanger: {
    backgroundColor: C.redLight,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  btnTextDanger: {
    fontSize: 12,
    fontWeight: '800',
    color: C.red,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textSub,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  readonlyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  readonlyInputText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: C.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  verifiedBadge: {
    backgroundColor: C.greenLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: C.green,
  },
  input: {
    backgroundColor: C.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  multilineInput: {
    height: 72,
    textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.green,
    marginRight: 10,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.text,
  },
  statusSubtitle: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
});
