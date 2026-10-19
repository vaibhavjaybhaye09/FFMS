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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../src/api/client';
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

const STATUS_MAP: Record<string, { bg: string; text: string }> = {
  COMPLETED: { bg: '#DCFCE7', text: '#16A34A' },
  APPROVED:  { bg: '#E0F2FE', text: '#0284C7' },
  VERIFIED:  { bg: '#DCFCE7', text: '#16A34A' },
  REJECTED:  { bg: '#FEE2E2', text: '#DC2626' },
  PENDING:   { bg: '#FEF3C7', text: '#D97706' },
};

export default function CustomerScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'trucks' | 'drivers' | 'requests'>('trucks');
  const [customerUser, setCustomerUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState({ total_trucks: 0, assigned_trucks: 0, unassigned_trucks: 0, total_requests: 0 });
  const [trucks, setTrucks] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  // Modal: Add Truck
  const [addTruckVisible, setAddTruckVisible] = useState(false);
  const [newTruckNumber, setNewTruckNumber] = useState('');
  const [newFuelType, setNewFuelType] = useState('DIESEL');
  const [newCapacity, setNewCapacity] = useState('200');
  const [submittingTruck, setSubmittingTruck] = useState(false);

  // Modal: Create Driver (8-digit auto password)
  const [createDriverVisible, setCreateDriverVisible] = useState(false);
  const [drvName, setDrvName] = useState('');
  const [drvMobile, setDrvMobile] = useState('');
  const [submittingDriver, setSubmittingDriver] = useState(false);

  // Modal: Generated Credentials Success Display
  const [credModal, setCredModal] = useState<{ visible: boolean; title: string; username: string; password?: string; note: string }>({
    visible: false,
    title: '',
    username: '',
    password: '',
    note: '',
  });

  // Modal: Assign Driver
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<any>(null);
  const [assigningDriverId, setAssigningDriverId] = useState<any>(null);

  const [driverActionLoadingId, setDriverActionLoadingId] = useState<number | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadData = useCallback(async () => {
    try {
      const user = await getUser();
      setCustomerUser(user);

      const [trucksRes, driversRes, statsRes, reqRes] = await Promise.all([
        apiClient.get('/api/customer/trucks/').catch(() => ({ data: { trucks: [] } })),
        apiClient.get('/api/customer/drivers/').catch(() => ({ data: { drivers: [] } })),
        apiClient.get('/api/customer/dashboard/').catch(() => ({ data: {} })),
        apiClient.get('/api/customer/fuel-requests/').catch(() => ({ data: { fuel_requests: [] } })),
      ]);

      const loadedTrucks = trucksRes.data?.trucks || [];
      setTrucks(loadedTrucks);
      setDrivers(driversRes.data?.drivers || []);
      setRequests(reqRes.data?.fuel_requests || []);

      if (statsRes.data?.stats) {
        setStats(statsRes.data.stats);
      } else {
        const assigned = loadedTrucks.filter((t: any) => !!t.driver).length;
        setStats({
          total_trucks: loadedTrucks.length,
          assigned_trucks: assigned,
          unassigned_trucks: loadedTrucks.length - assigned,
          total_requests: reqRes.data?.fuel_requests?.length || 0,
        });
      }
    } catch (error) {
      console.error('Error loading customer dashboard:', error);
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

  // Create Truck
  const handleCreateTruck = async () => {
    const cleanNumber = newTruckNumber.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanNumber) {
      Alert.alert('Missing Field', 'Please enter a truck plate number.');
      return;
    }
    const capacity = parseInt(newCapacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      Alert.alert('Invalid Capacity', 'Please enter a valid tank capacity in liters.');
      return;
    }
    setSubmittingTruck(true);
    try {
      await apiClient.post('/api/customer/trucks/create/', {
        truck_number: cleanNumber,
        fuel_type: newFuelType,
        capacity_liters: capacity,
      });
      Alert.alert('🚛 Truck Added!', `Truck ${cleanNumber} has been added to your fleet.`);
      setNewTruckNumber('');
      setAddTruckVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Creation Failed', err?.response?.data?.error || err?.response?.data?.truck_number?.[0] || 'Failed to create truck.');
    } finally {
      setSubmittingTruck(false);
    }
  };

  // Create Driver with 8-digit numeric auto password
  const handleCreateDriver = async () => {
    const cleanMobile = drvMobile.replace(/\s+/g, '').replace(/[^0-9]/g, '');
    const cleanName = drvName.trim();

    if (!cleanName || !cleanMobile) {
      Alert.alert('Missing Fields', 'Please enter Driver Name and 10-digit Mobile Number.');
      return;
    }

    if (cleanMobile.length < 10) {
      Alert.alert('Invalid Mobile', 'Mobile number must be at least 10 digits.');
      return;
    }

    setSubmittingDriver(true);
    try {
      const res = await apiClient.post('/api/customer/drivers/create/', {
        first_name: cleanName,
        mobile_number: cleanMobile,
      });

      const genPassword = res.data?.generated_password;

      setCreateDriverVisible(false);
      setDrvName('');
      setDrvMobile('');
      loadData();

      setCredModal({
        visible: true,
        title: 'Driver Account Created 🚚',
        username: cleanMobile,
        password: genPassword,
        note: `System-generated 8-digit numeric password for ${cleanName}. They can log in with role 'DRIVER' using their mobile number. They will be prompted to set their own password on first login.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.mobile_number?.[0] ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Failed to create driver.';
      Alert.alert('Creation Failed', msg);
    } finally {
      setSubmittingDriver(false);
    }
  };

  // Assign Driver to Truck
  const openAssignModal = (truck: any) => {
    setSelectedTruck(truck);
    setAssignModalVisible(true);
  };

  const closeAssignModal = () => {
    setAssignModalVisible(false);
    setSelectedTruck(null);
  };

  const handleAssignDriver = async (driverId: any) => {
    if (!selectedTruck) return;
    setAssigningDriverId(driverId);
    try {
      const res = await apiClient.post(`/api/trucks/${selectedTruck.id}/assign-driver/`, { driver_id: driverId });
      Alert.alert('✅ Driver Assigned', res.data?.message || 'Driver assigned successfully.');
      closeAssignModal();
      loadData();
    } catch (err: any) {
      Alert.alert('Assignment Failed', err?.response?.data?.error || err?.response?.data?.message || 'Failed to assign driver.');
    } finally {
      setAssigningDriverId(null);
    }
  };

  const handleToggleDriverStatus = (drv: any) => {
    const isCurrentlyActive = drv.is_active !== false;
    const actionText = isCurrentlyActive ? 'Deactivate' : 'Activate';
    const drvName = drv.full_name || drv.first_name || drv.mobile_number;

    Alert.alert(
      `${actionText} Driver ID`,
      isCurrentlyActive
        ? `Are you sure you want to deactivate Driver ${drvName}?\n\nThey will not be able to log in or request fuel, and any truck assigned to them will be unassigned.`
        : `Activate Driver ${drvName}?\n\nThey will regain access to log in and request fuel.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `${actionText} ID`,
          style: isCurrentlyActive ? 'destructive' : 'default',
          onPress: async () => {
            setDriverActionLoadingId(drv.id);
            try {
              const res = await apiClient.patch(`/api/customer/drivers/${drv.id}/status/`, {
                is_active: !isCurrentlyActive,
              });
              Alert.alert('Status Updated', res.data?.message || `Driver ${actionText.toLowerCase()}d successfully.`);
              loadData();
            } catch (err: any) {
              Alert.alert('Action Failed', err?.response?.data?.error || `Failed to ${actionText.toLowerCase()} driver.`);
            } finally {
              setDriverActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteDriver = (drv: any) => {
    const drvName = drv.full_name || drv.first_name || drv.mobile_number;
    const empId = drv.employee_id || `ID #${drv.id}`;

    Alert.alert(
      'Delete Driver ID',
      `Are you sure you want to delete Driver ${drvName} (${empId})?\n\nThis will remove their login access and unassign any truck linked to them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setDriverActionLoadingId(drv.id);
            try {
              const res = await apiClient.delete(`/api/customer/drivers/${drv.id}/delete/`);
              Alert.alert('Driver Deleted', res.data?.message || 'Driver deleted successfully.');
              loadData();
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.response?.data?.error || 'Failed to delete driver.');
            } finally {
              setDriverActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const statItems = [
    { icon: 'bus', color: C.neon, bg: '#E0F2FE', label: t('fleet_trucks', 'Total Trucks'), val: stats.total_trucks },
    { icon: 'person', color: C.green, bg: '#DCFCE7', label: t('drivers', 'Drivers'), val: drivers.length },
    { icon: 'checkmark-circle', color: C.yellow, bg: '#FEF3C7', label: t('assigned', 'Assigned'), val: stats.assigned_trucks },
    { icon: 'water', color: '#7C3AED', bg: '#EDE9FE', label: t('fuel_requests', 'Requests'), val: requests.length },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Header ── */}
      <View style={styles.headerContainer}>
        <View style={styles.neonBar} />

        <View style={styles.headerRow}>
          <View>
            <View style={styles.rolePill}>
              <Ionicons name="shield-checkmark" size={11} color={C.primary} style={{ marginRight: 4 }} />
              <Text style={styles.rolePillText}>{t('truck_owner_customer', 'TRUCK OWNER • FLEET')}</Text>
            </View>
            <Text style={styles.headerName}>{customerUser?.name || customerUser?.first_name || 'Fleet Owner'}</Text>
            <Text style={styles.headerSub}>Manage your commercial fleet & driver assignments</Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/customer-profile' as any)} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(customerUser?.name || 'T').charAt(0).toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
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
            onPress={() => setAddTruckVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={18} color={C.neon} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.neon }]}>+ {t('add_truck', 'Add Truck')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: 'rgba(0,200,83,0.15)', borderColor: 'rgba(0,200,83,0.5)' }]}
            onPress={() => setCreateDriverVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={18} color={C.green} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.green }]}>+ {t('add_driver', 'Add Driver')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tab Bar ── */}
        <View style={styles.tabBar}>
          {[
            { key: 'trucks',   icon: 'bus',            label: `${t('fleet_trucks', 'Trucks')} (${trucks.length})` },
            { key: 'drivers',  icon: 'people-outline', label: `${t('drivers', 'Drivers')} (${drivers.length})` },
            { key: 'requests', icon: 'receipt-outline', label: `${t('fuel_requests', 'Requests')} (${requests.length})` },
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

        {/* ──────────── TAB 1: FLEET TRUCKS ──────────── */}
        {activeTab === 'trucks' && (
          <View>
            {loading && !refreshing ? (
              <View style={styles.centerBox}><ActivityIndicator size="large" color={C.neon} /></View>
            ) : trucks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="bus-outline" size={48} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Trucks in Fleet</Text>
                <Text style={styles.emptySubtitle}>Click "+ Add Truck" above to register your vehicle.</Text>
              </View>
            ) : (
              trucks.map((truck) => (
                <View key={truck.id} style={styles.truckCard}>
                  <View style={[styles.truckAccent, truck.fuel_type === 'DIESEL' ? { backgroundColor: C.neon } : { backgroundColor: C.yellow }]} />

                  <View style={styles.truckHeaderRow}>
                    <View style={styles.plateBox}>
                      <View style={styles.plateBlue}><Text style={styles.plateBlueTxt}>IND</Text></View>
                      <Text style={styles.plateNum}>{truck.truck_number}</Text>
                    </View>
                    <View style={[styles.fuelBadge, { backgroundColor: truck.fuel_type === 'DIESEL' ? 'rgba(0,184,255,0.12)' : 'rgba(255,201,40,0.12)', borderColor: truck.fuel_type === 'DIESEL' ? 'rgba(0,184,255,0.3)' : 'rgba(255,201,40,0.3)' }]}>
                      <Ionicons name="water" size={11} color={truck.fuel_type === 'DIESEL' ? C.neon : C.yellow} style={{ marginRight: 4 }} />
                      <Text style={[styles.fuelBadgeText, { color: truck.fuel_type === 'DIESEL' ? C.neon : C.yellow }]}>
                        {truck.fuel_type} · {truck.capacity_liters || 0}L
                      </Text>
                    </View>
                  </View>

                  <View style={styles.driverSection}>
                    {truck.driver ? (
                      <View style={styles.driverRow}>
                        <View style={styles.driverAvatar}>
                          <Ionicons name="person" size={16} color={C.green} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.driverLabel}>Assigned Driver</Text>
                          <Text style={styles.driverName}>{truck.driver_name} {truck.driver_mobile ? `· ${truck.driver_mobile}` : ''}</Text>
                        </View>
                        <TouchableOpacity style={styles.changeDrvBtn} onPress={() => openAssignModal(truck)} activeOpacity={0.8}>
                          <Text style={styles.changeDrvText}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.driverRow}>
                        <View style={[styles.driverAvatar, { backgroundColor: 'rgba(255,201,40,0.1)', borderColor: 'rgba(255,201,40,0.3)' }]}>
                          <Ionicons name="alert" size={16} color={C.yellow} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.driverLabel, { color: C.yellow }]}>No Driver Assigned</Text>
                          <Text style={styles.driverName}>Assign one of your drivers</Text>
                        </View>
                        <TouchableOpacity style={[styles.changeDrvBtn, { backgroundColor: C.yellow }]} onPress={() => openAssignModal(truck)} activeOpacity={0.85}>
                          <Text style={[styles.changeDrvText, { color: C.night }]}>Assign</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ──────────── TAB 2: DRIVERS ──────────── */}
        {activeTab === 'drivers' && (
          <View>
            {loading && !refreshing ? (
              <View style={styles.centerBox}><ActivityIndicator size="large" color={C.neon} /></View>
            ) : drivers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={48} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Drivers Added</Text>
                <Text style={styles.emptySubtitle}>Click "+ Add Driver" to create a driver with an auto-generated password.</Text>
              </View>
            ) : (
              drivers.map((drv) => (
                <View key={drv.id} style={styles.truckCard}>
                  <View style={[styles.truckAccent, { backgroundColor: drv.is_active !== false ? C.green : C.red }]} />
                  <View style={styles.driverCardHeader}>
                    <View style={[styles.driverAvatarWrap, { borderColor: drv.is_active !== false ? '#86EFAC' : '#FECACA', backgroundColor: drv.is_active !== false ? '#DCFCE7' : '#FEE2E2' }]}>
                      <Text style={[styles.driverAvatarTxt, { color: drv.is_active !== false ? C.green : C.red }]}>
                        {(drv.first_name || 'D').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverHeaderName}>{drv.full_name || drv.first_name}</Text>
                      <Text style={styles.driverEmpId}>ID: {drv.employee_id || `DRIV${drv.id}`}</Text>
                    </View>

                    {/* Status Pill Badge */}
                    <View style={[styles.statusPill, drv.is_active !== false ? styles.activePillBg : styles.inactivePillBg]}>
                      <View style={[styles.statusDot, drv.is_active !== false ? styles.activeDotBg : styles.inactiveDotBg]} />
                      <Text style={[styles.statusPillText, drv.is_active !== false ? styles.activePillText : styles.inactivePillText]}>
                        {drv.is_active !== false ? 'ACTIVE' : 'DEACTIVATED'}
                      </Text>
                    </View>
                  </View>

                  {/* ── Driver Credentials & Assignment Box ── */}
                  <View style={styles.drvCredContainer}>
                    <View style={styles.drvCredRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="call-outline" size={13} color={C.neon} style={{ marginRight: 6 }} />
                        <Text style={styles.drvCredLabel}>Login ID (Mobile):</Text>
                      </View>
                      <Text style={styles.drvCredVal}>{drv.mobile_number || '—'}</Text>
                    </View>

                    <View style={[styles.drvCredRow, { marginTop: 6 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="key-outline" size={13} color={C.yellow} style={{ marginRight: 6 }} />
                        <Text style={styles.drvCredLabel}>Password:</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {drv.password ? (
                          <>
                            <Text style={[styles.drvCredVal, { color: C.yellow, marginRight: 6, letterSpacing: visiblePasswords[drv.id] ? 0.5 : 2 }]}>
                              {visiblePasswords[drv.id] ? drv.password : '••••••••'}
                            </Text>
                            <View style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                              <Text style={{ fontSize: 9, color: C.yellow, fontWeight: '800' }}>TEMP</Text>
                            </View>
                            <TouchableOpacity onPress={() => togglePasswordVisibility(drv.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons
                                name={visiblePasswords[drv.id] ? "eye-off-outline" : "eye-outline"}
                                size={16}
                                color={C.textSub}
                              />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="lock-closed" size={12} color={C.green} style={{ marginRight: 4 }} />
                            <Text style={[styles.drvCredVal, { color: C.textMuted, fontSize: 12, fontStyle: 'italic' }]}>
                              Set by Driver
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={[styles.drvCredRow, { marginTop: 6 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="bus-outline" size={13} color={C.primary} style={{ marginRight: 6 }} />
                        <Text style={styles.drvCredLabel}>Assigned Truck:</Text>
                      </View>
                      <View style={[styles.assignedStatusBadge, drv.is_assigned ? { borderColor: 'rgba(0,200,83,0.4)', backgroundColor: 'rgba(0,200,83,0.12)' } : { borderColor: 'rgba(255,201,40,0.4)', backgroundColor: 'rgba(255,201,40,0.12)' }]}>
                        <Text style={[styles.assignedStatusTxt, drv.is_assigned ? { color: C.green } : { color: C.yellow }]}>
                          {drv.is_assigned ? drv.assigned_truck_number : 'Unassigned'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* ── Action Buttons Row: Activate / Deactivate & Delete ── */}
                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={[
                        styles.drvActionBtn,
                        drv.is_active !== false ? styles.deactivateBtn : styles.activateBtn
                      ]}
                      onPress={() => handleToggleDriverStatus(drv)}
                      disabled={driverActionLoadingId === drv.id}
                      activeOpacity={0.8}
                    >
                      {driverActionLoadingId === drv.id ? (
                        <ActivityIndicator size="small" color={drv.is_active !== false ? '#B45309' : C.green} />
                      ) : (
                        <>
                          <Ionicons
                            name={drv.is_active !== false ? "pause-circle-outline" : "checkmark-circle-outline"}
                            size={15}
                            color={drv.is_active !== false ? '#B45309' : C.green}
                            style={{ marginRight: 5 }}
                          />
                          <Text style={[styles.drvActionBtnText, drv.is_active !== false ? { color: '#B45309' } : { color: C.green }]}>
                            {drv.is_active !== false ? 'Deactivate ID' : 'Activate ID'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.drvActionBtn, styles.deleteBtn]}
                      onPress={() => handleDeleteDriver(drv)}
                      disabled={driverActionLoadingId === drv.id}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={15} color={C.red} style={{ marginRight: 5 }} />
                      <Text style={[styles.drvActionBtnText, { color: C.red }]}>Delete ID</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ──────────── TAB 3: FUEL REQUESTS ──────────── */}
        {activeTab === 'requests' && (
          <View>
            {requests.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={48} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Fuel Requests Yet</Text>
                <Text style={styles.emptySubtitle}>When your drivers submit fuel requests at pump stations, logs appear here.</Text>
              </View>
            ) : (
              requests.map((item) => {
                const s = STATUS_MAP[item.status] || STATUS_MAP.PENDING;
                return (
                  <View key={item.id} style={styles.reqCard}>
                    <View style={styles.reqCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reqNumber}>{item.request_number || `REQ-${item.id}`}</Text>
                        <Text style={styles.reqTruckPlate}>{item.truck_number || 'Truck'}</Text>
                      </View>
                      <View style={[styles.reqStatusBadge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.reqStatusText, { color: s.text }]}>{item.status}</Text>
                      </View>
                    </View>

                    <View style={styles.reqDetailsRow}>
                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>Fuel</Text>
                        <Text style={styles.reqDetailVal}>{item.fuel_type}</Text>
                      </View>
                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>Requested</Text>
                        <Text style={[styles.reqDetailVal, { color: C.yellow }]}>{item.requested_liters} L</Text>
                      </View>
                      <View style={styles.reqDetailItem}>
                        <Text style={styles.reqDetailLabel}>Approved</Text>
                        <Text style={[styles.reqDetailVal, { color: C.neon }]}>{item.approved_liters ? `${item.approved_liters} L` : '—'}</Text>
                      </View>
                    </View>

                    <View style={styles.reqFooter}>
                      <Ionicons name="person-outline" size={12} color={C.textMuted} style={{ marginRight: 4 }} />
                      <Text style={styles.reqFooterText}>Driver: {item.driver_name || 'Assigned'}</Text>
                      <Text style={styles.reqFooterDot}>•</Text>
                      <Ionicons name="business-outline" size={12} color={C.textMuted} style={{ marginRight: 4 }} />
                      <Text style={styles.reqFooterText}>{item.pump_name || 'Station'}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Modal 1: Add Truck ── */}
      <Modal visible={addTruckVisible} transparent animationType="slide" onRequestClose={() => setAddTruckVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Truck to Fleet</Text>
            <Text style={styles.modalSubtitle}>Register a commercial transport vehicle under your account</Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>TRUCK PLATE NUMBER</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. MH12AB1234"
                placeholderTextColor={C.textMuted}
                value={newTruckNumber}
                onChangeText={setNewTruckNumber}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>TANK CAPACITY (LITERS)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 250"
                placeholderTextColor={C.textMuted}
                value={newCapacity}
                onChangeText={setNewCapacity}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>FUEL TYPE</Text>
              <View style={styles.fuelToggleRow}>
                {['DIESEL', 'PETROL'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.fuelToggleBtn, newFuelType === type && styles.fuelToggleBtnActive]}
                    onPress={() => setNewFuelType(type)}
                  >
                    <Text style={[styles.fuelToggleText, newFuelType === type && styles.fuelToggleTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddTruckVisible(false)} disabled={submittingTruck}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleCreateTruck} disabled={submittingTruck} activeOpacity={0.85}>
                {submittingTruck ? <ActivityIndicator color={C.white} /> : <Text style={styles.modalConfirmText}>Save Truck</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal 2: Create Driver ── */}
      <Modal visible={createDriverVisible} transparent animationType="slide" onRequestClose={() => setCreateDriverVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Commercial Driver</Text>
            <Text style={styles.modalSubtitle}>System will auto-generate an 8-digit numeric password</Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>DRIVER FULL NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Deepak Verma"
                placeholderTextColor={C.textMuted}
                value={drvName}
                onChangeText={setDrvName}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>MOBILE NUMBER (WILL BE DRIVER'S LOGIN ID)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={C.textMuted}
                value={drvMobile}
                onChangeText={setDrvMobile}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.autoGenNote}>
              <Ionicons name="information-circle-outline" size={16} color={C.yellow} style={{ marginRight: 6 }} />
              <Text style={styles.autoGenNoteText}>
                An 8-digit numeric password will be randomly generated. The driver will log in with role 'DRIVER' and mobile number.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCreateDriverVisible(false)} disabled={submittingDriver}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: C.green }]} onPress={handleCreateDriver} disabled={submittingDriver} activeOpacity={0.85}>
                {submittingDriver ? <ActivityIndicator color={C.night} /> : <Text style={[styles.modalConfirmText, { color: C.night }]}>Create Driver</Text>}
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
                <Text style={styles.credLabel}>LOGIN MOBILE ID:</Text>
                <Text style={styles.credVal}>{credModal.username}</Text>
              </View>
              {credModal.password && (
                <View style={[styles.credRow, { marginTop: 10 }]}>
                  <Text style={styles.credLabel}>8-DIGIT NUMERIC PASSWORD:</Text>
                  <Text style={[styles.credVal, { color: C.yellow, fontSize: 16 }]}>{credModal.password}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.credOkBtn} onPress={() => setCredModal({ ...credModal, visible: false })}>
              <Text style={styles.credOkBtnText}>Share & Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal 4: Assign Driver to Truck ── */}
      <Modal visible={assignModalVisible} transparent animationType="slide" onRequestClose={closeAssignModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Assign Driver to Truck</Text>
            <Text style={styles.modalSubtitle}>Vehicle: {selectedTruck?.truck_number}</Text>

            <ScrollView style={{ maxHeight: 260, marginVertical: 12 }}>
              {drivers.filter((d: any) => d.is_active !== false).length === 0 ? (
                <Text style={{ color: C.textSub, textAlign: 'center', marginVertical: 20 }}>
                  No active drivers available. Activate a driver or add a new driver first!
                </Text>
              ) : (
                drivers.filter((d: any) => d.is_active !== false).map((drv) => (
                  <TouchableOpacity
                    key={drv.id}
                    style={styles.driverSelectItem}
                    onPress={() => handleAssignDriver(drv.id)}
                    disabled={assigningDriverId === drv.id}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverSelectName}>{drv.full_name || drv.first_name}</Text>
                      <Text style={styles.driverSelectMobile}>{drv.mobile_number}</Text>
                    </View>
                    {assigningDriverId === drv.id ? (
                      <ActivityIndicator size="small" color={C.neon} />
                    ) : (
                      <Text style={styles.driverSelectAction}>Select</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={styles.modalCancelBtn} onPress={closeAssignModal}>
              <Text style={styles.modalCancelText}>Close</Text>
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
  rolePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0F2FE', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 6, alignSelf: 'flex-start' },
  rolePillText: { fontSize: 10, fontWeight: '800', color: C.primary, letterSpacing: 1.5 },
  headerName: { fontSize: 22, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  avatarBtn: {},
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E0F2FE', borderWidth: 2, borderColor: '#38BDF8', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: C.primary },
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
  truckCard: { backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.nightBorder, overflow: 'hidden', shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  truckAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  truckHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  plateBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFDE7', borderRadius: 6, borderWidth: 1.5, borderColor: '#0B1220', overflow: 'hidden' },
  plateBlue: { backgroundColor: '#0284C7', paddingHorizontal: 5, paddingVertical: 4 },
  plateBlueTxt: { color: C.white, fontSize: 8, fontWeight: '800' },
  plateNum: { color: '#0B1220', fontWeight: '900', fontSize: 14, letterSpacing: 1.5, paddingHorizontal: 8 },
  fuelBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  fuelBadgeText: { fontSize: 11, fontWeight: '800' },
  driverSection: { borderTopWidth: 1, borderTopColor: C.nightBorder, paddingTop: 10 },
  driverRow: { flexDirection: 'row', alignItems: 'center' },
  driverAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  driverLabel: { fontSize: 10, color: C.textSub, fontWeight: '700', textTransform: 'uppercase' },
  driverName: { fontSize: 13, color: C.text, fontWeight: '700' },
  changeDrvBtn: { backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  changeDrvText: { color: C.primary, fontWeight: '700', fontSize: 12 },
  driverCardHeader: { flexDirection: 'row', alignItems: 'center' },
  driverAvatarWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DCFCE7', borderWidth: 1.5, borderColor: C.green, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  driverAvatarTxt: { fontSize: 16, fontWeight: '800', color: C.green },
  driverHeaderName: { fontSize: 15, fontWeight: '800', color: C.text },
  driverHeaderPhone: { fontSize: 12, color: C.textSub, marginTop: 2 },
  assignedStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  assignedStatusTxt: { fontSize: 11, fontWeight: '800' },
  reqCard: { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.nightBorder, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  reqCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  reqNumber: { fontSize: 14, fontWeight: '800', color: C.text },
  reqTruckPlate: { fontSize: 12, color: C.primary, fontWeight: '700', marginTop: 1 },
  reqStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  reqStatusText: { fontSize: 11, fontWeight: '800' },
  reqDetailsRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, marginBottom: 10 },
  reqDetailItem: { flex: 1 },
  reqDetailLabel: { fontSize: 10, color: C.textSub, textTransform: 'uppercase', fontWeight: '700' },
  reqDetailVal: { fontSize: 13, color: C.text, fontWeight: '800', marginTop: 2 },
  reqFooter: { flexDirection: 'row', alignItems: 'center' },
  reqFooterText: { fontSize: 11, color: C.textSub },
  reqFooterDot: { color: C.textMuted, marginHorizontal: 6, fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, borderWidth: 1, borderColor: C.nightBorder },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', marginTop: 3, marginBottom: 16 },
  modalInputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textSub, letterSpacing: 0.8, marginBottom: 5 },
  textInput: { backgroundColor: '#F8FAFC', borderRadius: 10, paddingHorizontal: 12, height: 46, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.nightBorder },
  fuelToggleRow: { flexDirection: 'row', gap: 10 },
  fuelToggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: C.nightBorder, alignItems: 'center' },
  fuelToggleBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  fuelToggleText: { fontSize: 12, fontWeight: '700', color: C.textSub },
  fuelToggleTextActive: { color: C.white, fontWeight: '800' },
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
  driverSelectItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: C.nightBorder },
  driverSelectName: { fontSize: 14, fontWeight: '700', color: C.text },
  driverSelectMobile: { fontSize: 11, color: C.textSub, marginTop: 2 },
  driverSelectAction: { fontSize: 12, fontWeight: '800', color: C.primary },
  driverEmpId: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 1 },
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
  activePillText: {
    color: '#15803D',
  },
  inactivePillText: {
    color: '#B91C1C',
  },
  drvCredContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: C.nightBorder,
  },
  drvCredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  drvCredLabel: {
    fontSize: 11,
    color: C.textSub,
    fontWeight: '700',
  },
  drvCredVal: {
    fontSize: 12,
    color: C.text,
    fontWeight: '800',
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.nightBorder,
  },
  drvActionBtn: {
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
  drvActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
});
