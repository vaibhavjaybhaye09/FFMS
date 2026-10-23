import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../src/api/client';
import { getUser } from '../src/storage/token';
import { useTranslation } from '../src/i18n/LanguageContext';

const { width } = Dimensions.get('window');

const C = {
  primary:    '#0284C7',
  primaryDark:'#0369A1',
  yellow:     '#D97706',
  yellowLight:'#FEF3C7',
  white:      '#FFFFFF',
  red:        '#DC2626',
  redLight:   '#FEE2E2',
  night:      '#F8FAFC',
  card:       '#FFFFFF',
  card2:      '#F1F5F9',
  border:     '#E2E8F0',
  borderStrong:'#CBD5E1',
  neon:       '#0284C7',
  green:      '#16A34A',
  greenLight: '#DCFCE7',
  text:       '#0F172A',
  textMuted:  '#64748B',
  textSub:    '#334155',
};

const STATUS_MAP: Record<string, { bg: string; text: string; icon: any }> = {
  COMPLETED: { bg: '#DCFCE7', text: '#16A34A', icon: 'checkmark-done-circle' },
  APPROVED:  { bg: '#E0F2FE', text: '#0284C7', icon: 'checkmark-circle' },
  VERIFIED:  { bg: '#DCFCE7', text: '#16A34A', icon: 'shield-checkmark' },
  REJECTED:  { bg: '#FEE2E2', text: '#DC2626', icon: 'close-circle' },
  PENDING:   { bg: '#FEF3C7', text: '#D97706', icon: 'time' },
};

export default function CustomerScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'trucks' | 'bulk_request' | 'requests'>('trucks');
  const [customerUser, setCustomerUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState({
    total_trucks: 0,
    active_trucks: 0,
    eligible_trucks: 0,
    total_requests: 0,
    pending_requests: 0,
    approved_requests: 0,
    completed_requests: 0,
    rejected_requests: 0,
  });

  const [trucks, setTrucks] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [pumps, setPumps] = useState<any[]>([]);
  const [selectedPumpId, setSelectedPumpId] = useState<number | null>(null);

  // Modal: Add Truck
  const [addTruckVisible, setAddTruckVisible] = useState(false);
  const [newTruckNumber, setNewTruckNumber] = useState('');
  const [newFuelType, setNewFuelType] = useState('DIESEL');
  const [newCapacity, setNewCapacity] = useState('250');
  const [submittingTruck, setSubmittingTruck] = useState(false);

  // Modal: Edit Truck
  const [editTruckVisible, setEditTruckVisible] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [editFuelType, setEditFuelType] = useState('DIESEL');
  const [editCapacity, setEditCapacity] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [updatingTruck, setUpdatingTruck] = useState(false);

  // Bulk Request State
  const [selectedTruckIds, setSelectedTruckIds] = useState<number[]>([]);
  const [truckLiters, setTruckLiters] = useState<Record<number, string>>({});
  const [truckRemarks, setTruckRemarks] = useState<Record<number, string>>({});
  const [bulkReviewModal, setBulkReviewModal] = useState(false);
  const [submittingBulk, setSubmittingBulk] = useState(false);

  // Filter for requests
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED'>('ALL');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh && refreshing) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const user = await getUser();
      setCustomerUser(user);

      const [trucksRes, statsRes, reqRes, pumpsRes] = await Promise.all([
        apiClient.get('/api/customer/trucks/').catch(() => ({ data: { trucks: [] } })),
        apiClient.get('/api/customer/dashboard/').catch(() => ({ data: {} })),
        apiClient.get('/api/customer/fuel-requests/').catch(() => ({ data: { fuel_requests: [] } })),
        apiClient.get('/api/pumps/').catch(() => ({ data: { pumps: [] } })),
      ]);

      const loadedTrucks = trucksRes.data?.trucks || [];
      const loadedRequests = reqRes.data?.fuel_requests || [];
      const loadedPumps = pumpsRes.data?.pumps || [];

      setTrucks(loadedTrucks);
      setRequests(loadedRequests);
      setPumps(loadedPumps);

      if (loadedPumps.length > 0 && selectedPumpId === null) {
        const userPumpId = user?.pump?.id;
        const matchingPump = loadedPumps.find((p: any) => p.id === userPumpId);
        setSelectedPumpId(matchingPump ? matchingPump.id : loadedPumps[0].id);
      }

      if (statsRes.data?.stats) {
        setStats(statsRes.data.stats);
      } else {
        const eligibleCount = loadedTrucks.filter((t: any) => t.is_eligible_for_request).length;
        setStats({
          total_trucks: loadedTrucks.length,
          active_trucks: loadedTrucks.filter((t: any) => t.is_active).length,
          eligible_trucks: eligibleCount,
          total_requests: loadedRequests.length,
          pending_requests: loadedRequests.filter((r: any) => r.status === 'PENDING').length,
          approved_requests: loadedRequests.filter((r: any) => r.status === 'APPROVED').length,
          completed_requests: loadedRequests.filter((r: any) => r.status === 'COMPLETED').length,
          rejected_requests: loadedRequests.filter((r: any) => r.status === 'REJECTED').length,
        });
      }
    } catch (error: any) {
      console.error('Error loading customer dashboard:', error);
      Alert.alert('Refresh Failed', 'Could not refresh latest data. Keeping current view.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, selectedPumpId]);

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    loadData(true);
  };

  // ── TRUCK MANAGEMENT ─────────────────────────────────────────

  const handleCreateTruck = async () => {
    const cleanNumber = newTruckNumber.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanNumber) {
      Alert.alert('Missing Field', 'Please enter a truck registration number.');
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
      Alert.alert('🚛 Truck Registered', `Truck ${cleanNumber} has been successfully added to your fleet.`);
      setNewTruckNumber('');
      setAddTruckVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert(
        'Creation Failed',
        err?.response?.data?.truck_number?.[0] || err?.response?.data?.error || 'Failed to create truck.'
      );
    } finally {
      setSubmittingTruck(false);
    }
  };

  const openEditTruckModal = (truck: any) => {
    setEditingTruck(truck);
    setEditFuelType(truck.fuel_type || 'DIESEL');
    setEditCapacity(String(truck.capacity_liters || ''));
    setEditIsActive(truck.is_active !== false);
    setEditTruckVisible(true);
  };

  const handleUpdateTruck = async () => {
    if (!editingTruck) return;
    const capacity = parseInt(editCapacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      Alert.alert('Invalid Capacity', 'Please enter a valid tank capacity.');
      return;
    }

    setUpdatingTruck(true);
    try {
      await apiClient.patch(`/api/trucks/${editingTruck.id}/update/`, {
        fuel_type: editFuelType,
        capacity_liters: capacity,
        is_active: editIsActive,
      });
      Alert.alert('Truck Updated', `Truck ${editingTruck.truck_number} updated successfully.`);
      setEditTruckVisible(false);
      setEditingTruck(null);
      loadData();
    } catch (err: any) {
      Alert.alert('Update Failed', err?.response?.data?.error || 'Failed to update truck details.');
    } finally {
      setUpdatingTruck(false);
    }
  };

  const handleDeleteTruck = (truck: any) => {
    Alert.alert(
      'Delete Truck',
      `Are you sure you want to delete Truck ${truck.truck_number} from your fleet?\n\nThis operation cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Truck',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/trucks/${truck.id}/delete/`);
              Alert.alert('Deleted', `Truck ${truck.truck_number} has been deleted.`);
              loadData();
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.response?.data?.error || 'Could not delete truck.');
            }
          },
        },
      ]
    );
  };

  // ── BULK REQUEST MANAGEMENT ──────────────────────────────────

  const eligibleTrucks = useMemo(() => {
    return trucks.filter((t) => t.is_eligible_for_request);
  }, [trucks]);

  const handleToggleTruckSelection = (truck: any) => {
    if (!truck.is_eligible_for_request) {
      Alert.alert(
        'Truck Ineligible',
        `Truck ${truck.truck_number} currently has an active request (${truck.active_request_number} - ${truck.active_request_status}).\n\nOnly trucks without pending/approved requests can be selected.`
      );
      return;
    }

    const tId = truck.id;
    if (selectedTruckIds.includes(tId)) {
      setSelectedTruckIds((prev) => prev.filter((id) => id !== tId));
    } else {
      setSelectedTruckIds((prev) => [...prev, tId]);
      if (!truckLiters[tId]) {
        setTruckLiters((prev) => ({
          ...prev,
          [tId]: String(truck.capacity_liters || '200'),
        }));
      }
    }
  };

  const handleSelectAllEligible = () => {
    const allEligibleIds = eligibleTrucks.map((t) => t.id);
    setSelectedTruckIds(allEligibleIds);

    const newLiters: Record<number, string> = { ...truckLiters };
    eligibleTrucks.forEach((t) => {
      if (!newLiters[t.id]) {
        newLiters[t.id] = String(t.capacity_liters || '200');
      }
    });
    setTruckLiters(newLiters);
  };

  const handleClearSelection = () => {
    setSelectedTruckIds([]);
  };

  const handleQuickRequestTruck = (truck: any) => {
    if (!truck.is_eligible_for_request) {
      Alert.alert(
        'Request Active',
        `Truck ${truck.truck_number} already has an active request (${truck.active_request_number}).`
      );
      return;
    }
    setSelectedTruckIds([truck.id]);
    setTruckLiters((prev) => ({
      ...prev,
      [truck.id]: String(truck.capacity_liters || '200'),
    }));
    setActiveTab('bulk_request');
  };

  const totalSelectedLiters = useMemo(() => {
    return selectedTruckIds.reduce((sum, id) => {
      const val = parseFloat(truckLiters[id] || '0');
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [selectedTruckIds, truckLiters]);

  const handleOpenReviewModal = () => {
    if (selectedTruckIds.length === 0) {
      Alert.alert('No Trucks Selected', 'Please select at least one truck to submit a fuel request.');
      return;
    }
    if (!selectedPumpId) {
      Alert.alert('Select Station', 'Please choose a pump station where fuel will be dispensed.');
      return;
    }

    for (const tId of selectedTruckIds) {
      const trk = trucks.find((t) => t.id === tId);
      const ltr = parseFloat(truckLiters[tId] || '0');
      if (isNaN(ltr) || ltr <= 0) {
        Alert.alert('Invalid Liters', `Please enter a valid requested fuel quantity for Truck ${trk?.truck_number}.`);
        return;
      }
      if (trk?.capacity_liters && ltr > trk.capacity_liters) {
        Alert.alert(
          'Capacity Exceeded',
          `Requested fuel for ${trk.truck_number} (${ltr}L) exceeds its tank capacity of ${trk.capacity_liters}L.`
        );
        return;
      }
    }

    setBulkReviewModal(true);
  };

  const handleSubmitBulkRequests = async () => {
    setSubmittingBulk(true);
    try {
      const items = selectedTruckIds.map((tId) => {
        const trk = trucks.find((t) => t.id === tId);
        return {
          truck_id: tId,
          requested_liters: parseFloat(truckLiters[tId] || String(trk?.capacity_liters || '200')),
          fuel_type: trk?.fuel_type || 'DIESEL',
          remarks: truckRemarks[tId] || 'Bulk dispatch fueling',
        };
      });

      const response = await apiClient.post('/api/fuel-requests/bulk-create/', {
        pump_id: selectedPumpId,
        requests: items,
      });

      const createdCount = response.data?.count || items.length;
      setBulkReviewModal(false);
      setSelectedTruckIds([]);
      setTruckLiters({});
      setTruckRemarks({});

      Alert.alert(
        '🎉 Requests Created!',
        `Successfully created ${createdCount} fuel request(s).\n\nOperators at the station can now verify and dispense fuel.`,
        [
          {
            text: 'View Requests',
            onPress: () => {
              setActiveTab('requests');
              loadData();
            },
          },
        ]
      );
      loadData();
    } catch (err: any) {
      const errorDetail =
        err?.response?.data?.errors?.join('\n') ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Failed to submit bulk request.';
      Alert.alert('Submission Error', errorDetail);
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleCancelPendingRequest = (reqItem: any) => {
    Alert.alert(
      'Cancel Fuel Request',
      `Cancel pending request ${reqItem.request_number} for truck ${reqItem.truck_number}?`,
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/fuel-requests/${reqItem.id}/delete/`);
              Alert.alert('Request Cancelled', `Request ${reqItem.request_number} has been deleted.`);
              loadData();
            } catch (e: any) {
              Alert.alert('Action Failed', e?.response?.data?.error || 'Could not cancel request.');
            }
          },
        },
      ]
    );
  };

  const filteredRequests = useMemo(() => {
    if (requestFilter === 'ALL') return requests;
    return requests.filter((r) => r.status === requestFilter);
  }, [requests, requestFilter]);

  const selectedPumpName = useMemo(() => {
    const p = pumps.find((item) => item.id === selectedPumpId);
    return p ? `${p.name} (${p.code})` : 'Select Station';
  }, [pumps, selectedPumpId]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── App Bar ── */}
      <View style={styles.headerContainer}>
        <View style={styles.neonBar} />
        <View style={styles.headerRow}>
          <View>
            <View style={styles.rolePill}>
              <Ionicons name="shield-checkmark" size={11} color={C.primary} style={{ marginRight: 4 }} />
              <Text style={styles.rolePillText}>TRUCK OWNER • FLEET CONSOLE</Text>
            </View>
            <Text style={styles.headerName}>{customerUser?.name || customerUser?.first_name || 'Truck Owner'}</Text>
            <Text style={styles.headerSub}>Manage trucks & create multi-truck fuel requests</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push('/customer-profile' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(customerUser?.name || 'T').charAt(0).toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

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
        {/* ── KPI Metrics Grid ── */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="bus" size={20} color={C.primary} />
            </View>
            <Text style={[styles.statVal, { color: C.primary }]}>{stats.total_trucks}</Text>
            <Text style={styles.statLabel}>Total Trucks</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: C.greenLight }]}>
              <Ionicons name="checkmark-done" size={20} color={C.green} />
            </View>
            <Text style={[styles.statVal, { color: C.green }]}>{stats.eligible_trucks}</Text>
            <Text style={styles.statLabel}>Eligible Trucks</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: C.yellowLight }]}>
              <Ionicons name="time" size={20} color={C.yellow} />
            </View>
            <Text style={[styles.statVal, { color: C.yellow }]}>{stats.pending_requests}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="receipt" size={20} color="#7C3AED" />
            </View>
            <Text style={[styles.statVal, { color: '#7C3AED' }]}>{stats.total_requests}</Text>
            <Text style={styles.statLabel}>Total Requests</Text>
          </View>
        </View>

        {/* ── Quick Action Buttons ── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: 'rgba(2,132,199,0.12)', borderColor: C.primary }]}
            onPress={() => setAddTruckVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={18} color={C.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.primary }]}>+ Add New Truck</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.greenLight, borderColor: 'rgba(22,163,74,0.4)' }]}
            onPress={() => {
              handleSelectAllEligible();
              setActiveTab('bulk_request');
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="flash" size={18} color={C.green} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.green }]}>⚡ Bulk Request Fuel</Text>
          </TouchableOpacity>
        </View>

        {/* ── Modern Navigation Tabs ── */}
        <View style={styles.tabBar}>
          {[
            { key: 'trucks', icon: 'bus', label: `My Trucks (${trucks.length})` },
            { key: 'bulk_request', icon: 'checkbox-outline', label: `Bulk Request (${selectedTruckIds.length})` },
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
                color={activeTab === tab.key ? C.white : C.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ══════════════════════════════════════════════════════════
            TAB 1: TRUCK MANAGEMENT
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'trucks' && (
          <View>
            {loading && !refreshing ? (
              <View style={styles.centerBox}><ActivityIndicator size="large" color={C.primary} /></View>
            ) : trucks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="bus-outline" size={48} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Trucks in Your Fleet</Text>
                <Text style={styles.emptySubtitle}>Click "+ Add New Truck" above to register your commercial vehicles.</Text>
              </View>
            ) : (
              trucks.map((truck) => {
                const isEligible = truck.is_eligible_for_request;
                return (
                  <View key={truck.id} style={styles.truckCard}>
                    <View
                      style={[
                        styles.truckAccent,
                        truck.fuel_type === 'DIESEL' ? { backgroundColor: C.primary } : { backgroundColor: C.yellow },
                      ]}
                    />

                    {/* Top Row: Plate & Fuel */}
                    <View style={styles.truckHeaderRow}>
                      <View style={styles.plateBox}>
                        <View style={styles.plateBlue}><Text style={styles.plateBlueTxt}>IND</Text></View>
                        <Text style={styles.plateNum}>{truck.truck_number}</Text>
                      </View>

                      <View
                        style={[
                          styles.fuelBadge,
                          {
                            backgroundColor: truck.fuel_type === 'DIESEL' ? '#E0F2FE' : '#FEF3C7',
                            borderColor: truck.fuel_type === 'DIESEL' ? '#BAE6FD' : '#FDE68A',
                          },
                        ]}
                      >
                        <Ionicons
                          name="water"
                          size={11}
                          color={truck.fuel_type === 'DIESEL' ? C.primary : C.yellow}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.fuelBadgeText, { color: truck.fuel_type === 'DIESEL' ? C.primary : C.yellow }]}>
                          {truck.fuel_type} · {truck.capacity_liters || 0}L
                        </Text>
                      </View>
                    </View>

                    {/* Eligibility & Status Row */}
                    <View style={styles.statusRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[styles.dot, { backgroundColor: truck.is_active ? C.green : C.red }]} />
                        <Text style={styles.statusText}>{truck.is_active ? 'Active Fleet' : 'Inactive'}</Text>
                      </View>

                      {isEligible ? (
                        <View style={styles.eligiblePill}>
                          <Ionicons name="checkmark-circle" size={12} color={C.green} style={{ marginRight: 3 }} />
                          <Text style={styles.eligiblePillText}>Ready for Fuel</Text>
                        </View>
                      ) : (
                        <View style={styles.ineligiblePill}>
                          <Ionicons name="time" size={12} color={C.yellow} style={{ marginRight: 3 }} />
                          <Text style={styles.ineligiblePillText}>
                            Active: {truck.active_request_number || 'Req Pending'} ({truck.active_request_status || 'Pending'})
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Card Actions */}
                    <View style={styles.cardActionsRow}>
                      {isEligible ? (
                        <TouchableOpacity
                          style={styles.requestQuickBtn}
                          onPress={() => handleQuickRequestTruck(truck)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="flash" size={13} color={C.white} style={{ marginRight: 4 }} />
                          <Text style={styles.requestQuickText}>Request Fuel</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.viewReqBtn}
                          onPress={() => {
                            setRequestFilter('ALL');
                            setActiveTab('requests');
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="eye-outline" size={13} color={C.yellow} style={{ marginRight: 4 }} />
                          <Text style={styles.viewReqText}>View Request</Text>
                        </TouchableOpacity>
                      )}

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => openEditTruckModal(truck)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="pencil" size={15} color={C.primary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionIconBtn, { borderColor: C.redLight }]}
                          onPress={() => handleDeleteTruck(truck)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="trash-outline" size={15} color={C.red} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 2: BULK REQUEST CREATION
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'bulk_request' && (
          <View>
            {/* Station Selection Box */}
            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>DISPENSING FUEL STATION *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {pumps.map((p) => {
                  const isSelected = selectedPumpId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.pumpChip, isSelected && styles.pumpChipSelected]}
                      onPress={() => setSelectedPumpId(p.id)}
                    >
                      <Ionicons
                        name="location"
                        size={14}
                        color={isSelected ? C.white : C.primary}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.pumpChipText, isSelected && styles.pumpChipTextSelected]}>
                        {p.name} ({p.code})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Selection Controls */}
            <View style={styles.selectionBar}>
              <View>
                <Text style={styles.selectionCount}>
                  {selectedTruckIds.length} of {eligibleTrucks.length} Eligible Selected
                </Text>
                <Text style={styles.selectionLiters}>Total: {totalSelectedLiters.toLocaleString()} Liters</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={styles.selBtn} onPress={handleSelectAllEligible}>
                  <Text style={styles.selBtnText}>Select All</Text>
                </TouchableOpacity>

                {selectedTruckIds.length > 0 && (
                  <TouchableOpacity style={[styles.selBtn, { backgroundColor: '#F1F5F9' }]} onPress={handleClearSelection}>
                    <Text style={[styles.selBtnText, { color: C.textSub }]}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Truck Checklist */}
            {trucks.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="bus-outline" size={40} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Trucks Available</Text>
                <Text style={styles.emptySubtitle}>Please register trucks in the "My Trucks" tab first.</Text>
              </View>
            ) : (
              trucks.map((truck) => {
                const isSelected = selectedTruckIds.includes(truck.id);
                const isEligible = truck.is_eligible_for_request;

                return (
                  <View
                    key={truck.id}
                    style={[
                      styles.bulkTruckCard,
                      isSelected && styles.bulkTruckCardSelected,
                      !isEligible && styles.bulkTruckCardDisabled,
                    ]}
                  >
                    <View style={styles.bulkTopRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                        onPress={() => handleToggleTruckSelection(truck)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected, !isEligible && styles.checkboxDisabled]}>
                          {isSelected && <Ionicons name="checkmark" size={14} color={C.white} />}
                        </View>

                        <View style={{ marginLeft: 10 }}>
                          <View style={styles.plateBoxSm}>
                            <View style={styles.plateBlueSm}><Text style={styles.plateBlueTxtSm}>IND</Text></View>
                            <Text style={styles.plateNumSm}>{truck.truck_number}</Text>
                          </View>
                          <Text style={styles.fuelSubText}>
                            {truck.fuel_type} · Tank Cap: {truck.capacity_liters}L
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {isEligible ? (
                        <View style={styles.eligiblePillSm}>
                          <Text style={styles.eligiblePillTextSm}>Eligible</Text>
                        </View>
                      ) : (
                        <View style={styles.ineligiblePillSm}>
                          <Text style={styles.ineligiblePillTextSm}>Active Req: {truck.active_request_number}</Text>
                        </View>
                      )}
                    </View>

                    {/* Quantity & Remarks inputs shown if selected */}
                    {isSelected && (
                      <View style={styles.selectedInputsRow}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={styles.inputLabelSm}>LITERS TO DISPENSE (MAX {truck.capacity_liters}L)</Text>
                          <TextInput
                            style={styles.inputSm}
                            keyboardType="numeric"
                            value={truckLiters[truck.id] || ''}
                            onChangeText={(text) =>
                              setTruckLiters((prev) => ({ ...prev, [truck.id]: text }))
                            }
                            placeholder="Liters"
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabelSm}>TRIP / REMARKS (OPTIONAL)</Text>
                          <TextInput
                            style={styles.inputSm}
                            value={truckRemarks[truck.id] || ''}
                            onChangeText={(text) =>
                              setTruckRemarks((prev) => ({ ...prev, [truck.id]: text }))
                            }
                            placeholder="e.g. Pune Highway"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* Submit Action Button */}
            {selectedTruckIds.length > 0 && (
              <TouchableOpacity
                style={styles.submitBulkBtn}
                onPress={handleOpenReviewModal}
                activeOpacity={0.88}
              >
                <Ionicons name="checkmark-done" size={20} color={C.white} style={{ marginRight: 8 }} />
                <Text style={styles.submitBulkBtnText}>
                  Review & Submit ({selectedTruckIds.length} Trucks · {totalSelectedLiters} L)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 3: REQUESTS HISTORY
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'requests' && (
          <View>
            {/* Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {(['ALL', 'PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.filterChip, requestFilter === st && styles.filterChipActive]}
                  onPress={() => setRequestFilter(st)}
                >
                  <Text style={[styles.filterChipText, requestFilter === st && styles.filterChipTextActive]}>
                    {st === 'ALL' ? `All Requests (${requests.length})` : `${st}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredRequests.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={40} color={C.textMuted} />
                <Text style={styles.emptyTitle}>No Requests Found</Text>
                <Text style={styles.emptySubtitle}>No requests match the selected status filter.</Text>
              </View>
            ) : (
              filteredRequests.map((req) => {
                const badge = STATUS_MAP[req.status] || STATUS_MAP.PENDING;
                return (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.reqTopRow}>
                      <View>
                        <Text style={styles.reqNum}>{req.request_number}</Text>
                        <Text style={styles.reqDate}>{req.created_at ? new Date(req.created_at).toLocaleString() : ''}</Text>
                      </View>

                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Ionicons name={badge.icon} size={12} color={badge.text} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>{req.status}</Text>
                      </View>
                    </View>

                    <View style={styles.reqDivider} />

                    <View style={styles.reqDetailsRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reqDetailLabel}>TRUCK</Text>
                        <View style={styles.plateBoxSm}>
                          <View style={styles.plateBlueSm}><Text style={styles.plateBlueTxtSm}>IND</Text></View>
                          <Text style={styles.plateNumSm}>{req.truck_number}</Text>
                        </View>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.reqDetailLabel}>FUEL & VOLUME</Text>
                        <Text style={styles.reqVolume}>
                          {req.approved_liters || req.requested_liters} L ({req.fuel_type})
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.reqDetailLabel}>STATION</Text>
                        <Text style={styles.reqStation} numberOfLines={1}>{req.pump_name || 'Station'}</Text>
                      </View>
                    </View>

                    {req.remarks ? (
                      <View style={styles.remarksRow}>
                        <Ionicons name="chatbox-ellipses-outline" size={12} color={C.textMuted} style={{ marginRight: 4 }} />
                        <Text style={styles.remarksText} numberOfLines={2}>{req.remarks}</Text>
                      </View>
                    ) : null}

                    {req.status === 'PENDING' && (
                      <View style={{ marginTop: 10, alignItems: 'flex-end' }}>
                        <TouchableOpacity
                          style={styles.cancelReqBtn}
                          onPress={() => handleCancelPendingRequest(req)}
                        >
                          <Ionicons name="close-circle-outline" size={13} color={C.red} style={{ marginRight: 4 }} />
                          <Text style={styles.cancelReqText}>Cancel Request</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ── MODAL: ADD TRUCK ── */}
      <Modal visible={addTruckVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="bus" size={20} color={C.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Register New Fleet Truck</Text>
              </View>
              <TouchableOpacity onPress={() => setAddTruckVisible(false)}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Truck will be registered under your fleet account and can immediately receive fuel requests.
            </Text>

            <Text style={styles.fieldLabel}>VEHICLE REGISTRATION NUMBER *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. MH12AB1234"
              value={newTruckNumber}
              onChangeText={setNewTruckNumber}
              autoCapitalize="characters"
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>FUEL TYPE *</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              {['DIESEL', 'PETROL'].map((ft) => (
                <TouchableOpacity
                  key={ft}
                  style={[styles.fuelTypeSelect, newFuelType === ft && styles.fuelTypeSelectActive]}
                  onPress={() => setNewFuelType(ft)}
                >
                  <Ionicons
                    name="water"
                    size={16}
                    color={newFuelType === ft ? C.white : C.textSub}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.fuelTypeSelectText, newFuelType === ft && styles.fuelTypeSelectTextActive]}>
                    {ft}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>TANK CAPACITY (LITERS) *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 250"
              keyboardType="numeric"
              value={newCapacity}
              onChangeText={setNewCapacity}
            />

            <TouchableOpacity
              style={[styles.modalSubmitBtn, submittingTruck && { opacity: 0.7 }]}
              onPress={handleCreateTruck}
              disabled={submittingTruck}
            >
              {submittingTruck ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Register Truck to Fleet</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL: EDIT TRUCK ── */}
      <Modal visible={editTruckVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="pencil" size={20} color={C.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Edit Truck {editingTruck?.truck_number}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditTruckVisible(false)}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>FUEL TYPE</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              {['DIESEL', 'PETROL'].map((ft) => (
                <TouchableOpacity
                  key={ft}
                  style={[styles.fuelTypeSelect, editFuelType === ft && styles.fuelTypeSelectActive]}
                  onPress={() => setEditFuelType(ft)}
                >
                  <Text style={[styles.fuelTypeSelectText, editFuelType === ft && styles.fuelTypeSelectTextActive]}>
                    {ft}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>TANK CAPACITY (LITERS)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={editCapacity}
              onChangeText={setEditCapacity}
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>TRUCK STATUS</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.fuelTypeSelect, editIsActive && { backgroundColor: C.green, borderColor: C.green }]}
                onPress={() => setEditIsActive(true)}
              >
                <Text style={[styles.fuelTypeSelectText, editIsActive && { color: C.white }]}>Active Fleet</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fuelTypeSelect, !editIsActive && { backgroundColor: C.red, borderColor: C.red }]}
                onPress={() => setEditIsActive(false)}
              >
                <Text style={[styles.fuelTypeSelectText, !editIsActive && { color: C.white }]}>Inactive</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, updatingTruck && { opacity: 0.7 }]}
              onPress={handleUpdateTruck}
              disabled={updatingTruck}
            >
              {updatingTruck ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL: BULK REQUEST PRE-SUBMISSION REVIEW ── */}
      <Modal visible={bulkReviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="shield-checkmark" size={22} color={C.primary} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Confirm Bulk Request</Text>
              </View>
              <TouchableOpacity onPress={() => setBulkReviewModal(false)}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.summaryBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summarySub}>SELECTED STATION</Text>
                <Text style={styles.summaryVal}>{selectedPumpName}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.summarySub}>TOTAL VOLUME</Text>
                <Text style={[styles.summaryVal, { color: C.primary, fontSize: 18 }]}>
                  {totalSelectedLiters.toLocaleString()} L
                </Text>
              </View>
            </View>

            <Text style={[styles.fieldLabel, { marginVertical: 8 }]}>SELECTED TRUCKS BREAKDOWN</Text>

            <ScrollView style={{ maxHeight: 220 }}>
              {selectedTruckIds.map((tId, idx) => {
                const trk = trucks.find((t) => t.id === tId);
                const ltr = truckLiters[tId] || trk?.capacity_liters;
                return (
                  <View key={tId} style={styles.reviewTruckItem}>
                    <Text style={styles.reviewIdx}>{idx + 1}.</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewPlate}>{trk?.truck_number}</Text>
                      <Text style={styles.reviewSub}>{trk?.fuel_type} · Max {trk?.capacity_liters}L</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.reviewLiters}>{ltr} Liters</Text>
                      {truckRemarks[tId] ? (
                        <Text style={styles.reviewRemarks} numberOfLines={1}>{truckRemarks[tId]}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, submittingBulk && { opacity: 0.7 }]}
              onPress={handleSubmitBulkRequests}
              disabled={submittingBulk}
            >
              {submittingBulk ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.modalSubmitBtnText}>
                  Confirm & Submit {selectedTruckIds.length} Request(s)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── STYLES ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  neonBar: {
    height: 3,
    backgroundColor: C.primary,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  rolePillText: {
    color: C.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerName: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 1,
  },
  avatarBtn: {
    padding: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    marginHorizontal: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabItemActive: {
    backgroundColor: C.primary,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  truckCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  truckAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  truckHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  plateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0F172A',
    borderRadius: 6,
    overflow: 'hidden',
  },
  plateBlue: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  plateBlueTxt: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  plateNum: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    paddingHorizontal: 8,
    letterSpacing: 1,
  },
  fuelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  fuelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  eligiblePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.greenLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  eligiblePillText: {
    color: C.green,
    fontSize: 10,
    fontWeight: '700',
  },
  ineligiblePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.yellowLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  ineligiblePillText: {
    color: C.yellow,
    fontSize: 10,
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  requestQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  requestQuickText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  viewReqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.yellowLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewReqText: {
    color: C.yellow,
    fontSize: 11,
    fontWeight: '700',
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  // Bulk tab styles
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  pumpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
    marginRight: 8,
  },
  pumpChipSelected: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  pumpChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.primary,
  },
  pumpChipTextSelected: {
    color: '#FFFFFF',
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectionLiters: {
    fontSize: 11,
    color: C.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  selBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
  },
  selBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.primary,
  },
  bulkTruckCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  bulkTruckCardSelected: {
    borderColor: C.primary,
    backgroundColor: '#F0F9FF',
  },
  bulkTruckCardDisabled: {
    opacity: 0.6,
    backgroundColor: '#F8FAFC',
  },
  bulkTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkboxDisabled: {
    backgroundColor: '#E2E8F0',
    borderColor: '#CBD5E1',
  },
  plateBoxSm: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0F172A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  plateBlueSm: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  plateBlueTxtSm: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
  },
  plateNumSm: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 6,
    letterSpacing: 0.5,
  },
  fuelSubText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  eligiblePillSm: {
    backgroundColor: C.greenLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  eligiblePillTextSm: {
    color: C.green,
    fontSize: 10,
    fontWeight: '700',
  },
  ineligiblePillSm: {
    backgroundColor: C.yellowLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ineligiblePillTextSm: {
    color: C.yellow,
    fontSize: 9,
    fontWeight: '700',
  },
  selectedInputsRow: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inputLabelSm: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  inputSm: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    color: '#0F172A',
  },
  submitBulkBtn: {
    backgroundColor: C.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 10,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  submitBulkBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // Requests tab styles
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reqTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reqNum: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  reqDate: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  reqDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  reqDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reqDetailLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 3,
  },
  reqVolume: {
    fontSize: 12,
    fontWeight: '800',
    color: C.primary,
  },
  reqStation: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  remarksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  remarksText: {
    fontSize: 10,
    color: '#64748B',
    fontStyle: 'italic',
  },
  cancelReqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: C.redLight,
  },
  cancelReqText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.red,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginTop: 4,
  },
  fuelTypeSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  fuelTypeSelectActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  fuelTypeSelectText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  fuelTypeSelectTextActive: {
    color: '#FFFFFF',
  },
  modalSubmitBtn: {
    backgroundColor: C.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // Review modal specific
  summaryBanner: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  summarySub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0369A1',
    marginBottom: 2,
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewTruckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reviewIdx: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    width: 22,
  },
  reviewPlate: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewSub: {
    fontSize: 10,
    color: '#64748B',
  },
  reviewLiters: {
    fontSize: 13,
    fontWeight: '800',
    color: C.primary,
  },
  reviewRemarks: {
    fontSize: 9,
    color: '#94A3B8',
    maxWidth: 100,
  },
});
