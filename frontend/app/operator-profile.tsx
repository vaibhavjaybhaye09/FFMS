import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import apiClient from '../src/api/client';
import { getUser, removeToken } from '../src/storage/token';

export default function OperatorProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [pump, setPump] = useState(null);
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
      } catch (error) {
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
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.avatar}>{(profile?.name || 'O').charAt(0).toUpperCase()}</Text>
        <Text style={styles.name}>{profile?.name || 'Operator'}</Text>
        <Text style={styles.role}>Operator</Text>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Employee ID</Text>
          <Text style={styles.value}>{profile?.employee_id || 'N/A'}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Mobile</Text>
          <Text style={styles.value}>{profile?.mobile_number || 'N/A'}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Assigned Pump</Text>
          {pump ? (
            <>
              <Text style={styles.value}>{pump.name} ({pump.code})</Text>
              <Text style={styles.subValue}>
                Status: {pump.is_active ? 'Active' : 'Inactive'} • {pump.city}
              </Text>
            </>
          ) : (
            <Text style={[styles.value, styles.notAssigned]}>Not assigned</Text>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Profile Status</Text>
          <Text style={[
            styles.value, 
            profile?.approval_status === 'APPROVED' ? styles.approved : 
            profile?.approval_status === 'REJECTED' ? styles.rejected : 
            styles.pending
          ]}>
            {profile?.approval_status || 'APPROVED'}
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{profile?.role || 'OPERATOR'}</Text>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2563eb',
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#0f172a',
  },
  role: {
    fontSize: 15,
    color: '#2563eb',
    textAlign: 'center',
    marginBottom: 22,
    fontWeight: '600',
  },
  infoBox: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 12,
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '600',
  },
  value: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
  },
  subValue: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  notAssigned: {
    color: '#dc2626',
  },
  approved: {
    color: '#2563eb',
  },
  pending: {
    color: '#d97706',
  },
  rejected: {
    color: '#dc2626',
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 22,
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
