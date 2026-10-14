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

const C = {
  night: '#0B1220',
  nightCard: '#121C30',
  nightCardElevated: '#17243D',
  nightBorder: '#1E2E4A',
  blue: '#1565C0',
  neon: '#00B8FF',
  yellow: '#FFC928',
  white: '#FFFFFF',
  red: '#E53935',
  green: '#00C853',
  textSub: '#8FA3BF',
  textMuted: '#526685',
};

export default function OperatorProfileScreen() {
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
        <Text style={styles.headerTitle}>Operator Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{(profile?.name || 'O').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{profile?.name || 'Operator'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>PUMP DISPENSER OPERATOR</Text>
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
                <Text style={[styles.value, { color: C.yellow }]}>{pump.name} ({pump.code})</Text>
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

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={20} color={C.white} style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
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
    borderBottomWidth: 1,
    borderBottomColor: C.nightBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.nightCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
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
  },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,184,255,0.12)',
    borderWidth: 2,
    borderColor: C.neon,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  avatarText: {
    color: C.neon,
    fontSize: 30,
    fontWeight: '800',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    color: C.white,
  },
  rolePill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(21,101,192,0.16)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.blue,
    marginTop: 6,
    marginBottom: 20,
  },
  roleText: {
    fontSize: 11,
    color: C.neon,
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
    color: C.white,
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
