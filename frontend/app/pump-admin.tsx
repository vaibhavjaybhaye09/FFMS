import React, { useEffect, useState, useCallback } from 'react';
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
  RefreshControl,
  StatusBar,
  ImageBackground,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient, { BASE_URL } from '../src/api/client';
import { getUser, removeToken } from '../src/storage/token';
import { useTranslation } from '../src/i18n/LanguageContext';

const C = {
  primary:    '#0284C7',
  yellow:     '#D97706',
  white:      '#FFFFFF',
  red:        '#DC2626',
  night:      '#F8FAFC',
  nightCard:  '#FFFFFF',
  nightCard2: '#F1F5F9',
  nightBorder:'#E2E8F0',
  neon:       '#0284C7',
  green:      '#16A34A',
  text:       '#0F172A',
  textMuted:  '#64748B',
  textSub:    '#334155',
};

export default function PumpAdminScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'customers' | 'operators' | 'pump'>('customers');
  const [adminUser, setAdminUser] = useState<any>(null);
  const [pump, setPump] = useState<any>(null);
  const [stats, setStats] = useState({ total_customers: 0, total_trucks: 0, total_operators: 0, total_requests: 0 });

  const [customers, setCustomers] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal 1: Create Truck Owner (9-char username & password)
  const [createCustomerModal, setCreateCustomerModal] = useState(false);
  const [custName, setCustName] = useState('');
  const [custMobile, setCustMobile] = useState('');
  const [custUsername, setCustUsername] = useState('');
  const [custPassword, setCustPassword] = useState('');
  const [submittingCustomer, setSubmittingCustomer] = useState(false);

  // Modal 2: Create Pump Operator (auto-generated password)
  const [createOperatorModal, setCreateOperatorModal] = useState(false);
  const [opName, setOpName] = useState('');
  const [opMobile, setOpMobile] = useState('');
  const [submittingOperator, setSubmittingOperator] = useState(false);

  // Modal 3: Generated Credentials Success Display
  const [credModal, setCredModal] = useState<{ visible: boolean; title: string; username: string; password?: string; note: string }>({
    visible: false,
    title: '',
    username: '',
    password: '',
    note: '',
  });

  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const getLogoUrl = (logoPath: string | null) => {
    if (!logoPath) return null;
    if (logoPath.startsWith('http')) return logoPath;
    return `${BASE_URL.replace(/\/$/, '')}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;
  };

  const handlePickAndUploadLogo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow gallery access to select a station logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

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
        loadData();
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err?.response?.data?.error || 'Could not update logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    Alert.alert(
      'Remove Logo',
      'Are you sure you want to remove the station logo?',
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
              Alert.alert('Removed', 'Station logo removed successfully.');
              loadData();
            } catch (err: any) {
              Alert.alert('Error', 'Failed to remove logo.');
            } finally {
              setUploadingLogo(false);
            }
          },
        },
      ]
    );
  };

  const loadData = useCallback(async () => {
    try {
      const user = await getUser();
      setAdminUser(user);

      const [dashRes, custRes, opRes] = await Promise.all([
        apiClient.get('/api/pump-admin/dashboard/').catch(() => ({ data: {} })),
        apiClient.get('/api/pump-admin/customers/').catch(() => ({ data: { customers: [] } })),
        apiClient.get('/api/pump-admin/operators/').catch(() => ({ data: { operators: [] } })),
      ]);

      if (dashRes.data?.pump) setPump(dashRes.data.pump);
      if (dashRes.data?.stats) setStats(dashRes.data.stats);
      setCustomers(custRes.data?.customers || []);
      setOperators(opRes.data?.operators || []);
    } catch (error) {
      console.error('Error loading pump admin dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Handle Create Truck Owner
  const handleCreateTruckOwner = async () => {
    const cleanMobile = custMobile.replace(/\s+/g, '').replace(/[^0-9]/g, '');
    const cleanName = custName.trim();
    const cleanUser = custUsername.trim();
    const cleanPass = custPassword.trim();

    if (!cleanName || !cleanMobile || !cleanUser || !cleanPass) {
      Alert.alert('Missing Fields', 'Please fill in Name, Mobile, 9-char Username, and 9-char Password.');
      return;
    }

    if (cleanUser.length !== 9) {
      Alert.alert('Invalid Username', `Username must be exactly 9 characters long (currently ${cleanUser.length} chars).`);
      return;
    }

    if (cleanPass.length !== 9) {
      Alert.alert('Invalid Password', `Password must be exactly 9 characters long (currently ${cleanPass.length} chars).`);
      return;
    }

    setSubmittingCustomer(true);
    try {
      await apiClient.post('/api/pump-admin/customers/create/', {
        first_name: cleanName,
        mobile_number: cleanMobile,
        username: cleanUser,
        password: cleanPass,
      });

      setCreateCustomerModal(false);
      setCustName('');
      setCustMobile('');
      setCustUsername('');
      setCustPassword('');
      loadData();

      setCredModal({
        visible: true,
        title: 'Truck Owner Created 🎉',
        username: cleanUser,
        password: cleanPass,
        note: `Account for ${cleanName} is ready. They can log in with role 'TRUCK OWNER' using these 9-character credentials.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.username?.[0] ||
        err?.response?.data?.password?.[0] ||
        err?.response?.data?.mobile_number?.[0] ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Failed to create truck owner.';
      Alert.alert('Creation Failed', msg);
    } finally {
      setSubmittingCustomer(false);
    }
  };

  // Handle Create Pump Operator (Auto-generated password)
  const handleCreateOperator = async () => {
    const cleanMobile = opMobile.replace(/\s+/g, '').replace(/[^0-9]/g, '');
    const cleanName = opName.trim();

    if (!cleanName || !cleanMobile) {
      Alert.alert('Missing Fields', 'Please enter Operator Name and 10-digit Mobile Number.');
      return;
    }

    if (cleanMobile.length < 10) {
      Alert.alert('Invalid Mobile', 'Mobile number must be at least 10 digits.');
      return;
    }

    setSubmittingOperator(true);
    try {
      const res = await apiClient.post('/api/pump-admin/operators/create/', {
        first_name: cleanName,
        mobile_number: cleanMobile,
      });

      const genPassword = res.data?.generated_password;

      setCreateOperatorModal(false);
      setOpName('');
      setOpMobile('');
      loadData();

      setCredModal({
        visible: true,
        title: 'Operator Created & Password Generated ⚡',
        username: cleanMobile,
        password: genPassword,
        note: `System-generated password for ${cleanName} (last 3 digits + pump code + 3 random digits). They can log in with role 'PUMP OPERATOR' and will be prompted to create their own password on first login.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.mobile_number?.[0] ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Failed to create operator.';
      Alert.alert('Creation Failed', msg);
    } finally {
      setSubmittingOperator(false);
    }
  };

  const [opActionLoadingId, setOpActionLoadingId] = useState<number | null>(null);

  const handleToggleOperatorStatus = (op: any) => {
    const isCurrentlyActive = op.is_active !== false;
    const actionText = isCurrentlyActive ? 'Deactivate' : 'Activate';
    const opName = op.full_name || op.first_name || op.username;

    Alert.alert(
      `${actionText} Operator ID`,
      isCurrentlyActive
        ? `Are you sure you want to deactivate ${opName}?\n\nThey will not be able to log in or approve fuel requests until activated again.`
        : `Activate ${opName}?\n\nThey will regain access to log in and dispense fuel.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `${actionText} ID`,
          style: isCurrentlyActive ? 'destructive' : 'default',
          onPress: async () => {
            setOpActionLoadingId(op.id);
            try {
              const res = await apiClient.patch(`/api/pump-admin/operators/${op.id}/status/`, {
                is_active: !isCurrentlyActive,
              });
              Alert.alert('Status Updated', res.data?.message || `Operator ${actionText.toLowerCase()}d successfully.`);
              loadData();
            } catch (err: any) {
              Alert.alert('Action Failed', err?.response?.data?.error || `Failed to ${actionText.toLowerCase()} operator.`);
            } finally {
              setOpActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteOperator = (op: any) => {
    const opName = op.full_name || op.first_name || op.username;
    const empId = op.employee_id || `ID #${op.id}`;

    Alert.alert(
      'Delete Operator ID',
      `Are you sure you want to permanently delete Operator ${opName} (${empId})?\n\nThis will permanently remove their credentials and pump assignments. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setOpActionLoadingId(op.id);
            try {
              const res = await apiClient.delete(`/api/pump-admin/operators/${op.id}/delete/`);
              Alert.alert('Operator Deleted', res.data?.message || 'Operator deleted successfully.');
              loadData();
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.response?.data?.error || 'Failed to delete operator.');
            } finally {
              setOpActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    await removeToken();
    router.replace('/');
  };

  const statItems = [
    { icon: 'people', color: C.neon, bg: '#E0F2FE', label: t('truck_owners', 'Truck Owners'), val: stats.total_customers },
    { icon: 'bus', color: C.green, bg: '#DCFCE7', label: t('fleet_trucks', 'Fleet Trucks'), val: stats.total_trucks },
    { icon: 'person', color: C.yellow, bg: '#FEF3C7', label: t('operators', 'Operators'), val: stats.total_operators },
    { icon: 'water', color: '#7C3AED', bg: '#EDE9FE', label: t('fuel_requests', 'Fuel Requests'), val: stats.total_requests },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Header ── */}
      <View style={styles.headerContainer}>
        <View style={styles.neonBar} />

        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerLogoWrap}
            onPress={() => router.push('/pump-admin-profile')}
            activeOpacity={0.8}
          >
            {pump?.logo ? (
              <Image source={{ uri: getLogoUrl(pump.logo) || '' }} style={styles.headerLogoImg} resizeMode="cover" />
            ) : (
              <Ionicons name={"business" as any} size={20} color={C.primary} />
            )}
            <View style={styles.headerCameraBadge}>
              <Ionicons name="settings-sharp" size={9} color={C.white} />
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={styles.adminPill}>
              <Ionicons name="shield" size={11} color={C.yellow} style={{ marginRight: 4 }} />
              <Text style={styles.adminPillText}>{t('pump_admin_console', 'PUMP ADMIN CONSOLE')}</Text>
            </View>
            <Text style={styles.headerTitle}>{pump?.name || 'Fuel Station'}</Text>
            <View style={styles.pumpCodeRow}>
              <Ionicons name="location-outline" size={13} color={C.primary} style={{ marginRight: 4 }} />
              <Text style={styles.pumpCodeText}>
                {pump?.code ? `${pump.code} · ` : ''}{pump?.city || 'Online'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={styles.profileHeaderBtn}
              onPress={() => router.push('/pump-admin-profile')}
              activeOpacity={0.8}
            >
              <Ionicons name="person-circle-outline" size={24} color={C.primary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={20} color={C.red} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.neon]} tintColor={C.neon} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Stats Grid ── */}
        <View style={styles.statsGrid}>
          {statItems.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon as any} size={20} color={s.color} />
              </View>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick Action Buttons ── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: 'rgba(21,101,192,0.22)', borderColor: C.primary }]}
            onPress={() => setCreateCustomerModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={18} color={C.neon} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.neon }]}>+ {t('add_truck_owner', 'Add Truck Owner')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: 'rgba(255,201,40,0.16)', borderColor: 'rgba(255,201,40,0.5)' }]}
            onPress={() => setCreateOperatorModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="key" size={18} color={C.yellow} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.yellow }]}>+ {t('add_operator', 'Add Operator')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs Bar ── */}
        <View style={styles.tabBar}>
          {[
            { key: 'customers', icon: 'people-outline', label: `${t('truck_owners', 'Truck Owners')} (${customers.length})` },
            { key: 'operators', icon: 'settings-outline', label: `${t('operators', 'Operators')} (${operators.length})` },
            { key: 'pump', icon: 'business-outline', label: t('station_info', 'Station Info') },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key as any)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={tab.icon as any}
                size={14}
                color={activeTab === tab.key ? C.night : C.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ──────────── TAB 1: TRUCK OWNERS ──────────── */}
        {activeTab === 'customers' && (
          <View>
            {loading && !refreshing ? (
              <View style={styles.centerBox}><ActivityIndicator size="large" color={C.neon} /></View>
            ) : customers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={44} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Truck Owners Registered</Text>
                <Text style={styles.emptySubtitle}>Use the "+ Add Truck Owner" button above to onboard fleet owners.</Text>
              </View>
            ) : (
              customers.map((cust) => (
                <View key={cust.id} style={styles.custCard}>
                  <View style={styles.custHeader}>
                    <View style={styles.custAvatar}>
                      <Text style={styles.custAvatarText}>{(cust.first_name || 'T').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>{cust.full_name || cust.first_name}</Text>
                      <View style={styles.custPhoneRow}>
                        <Ionicons name="person-outline" size={11} color={C.textSub} style={{ marginRight: 3 }} />
                        <Text style={styles.custUsername}>@{cust.username || cust.mobile_number}</Text>
                        <Text style={styles.custDivider}>•</Text>
                        <Ionicons name="call-outline" size={11} color={C.textSub} style={{ marginRight: 3 }} />
                        <Text style={styles.custPhone}>{cust.mobile_number}</Text>
                      </View>
                    </View>
                    <View style={styles.truckBadge}>
                      <Ionicons name="bus-outline" size={12} color={C.neon} style={{ marginRight: 4 }} />
                      <Text style={styles.truckBadgeText}>{cust.trucks_count} Trucks</Text>
                    </View>
                  </View>
                  <View style={[styles.opCredContainer, { marginHorizontal: 0, marginTop: 10, marginBottom: 8 }]}>
                    <View style={styles.opCredRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="key-outline" size={13} color={C.yellow} style={{ marginRight: 6 }} />
                        <Text style={styles.opCredLabel}>Password:</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {cust.password ? (
                          <>
                            <Text style={[styles.opCredVal, { color: C.yellow, marginRight: 6, letterSpacing: visiblePasswords[cust.id] ? 0.5 : 2 }]}>
                              {visiblePasswords[cust.id] ? cust.password : '••••••••'}
                            </Text>
                            <View style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                              <Text style={{ fontSize: 9, color: C.yellow, fontWeight: '800' }}>TEMP</Text>
                            </View>
                            <TouchableOpacity onPress={() => togglePasswordVisibility(cust.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons
                                name={visiblePasswords[cust.id] ? "eye-off-outline" : "eye-outline"}
                                size={16}
                                color={C.textSub}
                              />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="lock-closed" size={12} color={C.green} style={{ marginRight: 4 }} />
                            <Text style={[styles.opCredVal, { color: C.textMuted, fontSize: 12, fontStyle: 'italic' }]}>
                              Set by Owner
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <View style={styles.custFooter}>
                    <Text style={styles.custId}>ID: {cust.employee_id || `TOWN${cust.id}`}</Text>
                    <View style={styles.activePill}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activePillText}>Authorized</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ──────────── TAB 2: PUMP OPERATORS ──────────── */}
        {activeTab === 'operators' && (
          <View>
            {loading && !refreshing ? (
              <View style={styles.centerBox}><ActivityIndicator size="large" color={C.neon} /></View>
            ) : operators.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="person-circle-outline" size={44} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Operators Created</Text>
                <Text style={styles.emptySubtitle}>Use the "+ Add Operator" button above to create pump dispenser operators.</Text>
              </View>
            ) : (
              operators.map((op) => (
                <View key={op.id} style={styles.custCard}>
                  <View style={styles.custHeader}>
                    <View style={[styles.custAvatar, { borderColor: op.is_active !== false ? C.yellow : C.red, backgroundColor: op.is_active !== false ? 'rgba(255,201,40,0.12)' : 'rgba(220,38,38,0.1)' }]}>
                      <Text style={[styles.custAvatarText, { color: op.is_active !== false ? C.yellow : C.red }]}>{(op.first_name || 'O').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>{op.full_name || op.first_name}</Text>
                      <Text style={styles.custId}>ID: {op.employee_id || `OPER${op.id}`}</Text>
                    </View>
                    
                    {/* Status Pill Badge */}
                    <View style={[styles.statusPill, op.is_active !== false ? styles.activePillBg : styles.inactivePillBg]}>
                      <View style={[styles.statusDot, op.is_active !== false ? styles.activeDotBg : styles.inactiveDotBg]} />
                      <Text style={[styles.statusPillText, op.is_active !== false ? styles.activeStatusPillText : styles.inactiveStatusPillText]}>
                        {op.is_active !== false ? 'ACTIVE' : 'DEACTIVATED'}
                      </Text>
                    </View>
                  </View>

                  {/* ── Operator Credentials Box ── */}
                  <View style={styles.opCredContainer}>
                    <View style={styles.opCredRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="call-outline" size={14} color={C.neon} style={{ marginRight: 6 }} />
                        <Text style={styles.opCredLabel}>Mobile No:</Text>
                      </View>
                      <Text style={styles.opCredVal}>{op.mobile_number || '—'}</Text>
                    </View>

                    <View style={[styles.opCredRow, { marginTop: 8 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="key-outline" size={14} color={C.yellow} style={{ marginRight: 6 }} />
                        <Text style={styles.opCredLabel}>Password:</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {op.password ? (
                          <>
                            <Text style={[styles.opCredVal, { color: C.yellow, marginRight: 6, letterSpacing: visiblePasswords[op.id] ? 0.5 : 2 }]}>
                              {visiblePasswords[op.id] ? op.password : '••••••••'}
                            </Text>
                            <View style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                              <Text style={{ fontSize: 9, color: C.yellow, fontWeight: '800' }}>TEMP</Text>
                            </View>
                            <TouchableOpacity onPress={() => togglePasswordVisibility(op.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons
                                name={visiblePasswords[op.id] ? "eye-off-outline" : "eye-outline"}
                                size={18}
                                color={C.textSub}
                              />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="lock-closed" size={12} color={C.green} style={{ marginRight: 4 }} />
                            <Text style={[styles.opCredVal, { color: C.textMuted, fontSize: 12, fontStyle: 'italic' }]}>
                              Set by Operator
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* ── Action Buttons: Activate / Deactivate & Delete ── */}
                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={[
                        styles.opActionBtn,
                        op.is_active !== false ? styles.deactivateBtn : styles.activateBtn
                      ]}
                      onPress={() => handleToggleOperatorStatus(op)}
                      disabled={opActionLoadingId === op.id}
                      activeOpacity={0.8}
                    >
                      {opActionLoadingId === op.id ? (
                        <ActivityIndicator size="small" color={op.is_active !== false ? '#B45309' : C.green} />
                      ) : (
                        <>
                          <Ionicons
                            name={op.is_active !== false ? "pause-circle-outline" : "checkmark-circle-outline"}
                            size={15}
                            color={op.is_active !== false ? '#B45309' : C.green}
                            style={{ marginRight: 5 }}
                          />
                          <Text style={[styles.opActionBtnText, op.is_active !== false ? { color: '#B45309' } : { color: C.green }]}>
                            {op.is_active !== false ? 'Deactivate ID' : 'Activate ID'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.opActionBtn, styles.deleteBtn]}
                      onPress={() => handleDeleteOperator(op)}
                      disabled={opActionLoadingId === op.id}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={15} color={C.red} style={{ marginRight: 5 }} />
                      <Text style={[styles.opActionBtnText, { color: C.red }]}>Delete ID</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.custFooter}>
                    <Text style={[styles.statusTextBadge, op.must_change_password ? { color: C.yellow } : { color: C.green }]}>
                      {op.must_change_password ? '● Temporary Password' : '✓ Password Changed'}
                    </Text>
                    <Text style={styles.custId}>{op.pump_code ? `Pump: ${op.pump_code}` : 'Active'}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ──────────── TAB 3: PUMP STATION INFO ──────────── */}
        {activeTab === 'pump' && (
          <View style={styles.pumpInfoCard}>
            <View style={styles.pumpInfoHeader}>
              <Ionicons name="business" size={20} color={C.primary} />
              <Text style={styles.pumpInfoTitle}>Station Profile & Logo</Text>
            </View>

            {/* Dedicated Profile & Configuration Banner */}
            <TouchableOpacity
              style={styles.openProfileBanner}
              onPress={() => router.push('/pump-admin-profile')}
              activeOpacity={0.88}
            >
              <View style={styles.openProfileBannerLeft}>
                <Ionicons name="create-outline" size={22} color={C.primary} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.openProfileBannerTitle}>Open Full Profile Page</Text>
                  <Text style={styles.openProfileBannerSubtitle}>Edit station name, address, contact & upload logo</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.primary} />
            </TouchableOpacity>

            {/* Station Logo Management Box */}
            <View style={styles.logoManagementCard}>
              <View style={styles.logoPreviewWrap}>
                {pump?.logo ? (
                  <Image source={{ uri: getLogoUrl(pump.logo) || '' }} style={styles.logoPreviewImg} resizeMode="contain" />
                ) : (
                  <View style={styles.logoEmptyPlaceholder}>
                    <Ionicons name="image-outline" size={28} color={C.textMuted} />
                    <Text style={styles.logoEmptyText}>No Logo</Text>
                  </View>
                )}
                {uploadingLogo && (
                  <View style={styles.logoUploadingOverlay}>
                    <ActivityIndicator size="small" color={C.primary} />
                  </View>
                )}
              </View>

              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.logoCardTitle}>Official Station Logo</Text>
                <Text style={styles.logoCardSub}>Shown across web portal, slips, and operator dispenser verification</Text>

                <View style={styles.logoBtnRow}>
                  <TouchableOpacity
                    style={styles.logoUploadBtn}
                    onPress={handlePickAndUploadLogo}
                    disabled={uploadingLogo}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="cloud-upload-outline" size={13} color={C.white} style={{ marginRight: 5 }} />
                    <Text style={styles.logoUploadBtnText}>{pump?.logo ? 'Change Logo' : 'Upload Logo'}</Text>
                  </TouchableOpacity>

                  {pump?.logo && (
                    <TouchableOpacity
                      style={styles.logoRemoveBtn}
                      onPress={handleRemoveLogo}
                      disabled={uploadingLogo}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={14} color={C.red} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {[
              { key: 'Station Name', val: pump?.name },
              { key: 'Station Code', val: pump?.code },
              { key: 'City', val: pump?.city },
              { key: 'Station Address', val: pump?.address },
              { key: 'Contact Line', val: pump?.contact_number },
              { key: 'Operating Status', val: 'Online & Active', highlight: true },
            ].map((row) => (
              <View key={row.key} style={styles.infoRow}>
                <Text style={styles.infoKey}>{row.key}</Text>
                <Text style={[styles.infoVal, row.highlight && { color: C.green, fontWeight: '700' }]}>{row.val || '—'}</Text>
              </View>
            ))}

            <View style={styles.adminInfoBlock}>
              <Ionicons name="shield-checkmark" size={22} color={C.neon} style={{ marginRight: 10 }} />
              <View>
                <Text style={styles.adminInfoLabel}>Station Admin</Text>
                <Text style={styles.adminInfoName}>{adminUser?.name || adminUser?.first_name || 'Admin'}</Text>
                <Text style={styles.adminInfoMobile}>{adminUser?.username ? `@${adminUser.username}` : adminUser?.mobile_number}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Modal 1: Create Truck Owner ── */}
      <Modal visible={createCustomerModal} transparent animationType="slide" onRequestClose={() => setCreateCustomerModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Onboard Truck Owner</Text>
            <Text style={styles.modalSubtitle}>Enter details with strictly 9-character credentials</Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>FULL NAME / COMPANY</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Ramesh Transport"
                placeholderTextColor={C.textMuted}
                value={custName}
                onChangeText={setCustName}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>MOBILE NUMBER (10 DIGITS)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="10-digit mobile"
                placeholderTextColor={C.textMuted}
                value={custMobile}
                onChangeText={setCustMobile}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.inputLabel}>USERNAME (EXACTLY 9 CHARACTERS) *</Text>
                <Text style={[styles.charCount, custUsername.length === 9 ? { color: C.green } : { color: C.yellow }]}>
                  {custUsername.length}/9
                </Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. trkown001"
                placeholderTextColor={C.textMuted}
                value={custUsername}
                onChangeText={setCustUsername}
                maxLength={9}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.inputLabel}>PASSWORD (EXACTLY 9 CHARACTERS) *</Text>
                <Text style={[styles.charCount, custPassword.length === 9 ? { color: C.green } : { color: C.yellow }]}>
                  {custPassword.length}/9
                </Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="9-character password"
                placeholderTextColor={C.textMuted}
                value={custPassword}
                onChangeText={setCustPassword}
                maxLength={9}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCreateCustomerModal(false)} disabled={submittingCustomer}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleCreateTruckOwner} disabled={submittingCustomer} activeOpacity={0.85}>
                {submittingCustomer ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Create Truck Owner</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal 2: Create Pump Operator ── */}
      <Modal visible={createOperatorModal} transparent animationType="slide" onRequestClose={() => setCreateOperatorModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Create Pump Operator</Text>
            <Text style={styles.modalSubtitle}>System will auto-generate secure login credentials</Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>OPERATOR FULL NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Vijay Kumar"
                placeholderTextColor={C.textMuted}
                value={opName}
                onChangeText={setOpName}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>MOBILE NUMBER (WILL BE USERNAME)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={C.textMuted}
                value={opMobile}
                onChangeText={setOpMobile}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.autoGenNote}>
              <Ionicons name="information-circle-outline" size={16} color={C.yellow} style={{ marginRight: 6 }} />
              <Text style={styles.autoGenNoteText}>
                Password will be automatically created using: Last 3 digits + station prefix + 3 random digits.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCreateOperatorModal(false)} disabled={submittingOperator}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: C.primary }]} onPress={handleCreateOperator} disabled={submittingOperator} activeOpacity={0.85}>
                {submittingOperator ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Generate & Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal 3: Credentials Success Display ── */}
      <Modal visible={credModal.visible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.credCard}>
            <View style={styles.credIconWrap}>
              <Ionicons name="key" size={32} color={C.yellow} />
            </View>
            <Text style={styles.credTitle}>{credModal.title}</Text>
            <Text style={styles.credNote}>{credModal.note}</Text>

            <View style={styles.credBox}>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>USERNAME / ID:</Text>
                <Text style={styles.credVal}>{credModal.username}</Text>
              </View>
              {credModal.password && (
                <View style={[styles.credRow, { marginTop: 10 }]}>
                  <Text style={styles.credLabel}>PASSWORD:</Text>
                  <Text style={[styles.credVal, { color: C.yellow }]}>{credModal.password}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.credOkBtn} onPress={() => setCredModal({ ...credModal, visible: false })}>
              <Text style={styles.credOkBtnText}>Got It / Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.night },
  headerContainer: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.nightBorder },
  neonBar: { height: 3, backgroundColor: C.neon },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 },
  adminPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 6, alignSelf: 'flex-start' },
  adminPillText: { fontSize: 10, fontWeight: '800', color: C.yellow, letterSpacing: 1.5 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 4 },
  pumpCodeRow: { flexDirection: 'row', alignItems: 'center' },
  pumpCodeText: { fontSize: 12, color: C.primary, fontWeight: '600' },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 50 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.nightBorder, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statVal: { fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 2 },
  statLabel: { fontSize: 11, color: C.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  tabBar: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: C.nightBorder },
  tabItem: { flex: 1, flexDirection: 'row', paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabItemActive: { backgroundColor: C.primary },
  tabText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: C.white },
  centerBox: { padding: 40, alignItems: 'center' },
  emptyCard: { backgroundColor: C.white, borderRadius: 16, padding: 36, alignItems: 'center', borderWidth: 1, borderColor: C.nightBorder },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', lineHeight: 18 },
  custCard: { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.nightBorder, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  custHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  custAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E0F2FE', borderWidth: 1.5, borderColor: '#38BDF8', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  custAvatarText: { fontSize: 17, fontWeight: '800', color: C.primary },
  custName: { fontSize: 15, fontWeight: '800', color: C.text },
  custPhoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  custUsername: { fontSize: 11, color: C.primary, fontWeight: '700' },
  custDivider: { fontSize: 10, color: C.textMuted, marginHorizontal: 6 },
  custPhone: { fontSize: 11, color: C.textSub },
  truckBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  truckBadgeText: { fontSize: 11, fontWeight: '800', color: C.primary },
  custFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: C.nightBorder },
  custId: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  activePill: { flexDirection: 'row', alignItems: 'center' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 5 },
  activePillText: { fontSize: 11, fontWeight: '700', color: C.green },
  statusTextBadge: { fontSize: 11, fontWeight: '700' },
  opCredContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  opCredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  opCredLabel: {
    fontSize: 12,
    color: C.textSub,
    fontWeight: '700',
  },
  opCredVal: {
    fontSize: 13,
    color: C.text,
    fontWeight: '800',
  },
  pumpInfoCard: { backgroundColor: C.white, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.nightBorder },
  pumpInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.nightBorder },
  pumpInfoTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoKey: { fontSize: 13, color: C.textSub },
  infoVal: { fontSize: 13, color: C.text, fontWeight: '600' },
  adminInfoBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: C.nightBorder },
  adminInfoLabel: { fontSize: 10, color: C.textSub, fontWeight: '700', textTransform: 'uppercase' },
  adminInfoName: { fontSize: 14, fontWeight: '800', color: C.text, marginTop: 1 },
  adminInfoMobile: { fontSize: 12, color: C.primary, marginTop: 1, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, borderWidth: 1, borderColor: C.nightBorder },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', marginTop: 3, marginBottom: 16 },
  modalInputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textSub, letterSpacing: 0.8, marginBottom: 5 },
  charCount: { fontSize: 11, fontWeight: '800' },
  textInput: { backgroundColor: '#F8FAFC', borderRadius: 10, paddingHorizontal: 12, height: 46, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.nightBorder },
  autoGenNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 },
  autoGenNoteText: { fontSize: 11, color: C.yellow, flex: 1, lineHeight: 16, fontWeight: '600' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', borderWidth: 1, borderColor: C.nightBorder },
  modalCancelText: { color: C.textSub, fontWeight: '700', fontSize: 14 },
  modalConfirmBtn: { flex: 1.5, paddingVertical: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { color: C.white, fontWeight: '800', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  credCard: { backgroundColor: C.white, borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: C.nightBorder, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  credIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  credTitle: { fontSize: 17, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 6 },
  credNote: { fontSize: 12, color: C.textSub, textAlign: 'center', lineHeight: 17, marginBottom: 16 },
  credBox: { width: '100%', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.nightBorder, marginBottom: 18 },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  credLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700' },
  credVal: { fontSize: 14, color: C.primary, fontWeight: '800', letterSpacing: 0.5 },
  credOkBtn: { backgroundColor: C.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 36, width: '100%', alignItems: 'center' },
  credOkBtnText: { color: C.white, fontSize: 14, fontWeight: '800' },
  headerLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
    overflow: 'visible',
  },
  headerLogoImg: {
    width: 42,
    height: 42,
    borderRadius: 11,
  },
  headerCameraBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: C.primary,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.white,
  },
  logoManagementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  logoPreviewWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.nightBorder,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  logoPreviewImg: {
    width: 64,
    height: 64,
  },
  logoEmptyPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEmptyText: {
    fontSize: 9,
    color: C.textMuted,
    fontWeight: '700',
    marginTop: 2,
  },
  logoUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.text,
  },
  logoCardSub: {
    fontSize: 11,
    color: C.textSub,
    marginTop: 2,
    marginBottom: 8,
    lineHeight: 15,
  },
  logoBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  logoUploadBtnText: {
    color: C.white,
    fontSize: 11,
    fontWeight: '800',
  },
  logoRemoveBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  activePillBg: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  inactivePillBg: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  activeDotBg: {
    backgroundColor: C.green,
  },
  inactiveDotBg: {
    backgroundColor: C.red,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeStatusPillText: {
    color: '#15803D',
  },
  inactiveStatusPillText: {
    color: '#B91C1C',
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  opActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  activateBtn: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  deactivateBtn: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  opActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  profileHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  openProfileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  openProfileBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  openProfileBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.text,
  },
  openProfileBannerSubtitle: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
});
