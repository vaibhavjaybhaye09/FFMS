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
  night: '#F8FAFC',
  nightCard: '#FFFFFF',
  nightCardElevated: '#FFFFFF',
  nightBorder: '#E2E8F0',
  blue: '#0284C7',
  neon: '#0284C7',
  yellow: '#D97706',
  white: '#FFFFFF',
  red: '#DC2626',
  green: '#16A34A',
  text: '#0F172A',
  textSub: '#334155',
  textMuted: '#64748B',
};

export default function DriverProfileScreen() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<any>(null);
  const [truck, setTruck] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadProfile = async () => {
      const user = await getUser();
      setProfile(
        user || {
          name: 'Driver',
          role: 'DRIVER',
          employee_id: 'N/A',
          mobile_number: 'N/A',
        }
      );

      try {
        const response = await apiClient.get('/api/my-truck/');
        setTruck(response.data?.truck || null);
      } catch (error: any) {
        console.error('Error loading truck:', error.message);
        setTruck(null);
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
        <ActivityIndicator size="large" color={C.neon} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.night} />
      <View style={styles.neonBar} />

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile', 'Driver Profile')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{(profile?.name || 'D').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{profile?.name || 'Driver'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{t('truck_driver', 'COMMERCIAL DRIVER')}</Text>
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
            <Text style={styles.label}>Assigned Vehicle</Text>
            {truck ? (
              <>
                <Text style={[styles.value, { color: C.yellow }]}>{truck.truck_number}</Text>
                <Text style={styles.subValue}>
                  {truck.fuel_type} • {truck.is_active ? 'Active' : 'Inactive'}
                  {truck.capacity_liters ? ` • ${truck.capacity_liters} L max` : ''}
                </Text>
              </>
            ) : (
              <Text style={[styles.value, styles.notAssigned]}>No truck assigned</Text>
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
    backgroundColor: C.night,
  },
  neonBar: {
    height: 3,
    backgroundColor: C.neon,
    shadowColor: C.neon,
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.nightBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 0.5,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.night,
  },
  container: {
    flexGrow: 1,
    backgroundColor: C.night,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: C.nightCard,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.nightBorder,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#E0F2FE',
    borderWidth: 2,
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  avatarText: {
    color: C.blue,
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
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#86EFAC',
    marginTop: 6,
    marginBottom: 20,
  },
  roleText: {
    fontSize: 11,
    color: C.green,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  infoBox: {
    borderBottomWidth: 1,
    borderBottomColor: C.nightBorder,
    paddingVertical: 12,
  },
  label: {
    fontSize: 11,
    color: C.textSub,
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
    color: C.textSub,
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
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: C.red,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
});