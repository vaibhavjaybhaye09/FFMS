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

const C = {
  primary:    '#1565C0',
  yellow:     '#FFC928',
  white:      '#FFFFFF',
  red:        '#E53935',
  night:      '#0B1220',
  nightCard:  '#121C30',
  nightCard2: '#0D1626',
  nightBorder:'#1E2E4A',
  neon:       '#00B8FF',
  green:      '#00C853',
  textMuted:  '#627794',
  textSub:    '#8FA3BF',
};

const STATUS_MAP: Record<string, { bg: string; text: string }> = {
  COMPLETED: { bg: 'rgba(0,200,83,0.12)',   text: '#00C853' },
  APPROVED:  { bg: 'rgba(0,184,255,0.12)',  text: '#00B8FF' },
  VERIFIED:  { bg: 'rgba(0,184,255,0.12)',  text: '#00B8FF' },
  REJECTED:  { bg: 'rgba(229,57,53,0.12)', text: '#E53935' },
  PENDING:   { bg: 'rgba(255,201,40,0.12)', text: '#FFC928' },
};

export default function CustomerScreen() {
  const router = useRouter();

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

  const statItems = [
    { icon: 'bus', color: C.neon, bg: 'rgba(0,184,255,0.12)', label: 'Total Trucks', val: stats.total_trucks },
    { icon: 'person', color: C.green, bg: 'rgba(0,200,83,0.12)', label: 'Drivers', val: drivers.length },
    { icon: 'checkmark-circle', color: C.yellow, bg: 'rgba(255,201,40,0.12)', label: 'Assigned', val: stats.assigned_trucks },
    { icon: 'water', color: '#9C27B0', bg: 'rgba(156,39,176,0.12)', label: 'Requests', val: requests.length },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.night} />

      {/* ── Hero Header ── */}
      <ImageBackground
        source={require('../assets/images/pump2.jpg')}
        style={styles.heroBg}
        resizeMode="cover"
      >
        <View style={styles.heroOverlay} />
        <View style={styles.neonBar} />

        <View style={styles.headerRow}>
          <View>
            <View style={styles.rolePill}>
              <Ionicons name="shield-checkmark" size={11} color={C.neon} style={{ marginRight: 4 }} />
              <Text style={styles.rolePillText}>TRUCK OWNER • FLEET</Text>
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
      </ImageBackground>

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
            <Text style={[styles.actionBtnText, { color: C.neon }]}>+ Add Truck</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: 'rgba(0,200,83,0.15)', borderColor: 'rgba(0,200,83,0.5)' }]}
            onPress={() => setCreateDriverVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={18} color={C.green} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.green }]}>+ Add Driver</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tab Bar ── */}
        <View style={styles.tabBar}>
          {[
            { key: 'trucks',   icon: 'bus',            label: `Trucks (${trucks.length})` },
            { key: 'drivers',  icon: 'people-outline', label: `Drivers (${drivers.length})` },
            { key: 'requests', icon: 'receipt-outline', label: `Requests (${requests.length})` },
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
                  <View style={[styles.truckAccent, { backgroundColor: C.green }]} />
                  <View style={styles.driverCardHeader}>
                    <View style={styles.driverAvatarWrap}>
                      <Text style={styles.driverAvatarTxt}>{(drv.first_name || 'D').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverHeaderName}>{drv.full_name || drv.first_name}</Text>
                      <Text style={styles.driverHeaderPhone}>Login ID: {drv.mobile_number}</Text>
                    </View>
                    <View style={[styles.assignedStatusBadge, drv.is_assigned ? { borderColor: 'rgba(0,200,83,0.4)', backgroundColor: 'rgba(0,200,83,0.12)' } : { borderColor: 'rgba(255,201,40,0.4)', backgroundColor: 'rgba(255,201,40,0.12)' }]}>
                      <Text style={[styles.assignedStatusTxt, drv.is_assigned ? { color: C.green } : { color: C.yellow }]}>
                        {drv.is_assigned ? `Truck: ${drv.assigned_truck_number}` : 'Unassigned'}
                      </Text>
                    </View>
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
              {drivers.length === 0 ? (
                <Text style={{ color: C.textSub, textAlign: 'center', marginVertical: 20 }}>
                  No drivers registered yet. Add a driver first!
                </Text>
              ) : (
                drivers.map((drv) => (
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
  heroBg: { width: '100%' },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,18,32,0.82)' },
  neonBar: { height: 3, backgroundColor: C.neon, shadowColor: C.neon, shadowOpacity: 1, shadowRadius: 8, elevation: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 22 },
  rolePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,184,255,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.neon, marginBottom: 6, alignSelf: 'flex-start' },
  rolePillText: { fontSize: 10, fontWeight: '800', color: C.neon, letterSpacing: 1.5 },
  headerName: { fontSize: 22, fontWeight: '800', color: C.white },
  headerSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  avatarBtn: {},
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,184,255,0.12)', borderWidth: 2, borderColor: C.neon, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: C.neon },
  scrollContent: { padding: 16, paddingBottom: 50 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: C.nightCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.nightBorder },
  statIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statVal: { fontSize: 24, fontWeight: '900', color: C.white, marginBottom: 2 },
  statLabel: { fontSize: 11, color: C.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  tabBar: { flexDirection: 'row', backgroundColor: C.nightCard2, borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: C.nightBorder },
  tabItem: { flex: 1, flexDirection: 'row', paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabItemActive: { backgroundColor: C.neon },
  tabText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  tabTextActive: { color: C.night },
  centerBox: { padding: 40, alignItems: 'center' },
  emptyCard: { backgroundColor: C.nightCard, borderRadius: 16, padding: 36, alignItems: 'center', borderWidth: 1, borderColor: C.nightBorder },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.white, marginTop: 12, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', lineHeight: 18 },
  truckCard: { backgroundColor: C.nightCard, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.nightBorder, overflow: 'hidden' },
  truckAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  truckHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  plateBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#050B14', borderRadius: 6, borderWidth: 1, borderColor: '#1E2D45', overflow: 'hidden' },
  plateBlue: { backgroundColor: '#003399', paddingHorizontal: 5, paddingVertical: 4 },
  plateBlueTxt: { color: C.white, fontSize: 8, fontWeight: '800' },
  plateNum: { color: C.white, fontWeight: '800', fontSize: 14, letterSpacing: 1.5, paddingHorizontal: 8 },
  fuelBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  fuelBadgeText: { fontSize: 11, fontWeight: '800' },
  driverSection: { borderTopWidth: 1, borderTopColor: C.nightBorder, paddingTop: 10 },
  driverRow: { flexDirection: 'row', alignItems: 'center' },
  driverAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,200,83,0.1)', borderWidth: 1, borderColor: 'rgba(0,200,83,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  driverLabel: { fontSize: 10, color: C.textSub, fontWeight: '700', textTransform: 'uppercase' },
  driverName: { fontSize: 13, color: C.white, fontWeight: '600' },
  changeDrvBtn: { backgroundColor: 'rgba(0,184,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.neon },
  changeDrvText: { color: C.neon, fontWeight: '700', fontSize: 12 },
  driverCardHeader: { flexDirection: 'row', alignItems: 'center' },
  driverAvatarWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,200,83,0.12)', borderWidth: 1.5, borderColor: C.green, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  driverAvatarTxt: { fontSize: 16, fontWeight: '800', color: C.green },
  driverHeaderName: { fontSize: 15, fontWeight: '800', color: C.white },
  driverHeaderPhone: { fontSize: 12, color: C.textSub, marginTop: 2 },
  assignedStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  assignedStatusTxt: { fontSize: 11, fontWeight: '800' },
  reqCard: { backgroundColor: C.nightCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.nightBorder },
  reqCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  reqNumber: { fontSize: 14, fontWeight: '800', color: C.white },
  reqTruckPlate: { fontSize: 12, color: C.neon, fontWeight: '600', marginTop: 1 },
  reqStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  reqStatusText: { fontSize: 11, fontWeight: '800' },
  reqDetailsRow: { flexDirection: 'row', backgroundColor: C.nightCard2, borderRadius: 8, padding: 10, marginBottom: 10 },
  reqDetailItem: { flex: 1 },
  reqDetailLabel: { fontSize: 10, color: C.textSub, textTransform: 'uppercase', fontWeight: '700' },
  reqDetailVal: { fontSize: 13, color: C.white, fontWeight: '800', marginTop: 2 },
  reqFooter: { flexDirection: 'row', alignItems: 'center' },
  reqFooterText: { fontSize: 11, color: C.textSub },
  reqFooterDot: { color: C.textMuted, marginHorizontal: 6, fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.nightCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, borderWidth: 1, borderColor: C.nightBorder },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.nightBorder, alignSelf: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: C.white, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', marginTop: 3, marginBottom: 16 },
  modalInputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textSub, letterSpacing: 0.8, marginBottom: 5 },
  textInput: { backgroundColor: C.nightCard2, borderRadius: 10, paddingHorizontal: 12, height: 46, color: C.white, fontSize: 14, borderWidth: 1, borderColor: C.nightBorder },
  fuelToggleRow: { flexDirection: 'row', gap: 10 },
  fuelToggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.nightCard2, borderWidth: 1, borderColor: C.nightBorder, alignItems: 'center' },
  fuelToggleBtnActive: { backgroundColor: C.neon, borderColor: C.neon },
  fuelToggleText: { fontSize: 12, fontWeight: '700', color: C.textSub },
  fuelToggleTextActive: { color: C.night, fontWeight: '800' },
  autoGenNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,201,40,0.1)', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,201,40,0.3)', marginBottom: 16 },
  autoGenNoteText: { fontSize: 11, color: C.yellow, flex: 1, lineHeight: 16 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: C.nightCard2, alignItems: 'center', borderWidth: 1, borderColor: C.nightBorder },
  modalCancelText: { color: C.textSub, fontWeight: '700', fontSize: 14 },
  modalConfirmBtn: { flex: 1.5, paddingVertical: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { color: C.white, fontWeight: '800', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  credCard: { backgroundColor: C.nightCard, borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: C.nightBorder, alignItems: 'center' },
  credIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,201,40,0.12)', borderWidth: 1, borderColor: 'rgba(255,201,40,0.4)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  credTitle: { fontSize: 17, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: 6 },
  credNote: { fontSize: 12, color: C.textSub, textAlign: 'center', lineHeight: 17, marginBottom: 16 },
  credBox: { width: '100%', backgroundColor: C.nightCard2, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.nightBorder, marginBottom: 18 },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  credLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700' },
  credVal: { fontSize: 14, color: C.neon, fontWeight: '800', letterSpacing: 0.5 },
  credOkBtn: { backgroundColor: C.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 36, width: '100%', alignItems: 'center' },
  credOkBtnText: { color: C.white, fontSize: 14, fontWeight: '800' },
  driverSelectItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.nightCard2, padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: C.nightBorder },
  driverSelectName: { fontSize: 14, fontWeight: '700', color: C.white },
  driverSelectMobile: { fontSize: 11, color: C.textSub, marginTop: 2 },
  driverSelectAction: { fontSize: 12, fontWeight: '800', color: C.neon },
});
