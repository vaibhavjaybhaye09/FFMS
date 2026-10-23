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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient, { BASE_URL } from '../src/api/client';
import { getUser, removeToken } from '../src/storage/token';
import { useTranslation } from '../src/i18n/LanguageContext';

const C = {
  primary:     '#0284C7',
  primaryDim:  '#E0F2FE',
  yellow:      '#D97706',
  yellowDim:   '#FEF3C7',
  green:       '#16A34A',
  greenDim:    '#DCFCE7',
  red:         '#DC2626',
  redDim:      '#FEE2E2',
  purple:      '#7C3AED',
  purpleDim:   '#EDE9FE',
  white:       '#FFFFFF',
  night:       '#F8FAFC',
  nightCard:   '#FFFFFF',
  nightCard2:  '#F1F5F9',
  nightBorder: '#E2E8F0',
  neon:        '#0284C7',
  text:        '#0F172A',
  textMuted:   '#64748B',
  textSub:     '#334155',
};

type TabType = 'dashboard' | 'requests' | 'create_req' | 'customers' | 'operators' | 'pump';

export default function PumpAdminScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [adminUser, setAdminUser] = useState<any>(null);
  const [pump, setPump] = useState<any>(null);

  // Dynamic Dashboard Stats
  const [stats, setStats] = useState({
    total_customers: 0,
    total_trucks: 0,
    total_operators: 0,
    total_requests: 0,
    pending_requests: 0,
    approved_requests: 0,
    rejected_requests: 0,
    completed_requests: 0,
    eligible_trucks_count: 0,
  });

  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [eligibleTrucks, setEligibleTrucks] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Requests Tab Filter & Search
  const [requestFilter, setRequestFilter] = useState<string>('ALL');
  const [requestSearch, setRequestSearch] = useState<string>('');

  // Eligible Trucks Search (for single request creation)
  const [truckSearch, setTruckSearch] = useState<string>('');

  // Modal: Single Request Creation for Owner-Added Truck
  const [createReqModal, setCreateReqModal] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<any>(null);
  const [reqLiters, setReqLiters] = useState('');
  const [reqRemarks, setReqRemarks] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);

  // Modal: Create Truck Owner (9-char username & password)
  const [createCustomerModal, setCreateCustomerModal] = useState(false);
  const [custName, setCustName] = useState('');
  const [custMobile, setCustMobile] = useState('');
  const [custUsername, setCustUsername] = useState('');
  const [custPassword, setCustPassword] = useState('');
  const [submittingCustomer, setSubmittingCustomer] = useState(false);

  // Modal: Create Pump Operator
  const [createOperatorModal, setCreateOperatorModal] = useState(false);
  const [opName, setOpName] = useState('');
  const [opMobile, setOpMobile] = useState('');
  const [submittingOperator, setSubmittingOperator] = useState(false);

  // Modal: Generated Credentials Success Display
  const [credModal, setCredModal] = useState<{
    visible: boolean;
    title: string;
    username: string;
    password?: string;
    note: string;
  }>({
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
  const [opActionLoadingId, setOpActionLoadingId] = useState<number | null>(null);

  const getLogoUrl = (logoPath: string | null) => {
    if (!logoPath) return null;
    if (logoPath.startsWith('http')) return logoPath;
    return `${BASE_URL.replace(/\/$/, '')}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;
  };

  const loadData = useCallback(async () => {
    try {
      const user = await getUser();
      setAdminUser(user);

      const [dashRes, trucksRes, requestsRes, custRes, opRes] = await Promise.all([
        apiClient.get('/api/pump-admin/dashboard/').catch(() => ({ data: {} })),
        apiClient.get('/api/pump-admin/eligible-trucks/').catch(() => ({ data: { trucks: [] } })),
        apiClient.get('/api/pump-admin/fuel-requests/').catch(() => ({ data: { fuel_requests: [] } })),
        apiClient.get('/api/pump-admin/customers/').catch(() => ({ data: { customers: [] } })),
        apiClient.get('/api/pump-admin/operators/').catch(() => ({ data: { operators: [] } })),
      ]);

      if (dashRes.data?.pump) setPump(dashRes.data.pump);
      if (dashRes.data?.stats) setStats(dashRes.data.stats);
      if (dashRes.data?.recent_requests) setRecentRequests(dashRes.data.recent_requests);

      if (trucksRes.data?.trucks) setEligibleTrucks(trucksRes.data.trucks);
      if (requestsRes.data?.fuel_requests) setAllRequests(requestsRes.data.fuel_requests);
      if (custRes.data?.customers) setCustomers(custRes.data.customers);
      if (opRes.data?.operators) setOperators(opRes.data.operators);
    } catch (error) {
      console.error('Error loading pump admin data:', error);
      if (refreshing) {
        Alert.alert('Refresh Failed', 'Unable to refresh dashboard data. Showing existing cached data.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    loadData();
  };

  // Pick and Upload Station Logo
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
        const res = await apiClient.patch('/api/pump-admin/my-pump/', { logo: base64Data });
        if (res.data?.pump) setPump(res.data.pump);
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
              if (res.data?.pump) setPump(res.data.pump);
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

  // Open Single Fuel Request Creation Modal for a selected truck
  const openSingleRequestModal = (truck: any) => {
    if (!truck.is_eligible_for_request) {
      Alert.alert(
        'Truck Ineligible',
        `Truck ${truck.truck_number} currently has an active request (${truck.active_request_status || 'Pending'}). Duplicate requests are not permitted.`
      );
      return;
    }
    setSelectedTruck(truck);
    setReqLiters(String(truck.capacity || '50'));
    setReqRemarks('');
    setCreateReqModal(true);
  };

  // Submit Single Fuel Request (Pump Admin)
  const handleSubmitSingleRequest = async () => {
    if (!selectedTruck) return;
    const litersNum = parseFloat(reqLiters);
    if (!litersNum || isNaN(litersNum) || litersNum <= 0) {
      Alert.alert('Invalid Liters', 'Please enter a valid fuel quantity in liters (greater than 0).');
      return;
    }

    if (selectedTruck.capacity && litersNum > selectedTruck.capacity) {
      Alert.alert(
        'Capacity Exceeded',
        `Requested liters (${litersNum}L) cannot exceed truck fuel tank capacity (${selectedTruck.capacity}L).`
      );
      return;
    }

    setSubmittingReq(true);
    try {
      const res = await apiClient.post('/api/fuel-requests/create/', {
        truck_id: selectedTruck.id,
        requested_liters: litersNum,
        remarks: reqRemarks.trim() || undefined,
      });

      const reqNum = res.data?.fuel_request?.request_number || 'New Request';
      Alert.alert(
        'Request Created 🎉',
        `Fuel request ${reqNum} for truck ${selectedTruck.truck_number} has been submitted successfully.\n\nAssigned to your pump dispenser queue.`
      );

      setCreateReqModal(false);
      setSelectedTruck(null);
      setReqLiters('');
      setReqRemarks('');
      loadData();
      setActiveTab('requests');
    } catch (err: any) {
      const msg =
        err?.response?.data?.truck_id?.[0] ||
        err?.response?.data?.requested_liters?.[0] ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Failed to create fuel request.';
      Alert.alert('Creation Failed', msg);
    } finally {
      setSubmittingReq(false);
    }
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
        note: `System-generated password for ${cleanName} (last 3 digits + pump code + 3 random digits). They can log in with role 'PUMP OPERATOR'.`,
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

  // Status Badge Colors & Helpers
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { bg: C.yellowDim, text: C.yellow, border: '#FDE68A' };
      case 'APPROVED':
      case 'COMPLETED':
        return { bg: C.greenDim, text: C.green, border: '#86EFAC' };
      case 'VERIFIED':
        return { bg: C.primaryDim, text: C.primary, border: '#BAE6FD' };
      case 'REJECTED':
      case 'CANCELLED':
        return { bg: C.redDim, text: C.red, border: '#FECACA' };
      default:
        return { bg: C.nightCard2, text: C.textSub, border: C.nightBorder };
    }
  };

  // Filtered requests list
  const filteredRequests = allRequests.filter((r) => {
    if (requestFilter !== 'ALL' && r.status !== requestFilter) return false;
    if (!requestSearch.trim()) return true;
    const q = requestSearch.toLowerCase().trim();
    return (
      r.request_number?.toLowerCase().includes(q) ||
      r.truck_number?.toLowerCase().includes(q) ||
      r.customer_name?.toLowerCase().includes(q) ||
      r.customer_mobile?.toLowerCase().includes(q)
    );
  });

  // Filtered eligible trucks list
  const filteredEligibleTrucks = eligibleTrucks.filter((t) => {
    if (!truckSearch.trim()) return true;
    const q = truckSearch.toLowerCase().trim();
    return (
      t.truck_number?.toLowerCase().includes(q) ||
      t.customer_name?.toLowerCase().includes(q) ||
      t.customer_mobile?.toLowerCase().includes(q) ||
      t.truck_type?.toLowerCase().includes(q)
    );
  });

  // Navigation Items for Top/Tab bar
  const navTabs: { key: TabType; label: string; icon: string; count?: number }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'speedometer-outline' },
    { key: 'requests', label: 'Requests', icon: 'water-outline', count: stats.total_requests },
    { key: 'create_req', label: 'Create Fuel Request', icon: 'add-circle-outline' },
    { key: 'customers', label: 'Truck Owners', icon: 'people-outline', count: stats.total_customers },
    { key: 'operators', label: 'Operators', icon: 'person-outline', count: stats.total_operators },
    { key: 'pump', label: 'Station', icon: 'business-outline' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top Header ── */}
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
              <Ionicons name="business" size={20} color={C.primary} />
            )}
            <View style={styles.headerCameraBadge}>
              <Ionicons name="settings-sharp" size={9} color={C.white} />
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={styles.adminPill}>
              <Ionicons name="shield-checkmark" size={11} color={C.yellow} style={{ marginRight: 4 }} />
              <Text style={styles.adminPillText}>{t('pump_admin_console', 'PUMP ADMIN CONSOLE')}</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {pump?.name || 'Fuel Station'}
            </Text>
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

        {/* ── Scrollable Tab Bar ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
          style={styles.tabScrollWrap}
        >
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={14}
                  color={isActive ? C.white : C.textMuted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                  {tab.label}
                  {tab.count !== undefined ? ` (${tab.count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Main Content ScrollView with Pull-to-Refresh ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[C.primary]}
            tintColor={C.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ──────────────────────────────────────────────────────────── */}
        {/* TAB 1: OPERATIONAL DASHBOARD */}
        {/* ──────────────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <View>
            {/* Quick Operational Summary Notice */}
            <View style={styles.roleBanner}>
              <Ionicons name="flash" size={16} color={C.yellow} style={{ marginRight: 8 }} />
              <Text style={styles.roleBannerText}>
                Operational Summary: Single request creation for owner trucks enabled. Real-time sync with station dispensers.
              </Text>
            </View>

            {/* Metric Cards Grid */}
            <View style={styles.statsGrid}>
              {/* Total Requests */}
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => {
                  setRequestFilter('ALL');
                  setActiveTab('requests');
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.statIcon, { backgroundColor: C.primaryDim }]}>
                  <Ionicons name="water" size={20} color={C.primary} />
                </View>
                <Text style={[styles.statVal, { color: C.primary }]}>{stats.total_requests}</Text>
                <Text style={styles.statLabel}>Total Requests</Text>
              </TouchableOpacity>

              {/* Pending Requests */}
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => {
                  setRequestFilter('PENDING');
                  setActiveTab('requests');
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.statIcon, { backgroundColor: C.yellowDim }]}>
                  <Ionicons name="time" size={20} color={C.yellow} />
                </View>
                <Text style={[styles.statVal, { color: C.yellow }]}>{stats.pending_requests}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </TouchableOpacity>

              {/* Approved Requests */}
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => {
                  setRequestFilter('APPROVED');
                  setActiveTab('requests');
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.statIcon, { backgroundColor: C.greenDim }]}>
                  <Ionicons name="checkmark-done" size={20} color={C.green} />
                </View>
                <Text style={[styles.statVal, { color: C.green }]}>{stats.approved_requests}</Text>
                <Text style={styles.statLabel}>Approved</Text>
              </TouchableOpacity>

              {/* Rejected Requests */}
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => {
                  setRequestFilter('REJECTED');
                  setActiveTab('requests');
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.statIcon, { backgroundColor: C.redDim }]}>
                  <Ionicons name="close-circle" size={20} color={C.red} />
                </View>
                <Text style={[styles.statVal, { color: C.red }]}>{stats.rejected_requests}</Text>
                <Text style={styles.statLabel}>Rejected</Text>
              </TouchableOpacity>

              {/* Completed Requests */}
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => {
                  setRequestFilter('COMPLETED');
                  setActiveTab('requests');
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.statIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#15803D" />
                </View>
                <Text style={[styles.statVal, { color: '#15803D' }]}>{stats.completed_requests}</Text>
                <Text style={styles.statLabel}>Completed</Text>
              </TouchableOpacity>

              {/* Available Trucks Eligible for Request */}
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => setActiveTab('create_req')}
                activeOpacity={0.85}
              >
                <View style={[styles.statIcon, { backgroundColor: C.purpleDim }]}>
                  <Ionicons name="bus" size={20} color={C.purple} />
                </View>
                <Text style={[styles.statVal, { color: C.purple }]}>{stats.eligible_trucks_count}</Text>
                <Text style={styles.statLabel}>Eligible Trucks</Text>
              </TouchableOpacity>
            </View>

            {/* Secondary Operational Counts */}
            <View style={styles.secondaryStatsRow}>
              <View style={styles.secondaryStatItem}>
                <Text style={styles.secondaryStatNum}>{stats.total_trucks}</Text>
                <Text style={styles.secondaryStatLabel}>Total Fleet Trucks</Text>
              </View>
              <View style={styles.secondaryStatDivider} />
              <TouchableOpacity
                style={styles.secondaryStatItem}
                onPress={() => setActiveTab('customers')}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryStatNum, { color: C.primary }]}>{stats.total_customers}</Text>
                <Text style={styles.secondaryStatLabel}>Truck Owners</Text>
              </TouchableOpacity>
              <View style={styles.secondaryStatDivider} />
              <TouchableOpacity
                style={styles.secondaryStatItem}
                onPress={() => setActiveTab('operators')}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryStatNum, { color: C.yellow }]}>{stats.total_operators}</Text>
                <Text style={styles.secondaryStatLabel}>Operators</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => setActiveTab('create_req')}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={17} color={C.white} style={{ marginRight: 6 }} />
                <Text style={[styles.actionBtnText, { color: C.white }]}>+ Create Request</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
                onPress={() => setCreateCustomerModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add" size={17} color={C.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.actionBtnText, { color: C.primary }]}>+ Add Owner</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: C.yellowDim, borderColor: '#FDE68A' }]}
                onPress={() => setCreateOperatorModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="key" size={17} color={C.yellow} style={{ marginRight: 6 }} />
                <Text style={[styles.actionBtnText, { color: C.yellow }]}>+ Operator</Text>
              </TouchableOpacity>
            </View>

            {/* Recent Requests Section */}
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="time-outline" size={18} color={C.text} style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Recent Fuel Requests</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setRequestFilter('ALL');
                  setActiveTab('requests');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.viewAllText}>View All ({stats.total_requests}) →</Text>
              </TouchableOpacity>
            </View>

            {recentRequests.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="water-outline" size={40} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Recent Fuel Requests</Text>
                <Text style={styles.emptySubtitle}>
                  Requests created by Truck Owners or Pump Admin will appear here in real-time.
                </Text>
              </View>
            ) : (
              recentRequests.map((req) => {
                const badge = getStatusBadgeStyle(req.status);
                return (
                  <View key={req.id} style={styles.reqCard}>
                    <View style={styles.reqCardHeader}>
                      <View>
                        <Text style={styles.reqNumber}>{req.request_number}</Text>
                        <View style={styles.indianPlateSmall}>
                          <Text style={styles.indianPlateTextSmall}>{req.truck_number}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>{req.status}</Text>
                      </View>
                    </View>

                    <View style={styles.reqDetailsGrid}>
                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>TRUCK OWNER</Text>
                        <Text style={styles.reqDetailVal} numberOfLines={1}>
                          {req.customer_name || 'Fleet Owner'}
                        </Text>
                      </View>
                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>FUEL & QUANTITY</Text>
                        <Text style={[styles.reqDetailVal, { color: C.primary }]}>
                          {req.requested_liters}L {req.fuel_type}
                        </Text>
                      </View>
                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>CREATED BY</Text>
                        <Text style={styles.reqDetailVal} numberOfLines={1}>
                          {req.created_by_name || 'Owner'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* TAB 2: ALL FUEL REQUESTS LIST */}
        {/* ──────────────────────────────────────────────────────────── */}
        {activeTab === 'requests' && (
          <View>
            {/* Status Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {['ALL', 'PENDING', 'APPROVED', 'VERIFIED', 'COMPLETED', 'REJECTED', 'CANCELLED'].map((st) => {
                const isSelected = requestFilter === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                    onPress={() => setRequestFilter(st)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Search Input */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={17} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by request #, plate, or owner..."
                placeholderTextColor={C.textMuted}
                value={requestSearch}
                onChangeText={setRequestSearch}
                autoCapitalize="none"
              />
              {requestSearch.length > 0 && (
                <TouchableOpacity onPress={() => setRequestSearch('')}>
                  <Ionicons name="close-circle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {loading && !refreshing ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={C.primary} />
              </View>
            ) : filteredRequests.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="file-tray-outline" size={44} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Requests Found</Text>
                <Text style={styles.emptySubtitle}>
                  {requestFilter !== 'ALL'
                    ? `No fuel requests matching status "${requestFilter}".`
                    : 'No fuel requests registered for this pump station yet.'}
                </Text>
              </View>
            ) : (
              filteredRequests.map((r) => {
                const badge = getStatusBadgeStyle(r.status);
                return (
                  <View key={r.id} style={styles.reqCard}>
                    <View style={styles.reqCardHeader}>
                      <View>
                        <Text style={styles.reqNumber}>{r.request_number}</Text>
                        <Text style={styles.reqDate}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : 'Recent'}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>{r.status}</Text>
                      </View>
                    </View>

                    {/* Truck Plate Display */}
                    <View style={styles.indianPlateWrap}>
                      <View style={styles.indStripe}>
                        <Text style={styles.indText}>IND</Text>
                      </View>
                      <Text style={styles.indPlateNumber}>{r.truck_number}</Text>
                    </View>

                    <View style={styles.reqDetailsGrid}>
                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>TRUCK OWNER</Text>
                        <Text style={styles.reqDetailVal}>{r.customer_name || 'Fleet Owner'}</Text>
                        {r.customer_mobile ? (
                          <Text style={styles.reqDetailSub}>{r.customer_mobile}</Text>
                        ) : null}
                      </View>

                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>REQUESTED / APPROVED</Text>
                        <Text style={[styles.reqDetailVal, { color: C.primary }]}>
                          {r.approved_liters ? `${r.approved_liters}L (Dispensed)` : `${r.requested_liters}L`}
                        </Text>
                        <Text style={styles.reqDetailSub}>{r.fuel_type}</Text>
                      </View>

                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>CREATED BY</Text>
                        <Text style={styles.reqDetailVal}>
                          {r.created_by_name || 'Truck Owner'}
                        </Text>
                        <Text style={styles.reqDetailSub}>{r.created_by_role || 'User'}</Text>
                      </View>
                    </View>

                    {r.remarks ? (
                      <View style={styles.remarksBox}>
                        <Ionicons name="chatbubble-ellipses-outline" size={13} color={C.textMuted} style={{ marginRight: 5 }} />
                        <Text style={styles.remarksText}>Note: {r.remarks}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* TAB 3: CREATE REQUEST USING OWNER-ADDED TRUCKS */}
        {/* ──────────────────────────────────────────────────────────── */}
        {activeTab === 'create_req' && (
          <View>
            {/* Explicit Notice: Single Request Only */}
            <View style={styles.infoCallout}>
              <Ionicons name="information-circle" size={20} color={C.primary} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoCalloutTitle}>Single Fuel Request Creation</Text>
                <Text style={styles.infoCalloutText}>
                  Select an eligible truck added by a Truck Owner to generate a fuel request for your station. Bulk requests are restricted exclusively to Truck Owners.
                </Text>
              </View>
            </View>

            {/* Search Input for Trucks */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={17} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search truck number, owner name, or mobile..."
                placeholderTextColor={C.textMuted}
                value={truckSearch}
                onChangeText={setTruckSearch}
                autoCapitalize="none"
              />
              {truckSearch.length > 0 && (
                <TouchableOpacity onPress={() => setTruckSearch('')}>
                  <Ionicons name="close-circle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {loading && !refreshing ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={C.primary} />
              </View>
            ) : filteredEligibleTrucks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="bus-outline" size={44} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Trucks Available</Text>
                <Text style={styles.emptySubtitle}>
                  No trucks registered by Truck Owners match your search query.
                </Text>
              </View>
            ) : (
              filteredEligibleTrucks.map((truck) => {
                const isEligible = truck.is_eligible_for_request;
                return (
                  <View key={truck.id} style={styles.eligibleTruckCard}>
                    <View style={styles.eligibleTruckTop}>
                      <View style={styles.indianPlateWrap}>
                        <View style={styles.indStripe}>
                          <Text style={styles.indText}>IND</Text>
                        </View>
                        <Text style={styles.indPlateNumber}>{truck.truck_number}</Text>
                      </View>

                      {isEligible ? (
                        <View style={styles.eligiblePill}>
                          <Ionicons name="checkmark-circle" size={12} color={C.green} style={{ marginRight: 4 }} />
                          <Text style={styles.eligiblePillText}>Ready for Request</Text>
                        </View>
                      ) : (
                        <View style={styles.activeReqPill}>
                          <Ionicons name="time" size={12} color={C.yellow} style={{ marginRight: 4 }} />
                          <Text style={styles.activeReqPillText}>Active Request Exists</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.truckInfoGrid}>
                      <View style={styles.truckInfoItem}>
                        <Text style={styles.truckInfoLabel}>OWNER</Text>
                        <Text style={styles.truckInfoVal}>{truck.customer_name || 'Truck Owner'}</Text>
                        <Text style={styles.truckInfoSub}>{truck.customer_mobile || '—'}</Text>
                      </View>
                      <View style={styles.truckInfoItem}>
                        <Text style={styles.truckInfoLabel}>TYPE / MODEL</Text>
                        <Text style={styles.truckInfoVal}>{truck.truck_type || 'Commercial'}</Text>
                        <Text style={styles.truckInfoSub}>{truck.fuel_type || 'DIESEL'}</Text>
                      </View>
                      <View style={styles.truckInfoItem}>
                        <Text style={styles.truckInfoLabel}>TANK CAPACITY</Text>
                        <Text style={[styles.truckInfoVal, { color: C.primary }]}>
                          {truck.capacity ? `${truck.capacity} L` : 'N/A'}
                        </Text>
                        <Text style={styles.truckInfoSub}>Max Fill</Text>
                      </View>
                    </View>

                    {/* Action Button */}
                    <TouchableOpacity
                      style={[
                        styles.createReqBtn,
                        !isEligible && styles.createReqBtnDisabled,
                      ]}
                      onPress={() => openSingleRequestModal(truck)}
                      disabled={!isEligible}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={isEligible ? "add-circle" : "lock-closed"}
                        size={16}
                        color={isEligible ? C.white : C.textMuted}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.createReqBtnText,
                          !isEligible && styles.createReqBtnTextDisabled,
                        ]}
                      >
                        {isEligible ? 'Create Fuel Request' : 'Active Request in Progress'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* TAB 4: TRUCK OWNERS MANAGEMENT */}
        {/* ──────────────────────────────────────────────────────────── */}
        {activeTab === 'customers' && (
          <View>
            <View style={styles.tabActionHeader}>
              <Text style={styles.sectionTitle}>Registered Truck Owners ({customers.length})</Text>
              <TouchableOpacity
                style={styles.smallActionBtn}
                onPress={() => setCreateCustomerModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add" size={14} color={C.white} style={{ marginRight: 4 }} />
                <Text style={styles.smallActionBtnText}>+ Onboard Owner</Text>
              </TouchableOpacity>
            </View>

            {loading && !refreshing ? (
              <View style={styles.centerBox}><ActivityIndicator size="large" color={C.primary} /></View>
            ) : customers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={44} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Truck Owners Registered</Text>
                <Text style={styles.emptySubtitle}>Use the "+ Onboard Owner" button above to register fleet owners.</Text>
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
                      <Ionicons name="bus-outline" size={12} color={C.primary} style={{ marginRight: 4 }} />
                      <Text style={styles.truckBadgeText}>{cust.trucks_count || 0} Trucks</Text>
                    </View>
                  </View>

                  <View style={styles.opCredContainer}>
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
                            <View style={styles.tempBadge}>
                              <Text style={styles.tempBadgeText}>TEMP</Text>
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
                      <Text style={styles.activePillText}>Authorized Truck Owner</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ──────────────────────────────────────────────────────────── */}
        {/* TAB 5: PUMP OPERATORS MANAGEMENT */}
        {/* ──────────────────────────────────────────────────────────── */}
        {activeTab === 'operators' && (
          <View>
            <View style={styles.tabActionHeader}>
              <Text style={styles.sectionTitle}>Pump Operators ({operators.length})</Text>
              <TouchableOpacity
                style={[styles.smallActionBtn, { backgroundColor: C.yellow }]}
                onPress={() => setCreateOperatorModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="key" size={14} color={C.white} style={{ marginRight: 4 }} />
                <Text style={styles.smallActionBtnText}>+ Add Operator</Text>
              </TouchableOpacity>
            </View>

            {loading && !refreshing ? (
              <View style={styles.centerBox}><ActivityIndicator size="large" color={C.primary} /></View>
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
                    <View style={[styles.custAvatar, { borderColor: op.is_active !== false ? C.yellow : C.red, backgroundColor: op.is_active !== false ? 'rgba(217,119,6,0.1)' : 'rgba(220,38,38,0.1)' }]}>
                      <Text style={[styles.custAvatarText, { color: op.is_active !== false ? C.yellow : C.red }]}>{(op.first_name || 'O').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>{op.full_name || op.first_name}</Text>
                      <Text style={styles.custId}>ID: {op.employee_id || `OPER${op.id}`}</Text>
                    </View>

                    <View style={[styles.statusPill, op.is_active !== false ? styles.activePillBg : styles.inactivePillBg]}>
                      <View style={[styles.statusDot, op.is_active !== false ? styles.activeDotBg : styles.inactiveDotBg]} />
                      <Text style={[styles.statusPillText, op.is_active !== false ? styles.activeStatusPillText : styles.inactiveStatusPillText]}>
                        {op.is_active !== false ? 'ACTIVE' : 'DEACTIVATED'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.opCredContainer}>
                    <View style={styles.opCredRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="call-outline" size={14} color={C.primary} style={{ marginRight: 6 }} />
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
                            <View style={styles.tempBadge}>
                              <Text style={styles.tempBadgeText}>TEMP</Text>
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

        {/* ──────────────────────────────────────────────────────────── */}
        {/* TAB 6: PUMP STATION PROFILE & CONFIGURATION */}
        {/* ──────────────────────────────────────────────────────────── */}
        {activeTab === 'pump' && (
          <View style={styles.pumpInfoCard}>
            <View style={styles.pumpInfoHeader}>
              <Ionicons name="business" size={20} color={C.primary} />
              <Text style={styles.pumpInfoTitle}>Station Profile & Logo</Text>
            </View>

            {/* Profile Page Navigation Banner */}
            <TouchableOpacity
              style={styles.openProfileBanner}
              onPress={() => router.push('/pump-admin-profile')}
              activeOpacity={0.88}
            >
              <View style={styles.openProfileBannerLeft}>
                <Ionicons name="create-outline" size={22} color={C.primary} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.openProfileBannerTitle}>Open Station Profile Settings</Text>
                  <Text style={styles.openProfileBannerSubtitle}>Update name, address, contact line & credentials</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.primary} />
            </TouchableOpacity>

            {/* Logo Management Box */}
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
              <Ionicons name="shield-checkmark" size={22} color={C.primary} style={{ marginRight: 10 }} />
              <View>
                <Text style={styles.adminInfoLabel}>Station Admin</Text>
                <Text style={styles.adminInfoName}>{adminUser?.name || adminUser?.first_name || 'Admin'}</Text>
                <Text style={styles.adminInfoMobile}>{adminUser?.username ? `@${adminUser.username}` : adminUser?.mobile_number}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Modal: Single Fuel Request Creation ── */}
      <Modal visible={createReqModal} transparent animationType="slide" onRequestClose={() => setCreateReqModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Create Fuel Request</Text>
            <Text style={styles.modalSubtitle}>Dispatch request to your station dispenser queue</Text>

            {selectedTruck && (
              <View style={styles.selectedTruckReviewBox}>
                <View style={styles.indianPlateSmall}>
                  <Text style={styles.indianPlateTextSmall}>{selectedTruck.truck_number}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.reviewTruckOwner}>Owner: {selectedTruck.customer_name || 'Fleet Owner'}</Text>
                  <Text style={styles.reviewTruckMeta}>
                    {selectedTruck.fuel_type || 'DIESEL'} · Tank Capacity: {selectedTruck.capacity || '—'}L
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.modalInputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.inputLabel}>REQUESTED QUANTITY (LITERS) *</Text>
                {selectedTruck?.capacity ? (
                  <Text style={styles.capacityHint}>Max Capacity: {selectedTruck.capacity}L</Text>
                ) : null}
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 50"
                placeholderTextColor={C.textMuted}
                value={reqLiters}
                onChangeText={setReqLiters}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>REMARKS / DISPENSER NOTES (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Priority refueling for highway route"
                placeholderTextColor={C.textMuted}
                value={reqRemarks}
                onChangeText={setReqRemarks}
              />
            </View>

            <View style={styles.singleNoticeBox}>
              <Ionicons name="information-circle-outline" size={15} color={C.primary} style={{ marginRight: 6 }} />
              <Text style={styles.singleNoticeText}>
                Pump Admins can only issue single requests. Bulk requests are restricted to Truck Owners.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCreateReqModal(false)}
                disabled={submittingReq}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleSubmitSingleRequest}
                disabled={submittingReq}
                activeOpacity={0.85}
              >
                {submittingReq ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: Create Truck Owner ── */}
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

      {/* ── Modal: Create Pump Operator ── */}
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

      {/* ── Modal: Credentials Success Display ── */}
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
  neonBar: { height: 3, backgroundColor: C.primary },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.primaryDim,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    position: 'relative',
  },
  headerLogoImg: { width: 42, height: 42, borderRadius: 11 },
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
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.yellowDim,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  adminPillText: { fontSize: 10, fontWeight: '800', color: C.yellow, letterSpacing: 1 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: C.text, marginBottom: 2 },
  pumpCodeRow: { flexDirection: 'row', alignItems: 'center' },
  pumpCodeText: { fontSize: 12, color: C.primary, fontWeight: '600' },
  profileHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.primaryDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.redDim,
    borderWidth: 1,
    borderColor: '#FECACA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabScrollWrap: { backgroundColor: '#F1F5F9', borderTopWidth: 1, borderTopColor: C.nightBorder },
  tabScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  tabButtonActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSub,
  },
  tabButtonTextActive: {
    color: C.white,
  },
  scrollContent: { padding: 14, paddingBottom: 60 },
  roleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.yellowDim,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  roleBannerText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.nightBorder,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statVal: { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 2 },
  statLabel: { fontSize: 11, color: C.textSub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  secondaryStatsRow: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.nightBorder,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  secondaryStatItem: { alignItems: 'center', flex: 1 },
  secondaryStatNum: { fontSize: 16, fontWeight: '900', color: C.text },
  secondaryStatLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, marginTop: 2, textTransform: 'uppercase' },
  secondaryStatDivider: { width: 1, height: 24, backgroundColor: C.nightBorder },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 12, fontWeight: '800' },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  viewAllText: { fontSize: 12, fontWeight: '700', color: C.primary },
  centerBox: { padding: 40, alignItems: 'center' },
  emptyCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.nightBorder,
    marginTop: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 10, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', lineHeight: 17 },
  reqCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  reqCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  reqNumber: { fontSize: 14, fontWeight: '800', color: C.text },
  reqDate: { fontSize: 10, color: C.textMuted, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  indianPlateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0F172A',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    overflow: 'hidden',
    marginBottom: 10,
  },
  indStripe: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  indPlateNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  indianPlateSmall: {
    borderWidth: 1,
    borderColor: '#0F172A',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  indianPlateTextSmall: { fontSize: 11, fontWeight: '900', color: '#0F172A', letterSpacing: 1 },
  reqDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  reqDetailItem: { flex: 1 },
  reqDetailLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  reqDetailVal: { fontSize: 12, fontWeight: '800', color: C.text },
  reqDetailSub: { fontSize: 10, color: C.textMuted, marginTop: 1 },
  remarksBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.nightBorder,
  },
  remarksText: { fontSize: 11, color: C.textSub, fontStyle: 'italic', flex: 1 },
  filterScroll: { flexDirection: 'row', marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.nightBorder,
    marginRight: 6,
  },
  filterChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterChipText: { fontSize: 11, fontWeight: '700', color: C.textSub },
  filterChipTextActive: { color: C.white },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: C.nightBorder,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 13 },
  infoCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.primaryDim,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 12,
  },
  infoCalloutTitle: { fontSize: 13, fontWeight: '800', color: C.primary, marginBottom: 2 },
  infoCalloutText: { fontSize: 11, color: C.textSub, lineHeight: 16 },
  eligibleTruckCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  eligibleTruckTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  eligiblePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  eligiblePillText: { fontSize: 10, fontWeight: '800', color: C.green },
  activeReqPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.yellowDim,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  activeReqPillText: { fontSize: 10, fontWeight: '800', color: C.yellow },
  truckInfoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
    marginBottom: 10,
  },
  truckInfoItem: { flex: 1 },
  truckInfoLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  truckInfoVal: { fontSize: 12, fontWeight: '800', color: C.text },
  truckInfoSub: { fontSize: 10, color: C.textMuted, marginTop: 1 },
  createReqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 10,
  },
  createReqBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  createReqBtnText: { color: C.white, fontSize: 12, fontWeight: '800' },
  createReqBtnTextDisabled: { color: C.textMuted },
  tabActionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  smallActionBtnText: { color: C.white, fontSize: 11, fontWeight: '800' },
  custCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  custHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  custAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primaryDim,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  custAvatarText: { fontSize: 16, fontWeight: '800', color: C.primary },
  custName: { fontSize: 14, fontWeight: '800', color: C.text },
  custPhoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  custUsername: { fontSize: 11, color: C.primary, fontWeight: '700' },
  custDivider: { fontSize: 10, color: C.textMuted, marginHorizontal: 5 },
  custPhone: { fontSize: 11, color: C.textSub },
  truckBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primaryDim,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  truckBadgeText: { fontSize: 11, fontWeight: '800', color: C.primary },
  custFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.nightBorder,
  },
  custId: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  activePill: { flexDirection: 'row', alignItems: 'center' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 5 },
  activePillText: { fontSize: 11, fontWeight: '700', color: C.green },
  statusTextBadge: { fontSize: 11, fontWeight: '700' },
  opCredContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  opCredRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  opCredLabel: { fontSize: 11, color: C.textSub, fontWeight: '700' },
  opCredVal: { fontSize: 12, color: C.text, fontWeight: '800' },
  tempBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  tempBadgeText: { fontSize: 9, color: C.yellow, fontWeight: '800' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  activePillBg: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  inactivePillBg: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  activeDotBg: { backgroundColor: C.green },
  inactiveDotBg: { backgroundColor: C.red },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  activeStatusPillText: { color: '#15803D' },
  inactiveStatusPillText: { color: '#B91C1C' },
  cardActionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  opActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  activateBtn: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  deactivateBtn: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  deleteBtn: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  opActionBtnText: { fontSize: 11, fontWeight: '800' },
  pumpInfoCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  pumpInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.nightBorder,
  },
  pumpInfoTitle: { fontSize: 16, fontWeight: '800', color: C.text },
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
  openProfileBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  openProfileBannerTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  openProfileBannerSubtitle: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  logoManagementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  logoPreviewWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.nightBorder,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoPreviewImg: { width: 60, height: 60 },
  logoEmptyPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  logoEmptyText: { fontSize: 9, color: C.textMuted, fontWeight: '700', marginTop: 2 },
  logoUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCardTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  logoCardSub: { fontSize: 11, color: C.textSub, marginTop: 2, marginBottom: 8, lineHeight: 15 },
  logoBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoUploadBtnText: { color: C.white, fontSize: 11, fontWeight: '800' },
  logoRemoveBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoKey: { fontSize: 12, color: C.textSub },
  infoVal: { fontSize: 12, color: C.text, fontWeight: '600' },
  adminInfoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  adminInfoLabel: { fontSize: 9, color: C.textSub, fontWeight: '700', textTransform: 'uppercase' },
  adminInfoName: { fontSize: 13, fontWeight: '800', color: C.text, marginTop: 1 },
  adminInfoMobile: { fontSize: 11, color: C.primary, marginTop: 1, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', marginTop: 2, marginBottom: 14 },
  selectedTruckReviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
    marginBottom: 12,
  },
  reviewTruckOwner: { fontSize: 12, fontWeight: '800', color: C.text },
  reviewTruckMeta: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  modalInputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textSub, letterSpacing: 0.6, marginBottom: 4 },
  capacityHint: { fontSize: 10, fontWeight: '700', color: C.primary },
  charCount: { fontSize: 11, fontWeight: '800' },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    color: C.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  singleNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primaryDim,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 14,
  },
  singleNoticeText: { fontSize: 11, color: C.primary, flex: 1, lineHeight: 15, fontWeight: '600' },
  autoGenNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 14,
  },
  autoGenNoteText: { fontSize: 11, color: C.yellow, flex: 1, lineHeight: 16, fontWeight: '600' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  modalCancelText: { color: C.textSub, fontWeight: '700', fontSize: 13 },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { color: C.white, fontWeight: '800', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  credCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: C.nightBorder,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  credIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  credTitle: { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 6 },
  credNote: { fontSize: 11, color: C.textSub, textAlign: 'center', lineHeight: 16, marginBottom: 14 },
  credBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.nightBorder,
    marginBottom: 16,
  },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  credLabel: { fontSize: 10, color: C.textMuted, fontWeight: '700' },
  credVal: { fontSize: 13, color: C.primary, fontWeight: '800', letterSpacing: 0.5 },
  credOkBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 36,
    width: '100%',
    alignItems: 'center',
  },
  credOkBtnText: { color: C.white, fontSize: 13, fontWeight: '800' },
});
