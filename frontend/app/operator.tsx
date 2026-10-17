import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  RefreshControl,
  StatusBar,
  ImageBackground,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient, { BASE_URL } from '../src/api/client';
import { getUser } from '../src/storage/token';
import { useTranslation } from '../src/i18n/LanguageContext';

const { width } = Dimensions.get('window');

const C = {
  primary:    '#0284C7',
  primaryDark:'#0369A1',
  yellow:     '#D97706',
  yellowGlow: '#F59E0B',
  white:      '#FFFFFF',
  red:        '#DC2626',
  green:      '#16A34A',
  bg:         '#F8FAFC',
  card:       '#FFFFFF',
  card2:      '#F1F5F9',
  border:     '#E2E8F0',
  borderStrong:'#CBD5E1',
  text:       '#0F172A',
  textSub:    '#334155',
  textMuted:  '#64748B',
  // Backward-compatible tokens mapped to clean white theme
  night:      '#F8FAFC',
  nightCard:  '#FFFFFF',
  nightCard2: '#F1F5F9',
  nightBorder:'#E2E8F0',
  neon:       '#0284C7',
  neonDim:    'rgba(2,132,199,0.08)',
};

export default function OperatorScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'queue' | 'completed'>('queue');
  const [queue, setQueue] = useState<any[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [completedRequests, setCompletedRequests] = useState<any[]>([]);
  const [completedStats, setCompletedStats] = useState<any>({
    total_requests: 0,
    total_liters: 0,
    diesel_liters: 0,
    petrol_liters: 0,
    period: 'Last 30 Days',
  });
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [operatorUser, setOperatorUser] = useState<any>(null);
  const [pumpInfo, setPumpInfo] = useState<any>(null);

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [approvedLiters, setApprovedLiters] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Verification Photos: Dispenser Meter Reading & Truck Plate
  const [dispenserPhoto, setDispenserPhoto] = useState<{ uri: string; base64?: string } | null>(null);
  const [platePhoto, setPlatePhoto] = useState<{ uri: string; base64?: string } | null>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const loadUserData = useCallback(async () => {
    try {
      const user = await getUser();
      setOperatorUser(user);
      if (user?.pump) {
        setPumpInfo(user.pump);
      } else {
        const pumpRes = await apiClient.get('/api/my-pump/');
        if (pumpRes.data?.pump) setPumpInfo(pumpRes.data.pump);
      }
    } catch (e) { /* silent */ }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/fuel-requests/operator-queue/');
      setQueue(response.data?.fuel_requests || []);
    } catch (error: any) {
      console.error('Error loading queue:', error);
      setQueue([]);
    } finally {
      setLoadingQueue(false);
      setRefreshing(false);
    }
  }, []);

  const loadCompleted = useCallback(async () => {
    setLoadingCompleted(true);
    try {
      const response = await apiClient.get('/api/fuel-requests/operator-completed/');
      setCompletedRequests(response.data?.fuel_requests || []);
      if (response.data?.stats) {
        setCompletedStats(response.data.stats);
      }
    } catch (error: any) {
      console.error('Error loading completed requests:', error);
      setCompletedRequests([]);
    } finally {
      setLoadingCompleted(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUserData();
    loadQueue();
    loadCompleted();
  }, [loadUserData, loadQueue, loadCompleted]);

  const onRefresh = () => {
    setRefreshing(true);
    loadQueue();
    loadCompleted();
  };

  const openApproveModal = (request: any) => {
    setSelectedRequest(request);
    setApprovedLiters(String(request.requested_liters || ''));
    setDispenserPhoto(null);
    setPlatePhoto(null);
  };

  const closeApproveModal = () => {
    setSelectedRequest(null);
    setApprovedLiters('');
    setDispenserPhoto(null);
    setPlatePhoto(null);
  };

  const openRejectModal = (request: any) => {
    setSelectedRequest(request);
    setRejectReason('Truck details mismatch / Unverified');
    setRejectModalVisible(true);
  };

  const closeRejectModal = () => {
    setSelectedRequest(null);
    setRejectReason('');
    setRejectModalVisible(false);
  };

  // ── Camera: Click photos one-by-one ──
  const capturePhoto = async (target: 'dispenser' | 'plate', andThenOpenPlate = false) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission Needed', 'Please grant camera access to capture verification photos.');
        return;
      }
      setCapturingPhoto(true);
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.65,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const photoObj = {
          uri: asset.uri,
          base64: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined,
        };

        if (target === 'dispenser') {
          setDispenserPhoto(photoObj);
          if (andThenOpenPlate || !platePhoto) {
            setTimeout(() => {
              Alert.alert(
                '✓ Dispenser Photo Saved',
                'Now opening camera for: 2. Vehicle Number Plate photo.',
                [
                  { text: 'Later', style: 'cancel' },
                  { text: 'Open Camera 📷', onPress: () => capturePhoto('plate') },
                ]
              );
            }, 350);
          }
        } else {
          setPlatePhoto(photoObj);
        }
      }
    } catch (e: any) {
      Alert.alert('Camera Error', e?.message || 'Could not launch camera.');
    } finally {
      setCapturingPhoto(false);
    }
  };


  const captureBothOneByOne = () => {
    Alert.alert(
      '📷 Verification Photos',
      'Step 1: First click the Fuel Dispenser Meter Reading.\nStep 2: Next click the Vehicle Number Plate.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Camera 🚀', onPress: () => capturePhoto('dispenser', true) },
      ]
    );
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    const liters = parseFloat(approvedLiters);
    if (isNaN(liters) || liters <= 0) {
      Alert.alert('Invalid Liters', 'Please enter a valid fuel quantity in liters.');
      return;
    }

    if (!dispenserPhoto) {
      Alert.alert(
        'Dispenser Photo Required',
        'Please capture the fuel dispenser meter reading photo before approving.',
        [
          { text: 'Click Photo 📷', onPress: () => capturePhoto('dispenser') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    if (!platePhoto) {
      Alert.alert(
        'Vehicle Plate Photo Required',
        'Please capture the truck number plate photo before approving.',
        [
          { text: 'Click Plate 📷', onPress: () => capturePhoto('plate') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    setSubmittingAction(true);
    try {
      const payload: any = {
        approved_liters: liters,
        dispenser_reading_image: dispenserPhoto.base64 || dispenserPhoto.uri,
        vehicle_plate_image: platePhoto.base64 || platePhoto.uri,
      };

      const response = await apiClient.post(`/api/fuel-requests/${selectedRequest.id}/approve/`, payload);
      Alert.alert('✅ Dispensing Approved!', response.data?.message || 'Fuel request verified and approved.');
      closeApproveModal();
      loadQueue();
      loadCompleted();
    } catch (error: any) {
      Alert.alert('Approval Failed', error?.response?.data?.error || error?.response?.data?.message || 'Unable to approve this request.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    setSubmittingAction(true);
    try {
      const response = await apiClient.post(`/api/fuel-requests/${selectedRequest.id}/reject/`, { remarks: rejectReason.trim() || 'Rejected by operator' });
      Alert.alert('Rejected', response.data?.message || 'Fuel request has been rejected.');
      closeRejectModal();
      loadQueue();
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.error || error?.response?.data?.message || 'Unable to reject this request.');
    } finally { setSubmittingAction(false); }
  };

  const handleComplete = async (request: any) => {
    try {
      const response = await apiClient.post(`/api/fuel-requests/${request.id}/complete/`);
      Alert.alert('⛽ Fuel Dispensed!', response.data?.message || 'Fuel dispensing completed successfully.');
      loadQueue();
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.error || error?.response?.data?.message || 'Unable to complete request.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Header Card (Clean White Theme) ── */}
      <View style={styles.headerCard}>
        <View style={styles.header}>
          <View>
            <View style={styles.rolePill}>
              <View style={[styles.liveIndicator, activeTab === 'completed' && { backgroundColor: C.green }]} />
              <Text style={[styles.rolePillText, activeTab === 'completed' && { color: C.green }]}>
                {activeTab === 'queue' ? t('dispenser_queue', 'DISPENSER QUEUE') : t('completed_history', 'COMPLETED HISTORY')}
              </Text>
            </View>
            <Text style={styles.headerTitle}>
              {activeTab === 'queue' ? t('fuel_queue', 'Fuel Dispense Queue') : t('completed_requests', 'Completed Requests')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'queue'
                ? (pumpInfo ? `${pumpInfo.name} · ${pumpInfo.code}` : 'Loading station...')
                : `Last 30 Days · ${completedStats.total_liters} L Total Dispensed`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => router.push('/operator-profile')}
            activeOpacity={0.8}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{(operatorUser?.name || 'O').charAt(0).toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'queue' && styles.tabBtnActive]}
            onPress={() => setActiveTab('queue')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="time-outline"
              size={15}
              color={activeTab === 'queue' ? C.white : C.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'queue' && styles.tabBtnTextActive]}>
              {t('pending_queue', 'Pending Queue')} ({queue.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'completed' && styles.tabBtnCompletedActive]}
            onPress={() => setActiveTab('completed')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-done"
              size={15}
              color={activeTab === 'completed' ? C.white : C.green}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'completed' && styles.tabBtnCompletedTextActive]}>
              {t('completed_30d', 'Completed 30D')} ({completedRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {activeTab === 'queue' ? (
            <>
              <View style={styles.statChip}>
                <Ionicons name="time-outline" size={16} color={C.yellow} />
                <Text style={styles.statNum}>{queue.length}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={[styles.statChip, { borderColor: 'rgba(22,163,74,0.3)', backgroundColor: 'rgba(22,163,74,0.06)' }]}>
                <Ionicons name="flash" size={16} color={C.green} />
                <Text style={[styles.statNum, { color: C.green }]}>Live</Text>
                <Text style={styles.statLabel}>Queue Active</Text>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.statChip, { borderColor: 'rgba(22,163,74,0.3)', backgroundColor: 'rgba(22,163,74,0.06)' }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={C.green} />
                <Text style={[styles.statNum, { color: C.green }]}>{completedStats.total_requests}</Text>
                <Text style={styles.statLabel}>Dispensed</Text>
              </View>
              <View style={[styles.statChip, { borderColor: 'rgba(2,132,199,0.3)', backgroundColor: 'rgba(2,132,199,0.06)' }]}>
                <Ionicons name="water-outline" size={16} color={C.primary} />
                <Text style={[styles.statNum, { color: C.primary }]}>{completedStats.total_liters} L</Text>
                <Text style={styles.statLabel}>Last 30 Days</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* ── Content Body ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.neon]} tintColor={C.neon} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'queue' ? (
          /* ── TAB 1: PENDING QUEUE ── */
          loadingQueue && !refreshing ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={C.neon} />
              <Text style={styles.loadingText}>Fetching fuel queue...</Text>
            </View>
          ) : queue.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="checkmark-done-circle" size={48} color={C.green} />
              </View>
              <Text style={styles.emptyTitle}>Queue is Clear!</Text>
              <Text style={styles.emptySubtitle}>No pending fuel requests at this pump right now. Pull down to refresh.</Text>
            </View>
          ) : (
            queue.map((item) => (
              <View key={item.id} style={styles.requestCard}>
                <View style={[styles.cardAccent, item.fuel_type === 'DIESEL' ? styles.accentDiesel : styles.accentPetrol]} />

                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.requestNum}>{item.request_number}</Text>
                    <Text style={styles.requestTime}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[styles.fuelBadge, item.fuel_type === 'DIESEL' ? styles.dieselBadge : styles.petrolBadge]}>
                    <Ionicons name="water" size={12} color={item.fuel_type === 'DIESEL' ? C.neon : C.yellow} style={{ marginRight: 4 }} />
                    <Text style={[styles.fuelBadgeText, { color: item.fuel_type === 'DIESEL' ? C.neon : C.yellow }]}>
                      {item.fuel_type}
                    </Text>
                  </View>
                </View>

                <View style={styles.plateSection}>
                  <View style={styles.plateBox}>
                    <View style={styles.plateBlueBadge}><Text style={styles.plateBlueTxt}>IND</Text></View>
                    <Text style={styles.plateNum}>{item.truck_number}</Text>
                  </View>
                  <View style={styles.litersBox}>
                    <Text style={styles.litersNum}>{item.requested_liters}</Text>
                    <Text style={styles.litersUnit}>LITRES</Text>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoRow}>
                    <Ionicons name="person-circle-outline" size={15} color={C.neon} />
                    <Text style={styles.infoKey}>Driver</Text>
                    <Text style={styles.infoVal}>{item.driver_name || 'Driver'}</Text>
                  </View>
                  {item.customer_name ? (
                    <View style={styles.infoRow}>
                      <Ionicons name="business-outline" size={15} color={C.yellow} />
                      <Text style={styles.infoKey}>Fleet</Text>
                      <Text style={styles.infoVal}>{item.customer_name}</Text>
                    </View>
                  ) : null}
                  {item.remarks ? (
                    <View style={styles.infoRow}>
                      <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textMuted} />
                      <Text style={styles.infoKey}>Note</Text>
                      <Text style={styles.infoVal}>{item.remarks}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => openRejectModal(item)} activeOpacity={0.8}>
                    <Ionicons name="close-circle" size={17} color={C.red} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => openApproveModal(item)} activeOpacity={0.85}>
                    <Ionicons name="flash" size={17} color={C.night} />
                    <Text style={styles.approveBtnText}>Approve & Dispense</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        ) : (
          /* ── TAB 2: COMPLETED (LAST 30 DAYS) ── */
          <View>
            {/* 30-Day Summary Banner */}
            <View style={styles.summaryBanner}>
              <View style={styles.summaryTopRow}>
                <View>
                  <Text style={styles.summaryLabel}>TOTAL DISPENSED (LAST 30 DAYS)</Text>
                  <Text style={styles.summaryTotalVal}>{completedStats.total_liters} <Text style={{ fontSize: 16, color: C.green }}>LITRES</Text></Text>
                </View>
                <View style={styles.summaryBadge}>
                  <Ionicons name="calendar-outline" size={13} color={C.neon} style={{ marginRight: 4 }} />
                  <Text style={styles.summaryBadgeText}>30 Days</Text>
                </View>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryGrid}>
                <View style={styles.summaryGridItem}>
                  <Text style={styles.summaryGridKey}>Completed Requests</Text>
                  <Text style={styles.summaryGridVal}>{completedStats.total_requests}</Text>
                </View>
                <View style={styles.summaryGridItem}>
                  <Text style={styles.summaryGridKey}>Diesel Dispensed</Text>
                  <Text style={[styles.summaryGridVal, { color: C.neon }]}>{completedStats.diesel_liters} L</Text>
                </View>
                <View style={styles.summaryGridItem}>
                  <Text style={styles.summaryGridKey}>Petrol Dispensed</Text>
                  <Text style={[styles.summaryGridVal, { color: C.yellow }]}>{completedStats.petrol_liters} L</Text>
                </View>
              </View>
            </View>

            {loadingCompleted && !refreshing ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={C.green} />
                <Text style={styles.loadingText}>Fetching 30-day completed records...</Text>
              </View>
            ) : completedRequests.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={[styles.emptyIcon, { borderColor: C.textMuted, backgroundColor: 'rgba(98,119,148,0.1)' }]}>
                  <Ionicons name="file-tray-outline" size={44} color={C.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No Completed Requests</Text>
                <Text style={styles.emptySubtitle}>No requests were completed in the last 30 days. When you dispense fuel, history appears here.</Text>
              </View>
            ) : (
              completedRequests.map((item) => (
                <View key={item.id} style={styles.requestCard}>
                  {/* Card top accent (Green for completed) */}
                  <View style={[styles.cardAccent, { backgroundColor: C.green }]} />

                  {/* Header row */}
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.requestNum}>{item.request_number}</Text>
                      <Text style={styles.requestTime}>
                        Dispensed: {item.completed_at ? new Date(item.completed_at).toLocaleString() : new Date(item.approved_at || item.created_at).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.completedStatusBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={C.green} style={{ marginRight: 4 }} />
                      <Text style={styles.completedStatusText}>DISPENSED</Text>
                    </View>
                  </View>

                  {/* Plate + Dispensed Liters Row */}
                  <View style={styles.plateSection}>
                    <View style={styles.plateBox}>
                      <View style={styles.plateBlueBadge}><Text style={styles.plateBlueTxt}>IND</Text></View>
                      <Text style={styles.plateNum}>{item.truck_number}</Text>
                    </View>
                    <View style={styles.litersBox}>
                      <Text style={[styles.litersNum, { color: C.green, textShadowColor: 'rgba(0,200,83,0.5)' }]}>
                        {item.approved_liters || item.requested_liters}
                      </Text>
                      <Text style={[styles.litersUnit, { color: C.green }]}>LITRES DISPENSED</Text>
                    </View>
                  </View>

                  {/* Info Grid */}
                  <View style={[styles.infoGrid, { backgroundColor: 'rgba(0,200,83,0.05)', borderColor: 'rgba(0,200,83,0.2)' }]}>
                    <View style={styles.infoRow}>
                      <Ionicons name="person-circle-outline" size={15} color={C.neon} />
                      <Text style={styles.infoKey}>Driver</Text>
                      <Text style={styles.infoVal}>{item.driver_name || 'Driver'}</Text>
                    </View>
                    {item.customer_name ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="business-outline" size={15} color={C.yellow} />
                        <Text style={styles.infoKey}>Fleet</Text>
                        <Text style={styles.infoVal}>{item.customer_name}</Text>
                      </View>
                    ) : null}
                    <View style={styles.infoRow}>
                      <Ionicons name="checkmark-done-outline" size={15} color={C.green} />
                      <Text style={styles.infoKey}>Operator</Text>
                      <Text style={[styles.infoVal, { color: C.green }]}>{item.operator_name || operatorUser?.first_name || 'Pump Operator'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Ionicons name="water-outline" size={15} color={item.fuel_type === 'DIESEL' ? C.neon : C.yellow} />
                      <Text style={styles.infoKey}>Fuel</Text>
                      <Text style={[styles.infoVal, { color: item.fuel_type === 'DIESEL' ? C.neon : C.yellow }]}>
                        {item.fuel_type} (Requested: {item.requested_liters}L)
                      </Text>
                    </View>
                    {item.remarks ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textMuted} />
                        <Text style={styles.infoKey}>Note</Text>
                        <Text style={styles.infoVal}>{item.remarks}</Text>
                      </View>
                    ) : null}
            {/* Dispensed Verification Photos (Completed Card) */}
            {(item.dispenser_reading_image || item.vehicle_plate_image) ? (
              <View style={styles.historyPhotosSection}>
                <Text style={styles.historyPhotosTitle}>Verification Photos</Text>
                <View style={styles.historyPhotosGrid}>
                  {item.dispenser_reading_image ? (
                    <View style={styles.historyPhotoCard}>
                      <Image
                        source={{
                          uri: item.dispenser_reading_image.startsWith('http')
                            ? item.dispenser_reading_image
                            : `${BASE_URL}${item.dispenser_reading_image.startsWith('/') ? '' : '/'}${item.dispenser_reading_image}`,
                        }}
                        style={styles.historyThumb}
                        resizeMode="cover"
                      />
                      <View style={styles.historyPhotoLabel}>
                        <Ionicons name="speedometer-outline" size={12} color={C.neon} style={{ marginRight: 3 }} />
                        <Text style={styles.historyPhotoLabelText}>Meter Reading</Text>
                      </View>
                    </View>
                  ) : null}
                  {item.vehicle_plate_image ? (
                    <View style={styles.historyPhotoCard}>
                      <Image
                        source={{
                          uri: item.vehicle_plate_image.startsWith('http')
                            ? item.vehicle_plate_image
                            : `${BASE_URL}${item.vehicle_plate_image.startsWith('/') ? '' : '/'}${item.vehicle_plate_image}`,
                        }}
                        style={styles.historyThumb}
                        resizeMode="cover"
                      />
                      <View style={styles.historyPhotoLabel}>
                        <Ionicons name="car-outline" size={12} color={C.yellow} style={{ marginRight: 3 }} />
                        <Text style={styles.historyPhotoLabelText}>Plate Photo</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ))
    )}
  </View>
)}
</ScrollView>

      {/* ── Approve Modal with Two-Photo Capture ── */}
      <Modal
        visible={!!selectedRequest && !rejectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeApproveModal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <View style={styles.modalHandle} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={styles.modalHeaderRow}>
                <View style={[styles.modalIconCircle, { borderColor: C.green }]}>
                  <Ionicons name="camera" size={26} color={C.green} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.modalTitle}>Verify & Dispense Fuel</Text>
                  <Text style={styles.modalSub}>
                    Req: <Text style={{ color: C.neon, fontWeight: '700' }}>{selectedRequest?.request_number}</Text> · Truck: <Text style={{ color: C.yellow, fontWeight: '700' }}>{selectedRequest?.truck_number}</Text>
                  </Text>
                </View>
              </View>

              {/* Litres Input */}
              <View style={styles.qtyContainer}>
                <Text style={styles.modalInputLabel}>Approved Dispense Quantity (Litres)</Text>
                <TextInput
                  style={styles.litersInput}
                  keyboardType="decimal-pad"
                  value={approvedLiters}
                  onChangeText={setApprovedLiters}
                  placeholder="Enter litres"
                  placeholderTextColor={C.textMuted}
                />
              </View>

              {/* Photos Section Header */}
              <View style={styles.photoSectionHeader}>
                <View>
                  <Text style={styles.photoSectionTitle}>MANDATORY VERIFICATION PHOTOS</Text>
                  <Text style={styles.photoSectionSubtitle}>Both dispenser reading & truck plate photos are required</Text>
                </View>
              </View>

              {/* One-by-One Camera Button */}
              <TouchableOpacity
                style={styles.oneByOneBtn}
                onPress={captureBothOneByOne}
                disabled={capturingPhoto}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-reverse" size={18} color={C.night} style={{ marginRight: 8 }} />
                <Text style={styles.oneByOneBtnText}>
                  {dispenserPhoto && platePhoto
                    ? 'Retake Both Photos One by One'
                    : 'Open Camera: Click Photos One by One'}
                </Text>
              </TouchableOpacity>

              {/* Photo 1: Dispenser Reading */}
              <View style={styles.photoBoxContainer}>
                <View style={styles.photoBoxHeader}>
                  <View style={styles.photoBoxIndex}>
                    <Text style={styles.photoBoxIndexText}>1</Text>
                  </View>
                  <Text style={styles.photoBoxTitle}>Fuel Dispenser Meter Reading</Text>
                  {dispenserPhoto ? (
                    <View style={styles.photoDoneBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={C.green} />
                      <Text style={styles.photoDoneText}>Captured</Text>
                    </View>
                  ) : (
                    <Text style={styles.photoRequiredText}>* Required</Text>
                  )}
                </View>

                {dispenserPhoto ? (
                  <View style={styles.previewCard}>
                    <Image source={{ uri: dispenserPhoto.uri }} style={styles.capturedImage} resizeMode="cover" />
                    <View style={styles.previewActions}>
                      <TouchableOpacity
                        style={styles.photoRetakeBtn}
                        onPress={() => capturePhoto('dispenser')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="camera" size={15} color={C.neon} />
                        <Text style={styles.photoRetakeText}>Retake Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.photoRetakeBtn, { borderColor: 'rgba(229,57,53,0.4)' }]}
                        onPress={() => setDispenserPhoto(null)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={15} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyCaptureCard}
                    onPress={() => capturePhoto('dispenser')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={32} color={C.neon} />
                    <Text style={styles.cameraBigBtnText}>Click Dispenser Meter Photo</Text>
                    <Text style={styles.cameraOnlyHint}>📷 Live Camera Capture Only</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Photo 2: Vehicle Number Plate */}
              <View style={[styles.photoBoxContainer, { marginTop: 14 }]}>
                <View style={styles.photoBoxHeader}>
                  <View style={[styles.photoBoxIndex, { backgroundColor: C.yellow }]}>
                    <Text style={[styles.photoBoxIndexText, { color: C.night }]}>2</Text>
                  </View>
                  <Text style={styles.photoBoxTitle}>Vehicle Number Plate Photo</Text>
                  {platePhoto ? (
                    <View style={styles.photoDoneBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={C.green} />
                      <Text style={styles.photoDoneText}>Captured</Text>
                    </View>
                  ) : (
                    <Text style={styles.photoRequiredText}>* Required</Text>
                  )}
                </View>

                {platePhoto ? (
                  <View style={styles.previewCard}>
                    <Image source={{ uri: platePhoto.uri }} style={styles.capturedImage} resizeMode="cover" />
                    <View style={styles.previewActions}>
                      <TouchableOpacity
                        style={styles.photoRetakeBtn}
                        onPress={() => capturePhoto('plate')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="camera" size={15} color={C.yellow} />
                        <Text style={[styles.photoRetakeText, { color: C.yellow }]}>Retake Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.photoRetakeBtn, { borderColor: 'rgba(229,57,53,0.4)' }]}
                        onPress={() => setPlatePhoto(null)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={15} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyCaptureCard}
                    onPress={() => capturePhoto('plate')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={32} color={C.yellow} />
                    <Text style={[styles.cameraBigBtnText, { color: C.yellow }]}>Click Vehicle Plate Photo</Text>
                    <Text style={styles.cameraOnlyHint}>📷 Live Camera Capture Only</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Modal Buttons */}
              <View style={[styles.modalBtnRow, { marginTop: 20 }]}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={closeApproveModal} disabled={submittingAction}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalConfirmBtn,
                    (!dispenserPhoto || !platePhoto) && { opacity: 0.65, backgroundColor: C.nightBorder },
                  ]}
                  onPress={handleApprove}
                  disabled={submittingAction}
                  activeOpacity={0.85}
                >
                  {submittingAction ? (
                    <ActivityIndicator color={C.night} />
                  ) : (
                    <>
                      <Ionicons
                        name={dispenserPhoto && platePhoto ? "checkmark-done" : "flash"}
                        size={17}
                        color={dispenserPhoto && platePhoto ? C.night : C.textMuted}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.modalConfirmText,
                          (!dispenserPhoto || !platePhoto) && { color: C.textSub },
                        ]}
                      >
                        {dispenserPhoto && platePhoto ? "Approve & Complete" : "Photos Needed (2)"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Reject Modal ── */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeRejectModal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalIconRow}>
              <View style={[styles.modalIconCircle, { borderColor: C.red }]}>
                <Ionicons name="alert-circle" size={30} color={C.red} />
              </View>
            </View>
            <Text style={styles.modalTitle}>Reject Fuel Request</Text>
            <Text style={styles.modalSub}>Request: <Text style={{ color: C.red, fontWeight: '700' }}>{selectedRequest?.request_number}</Text></Text>

            <Text style={styles.modalInputLabel}>Reason for Rejection</Text>
            <TextInput
              style={[styles.litersInput, { fontSize: 14, fontWeight: '500', textAlign: 'left', minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Plate not matching, insufficient balance"
              placeholderTextColor={C.textMuted}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeRejectModal} disabled={submittingAction}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: C.red }]} onPress={handleReject} disabled={submittingAction} activeOpacity={0.85}>
                {submittingAction ? <ActivityIndicator color={C.white} /> : (
                  <><Ionicons name="close-circle" size={17} color={C.white} style={{ marginRight: 6 }} /><Text style={[styles.modalConfirmText, { color: C.white }]}>Confirm Reject</Text></>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header (Clean White Card) ──
  headerCard: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(2,132,199,0.25)',
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  liveIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 5 },
  rolePillText: { fontSize: 10, fontWeight: '800', color: C.primary, letterSpacing: 1.2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  headerSubtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  profileBtn: { marginTop: 4 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderWidth: 1.5,
    borderColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: C.primary },
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 14, gap: 12 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  statNum: { fontSize: 16, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 11, color: C.textMuted },

  // ── Tab Switcher ──
  tabBar: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card2,
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabBtnCompletedActive: { backgroundColor: C.green, borderColor: C.green },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: C.textSub },
  tabBtnTextActive: { color: C.white, fontWeight: '800' },
  tabBtnCompletedTextActive: { color: C.white, fontWeight: '800' },

  // ── 30-Day Summary Banner ──
  summaryBanner: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 1 },
  summaryTotalVal: { fontSize: 26, fontWeight: '900', color: C.text, marginTop: 4 },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(2,132,199,0.25)',
  },
  summaryBadgeText: { fontSize: 11, fontWeight: '800', color: C.primary },
  summaryDivider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryGridItem: { flex: 1 },
  summaryGridKey: { fontSize: 10, color: C.textMuted, fontWeight: '600', marginBottom: 2 },
  summaryGridVal: { fontSize: 15, fontWeight: '800', color: C.text },
  completedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.3)',
  },
  completedStatusText: { fontSize: 10, fontWeight: '800', color: C.green, letterSpacing: 0.5 },

  // ── Queue Content ──
  scrollContent: { padding: 16, paddingBottom: 40 },
  centerBox: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: C.textMuted, fontSize: 14 },

  emptyCard: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(22,163,74,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.3)',
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },

  // ── Request Card ──
  requestCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardAccent: { height: 4 },
  accentDiesel: { backgroundColor: C.primary },
  accentPetrol: { backgroundColor: C.yellow },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingBottom: 10 },
  requestNum: { fontSize: 16, fontWeight: '800', color: C.text },
  requestTime: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  fuelBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  dieselBadge: { backgroundColor: 'rgba(2,132,199,0.08)', borderWidth: 1, borderColor: 'rgba(2,132,199,0.25)' },
  petrolBadge: { backgroundColor: 'rgba(217,119,6,0.08)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.25)' },
  fuelBadgeText: { fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },

  plateSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  plateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDE7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#0B1220',
  },
  plateBlueBadge: { backgroundColor: '#1565C0', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, marginRight: 6 },
  plateBlueTxt: { color: C.white, fontSize: 8, fontWeight: '900' },
  plateNum: { fontSize: 18, fontWeight: '900', color: '#0B1220', letterSpacing: 1.5 },
  litersBox: { alignItems: 'flex-end' },
  litersNum: { fontSize: 28, fontWeight: '900', color: C.primary },
  litersUnit: { fontSize: 10, color: C.textMuted, letterSpacing: 2, fontWeight: '600' },

  infoGrid: {
    marginHorizontal: 16,
    backgroundColor: C.card2,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoKey: { fontSize: 12, color: C.textMuted, fontWeight: '600', width: 46 },
  infoVal: { fontSize: 13, color: C.text, fontWeight: '700', flex: 1 },

  actionRow: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 0 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.red,
    backgroundColor: 'rgba(220,38,38,0.06)',
    gap: 6,
  },
  rejectBtnText: { color: C.red, fontWeight: '700', fontSize: 14 },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.green,
    gap: 6,
    shadowColor: C.green,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  approveBtnText: { color: C.white, fontWeight: '800', fontSize: 14 },

  // ── Modals (White Theme) ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, alignSelf: 'center', marginBottom: 16 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  modalIconRow: { alignItems: 'center', marginBottom: 12 },
  modalIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderWidth: 1.5,
    borderColor: C.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 2 },
  modalSub: { fontSize: 12, color: C.textMuted },
  qtyContainer: { marginBottom: 14 },
  modalInputLabel: { fontSize: 11, fontWeight: '700', color: C.textSub, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  litersInput: {
    backgroundColor: C.card2,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
  },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.card2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  modalCancelText: { color: C.textSub, fontWeight: '700', fontSize: 15 },
  modalConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  modalConfirmText: { color: C.white, fontWeight: '800', fontSize: 15 },

  // ── Verification Photos UI in Modal ──
  photoSectionHeader: { marginTop: 6, marginBottom: 10 },
  photoSectionTitle: { fontSize: 11, fontWeight: '800', color: C.primary, letterSpacing: 1 },
  photoSectionSubtitle: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  oneByOneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    shadowColor: C.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  oneByOneBtnText: { color: C.white, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  photoBoxContainer: {
    backgroundColor: C.card2,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  photoBoxHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  photoBoxIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  photoBoxIndexText: { fontSize: 11, fontWeight: '900', color: C.white },
  photoBoxTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: C.text },
  photoDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22,163,74,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  photoDoneText: { fontSize: 11, fontWeight: '800', color: C.green },
  photoRequiredText: { fontSize: 11, color: C.red, fontWeight: '700' },
  previewCard: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.4)',
    backgroundColor: C.card2,
  },
  capturedImage: { width: '100%', height: 140, backgroundColor: C.card2 },
  previewActions: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    justifyContent: 'flex-end',
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  photoRetakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  photoRetakeText: { fontSize: 12, fontWeight: '700', color: C.primary },
  emptyCaptureCard: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
  },
  cameraBigBtnText: { marginTop: 8, fontSize: 13, fontWeight: '800', color: C.primary, textAlign: 'center' },
  cameraOnlyHint: { marginTop: 4, fontSize: 11, color: C.textMuted, fontWeight: '600' },

  // ── History Photos in Completed Cards ──
  historyPhotosSection: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 10,
    backgroundColor: C.card2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  historyPhotosTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  historyPhotosGrid: { flexDirection: 'row', gap: 10 },
  historyPhotoCard: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card2,
  },
  historyThumb: { width: '100%', height: 95 },
  historyPhotoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  historyPhotoLabelText: { fontSize: 10, fontWeight: '700', color: C.textSub },
});