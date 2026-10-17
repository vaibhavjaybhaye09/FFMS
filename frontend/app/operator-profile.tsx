import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../src/api/client';
import { getUser, removeToken } from '../src/storage/token';
import { LanguageSelectorCard } from '../src/components/LanguageSelectorCard';
import { useTranslation } from '../src/i18n/LanguageContext';

const C = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textSub: '#475569',
  textMuted: '#64748B',
  primary: '#0284C7',
  neon: '#0284C7',
  blue: '#0284C7',
  yellow: '#D97706',
  white: '#FFFFFF',
  red: '#DC2626',
  green: '#16A34A',
  night: '#F8FAFC',
  nightCard: '#FFFFFF',
  nightBorder: '#E2E8F0',
};

export default function OperatorProfileScreen() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<any>(null);
  const [pump, setPump] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadProfile = async () => {
      const user = await getUser();
      setProfile(
        user || {
          name: 'Operator',
          role: 'OPERATOR',
          employee_id: 'N/A',
          mobile_number: 'N/A',
        }
      );

      try {
        const response = await apiClient.get('/api/my-pump/');
        setPump(response.data?.pump || null);
      } catch (error: any) {
        console.error('Error loading pump:', error.message);
        setPump(null);
      }

      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleLogout = async () => {
    await removeToken();
    router.replace('/');
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.neonBar} />

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile', 'Operator Profile')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{(profile?.name || 'O').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{profile?.name || 'Operator'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{t('pump_operator', 'PUMP DISPENSER OPERATOR')}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Employee ID</Text>
            <Text style={styles.value}>{profile?.employee_id || 'N/A'}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Registered Mobile</Text>
            <Text style={styles.value}>{profile?.mobile_number || 'N/A'}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Station Assignment</Text>
            {pump ? (
              <>
                <Text style={[styles.value, { color: C.primary, fontWeight: '700' }]}>{pump.name} ({pump.code})</Text>
                <Text style={styles.subValue}>
                  {pump.city} • {pump.is_active ? 'Station Online' : 'Inactive'}
                </Text>
              </>
            ) : (
              <Text style={[styles.value, styles.notAssigned]}>No station assigned</Text>
            )}
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>Authorization Status</Text>
            <Text
              style={[
                styles.value,
                profile?.approval_status === 'APPROVED'
                  ? styles.approved
                  : profile?.approval_status === 'REJECTED'
                  ? styles.rejected
                  : styles.pending,
              ]}
            >
              {profile?.approval_status || 'APPROVED'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => router.push('/operator-completed')}
            activeOpacity={0.85}
          >
            <Ionicons name="time-outline" size={20} color={C.primary} style={{ marginRight: 8 }} />
            <Text style={styles.historyText}>View Completed Requests (Last 30 Days)</Text>
            <Ionicons name="chevron-forward" size={18} color={C.primary} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        <LanguageSelectorCard />

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={C.white} style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>{t('logout', 'Sign Out')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  neonBar: {
    height: 3,
    backgroundColor: C.primary,
  },
  headerRow: {
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
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 0.3,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  container: {
    flexGrow: 1,
    backgroundColor: C.bg,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderWidth: 2,
    borderColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  avatarText: {
    color: C.primary,
    fontSize: 30,
    fontWeight: '800',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    color: C.text,
  },
  rolePill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(2,132,199,0.25)',
    marginTop: 6,
    marginBottom: 20,
  },
  roleText: {
    fontSize: 11,
    color: C.primary,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  infoBox: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 12,
  },
  label: {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 15,
    color: C.text,
    fontWeight: '600',
  },
  subValue: {
    fontSize: 13,
    color: C.textMuted,
    marginTop: 3,
  },
  notAssigned: {
    color: C.red,
  },
  approved: {
    color: C.green,
  },
  pending: {
    color: C.yellow,
  },
  rejected: {
    color: C.red,
  },
  historyButton: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  historyText: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: C.red,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
