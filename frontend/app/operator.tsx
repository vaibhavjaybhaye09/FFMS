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
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../src/api/client';
import { getUser } from '../src/storage/token';

const { width } = Dimensions.get('window');

const C = {
  primary:    '#1565C0',
  yellow:     '#FFC928',
  yellowGlow: '#FFD740',
  white:      '#FFFFFF',
  red:        '#E53935',
  night:      '#0B1220',
  nightCard:  '#111827',
  nightCard2: '#0D1A2D',
  nightBorder:'#1E2D45',
  neon:       '#00B8FF',
  neonDim:    'rgba(0,184,255,0.15)',
  textMuted:  '#8899BB',
  textSub:    '#B0C4DE',
  green:      '#00C853',
};

export default function OperatorScreen() {
  const router = useRouter();

  const [queue, setQueue] = useState<any[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [operatorUser, setOperatorUser] = useState<any>(null);
  const [pumpInfo, setPumpInfo] = useState<any>(null);

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [approvedLiters, setApprovedLiters] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

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

  useEffect(() => {
    loadUserData();
    loadQueue();
  }, [loadUserData, loadQueue]);

  const onRefresh = () => { setRefreshing(true); loadQueue(); };

  const openApproveModal = (request: any) => {
    setSelectedRequest(request);
    setApprovedLiters(String(request.requested_liters || ''));
  };
  const closeApproveModal = () => { setSelectedRequest(null); setApprovedLiters(''); };

  const openRejectModal = (request: any) => {
    setSelectedRequest(request);
    setRejectReason('Truck details mismatch / Unverified');
    setRejectModalVisible(true);
  };
  const closeRejectModal = () => { setSelectedRequest(null); setRejectReason(''); setRejectModalVisible(false); };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    const liters = parseFloat(approvedLiters);
    if (isNaN(liters) || liters <= 0) {
      Alert.alert('Invalid Liters', 'Please enter a valid fuel quantity in liters.');
      return;
    }
    setSubmittingAction(true);
    try {
      const response = await apiClient.post(`/api/fuel-requests/${selectedRequest.id}/approve/`, { approved_liters: liters });
      Alert.alert('✅ Approved!', response.data?.message || 'Fuel request approved successfully.');
      closeApproveModal();
      loadQueue();
    } catch (error: any) {
      Alert.alert('Approval Failed', error?.response?.data?.error || error?.response?.data?.message || 'Unable to approve this request.');
    } finally { setSubmittingAction(false); }
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
      <StatusBar barStyle="light-content" backgroundColor={C.night} />

      {/* ── Header with pump image background ── */}
      <ImageBackground
        source={require('../assets/images/pump_night.jpg')}
        style={styles.headerBg}
        resizeMode="cover"
      >
        <View style={styles.headerOverlay} />
        <View style={styles.neonBar} />
        <View style={styles.header}>
          <View>
            <View style={styles.rolePill}>
              <View style={styles.liveIndicator} />
              <Text style={styles.rolePillText}>OPERATOR</Text>
            </View>
            <Text style={styles.headerTitle}>Fuel Dispense Queue</Text>
            <Text style={styles.headerSubtitle}>
              {pumpInfo ? `${pumpInfo.name} · ${pumpInfo.code}` : 'Loading station...'}
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

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Ionicons name="time-outline" size={16} color={C.yellow} />
            <Text style={styles.statNum}>{queue.length}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statChip, { borderColor: C.green }]}>
            <Ionicons name="flash" size={16} color={C.green} />
            <Text style={[styles.statNum, { color: C.green }]}>Live</Text>
            <Text style={styles.statLabel}>Queue Active</Text>
          </View>
        </View>
      </ImageBackground>

      {/* ── Queue List ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.neon]} tintColor={C.neon} />}
        showsVerticalScrollIndicator={false}
      >
        {loadingQueue && !refreshing ? (
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
              {/* Card top accent */}
              <View style={[styles.cardAccent, item.fuel_type === 'DIESEL' ? styles.accentDiesel : styles.accentPetrol]} />

              {/* Header row */}
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

              {/* Plate + Liters Row */}
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

              {/* Info Grid */}
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

              {/* Action Buttons */}
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
        )}
      </ScrollView>

      {/* ── Approve Modal ── */}
      <Modal
        visible={!!selectedRequest && !rejectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeApproveModal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalIconRow}>
              <View style={[styles.modalIconCircle, { borderColor: C.neon }]}>
                <Ionicons name="flash" size={30} color={C.yellow} />
              </View>
            </View>
            <Text style={styles.modalTitle}>Approve Fuel Dispensing</Text>
            <Text style={styles.modalSub}>Truck: <Text style={{ color: C.neon, fontWeight: '700' }}>{selectedRequest?.truck_number}</Text></Text>

            <Text style={styles.modalInputLabel}>Approved Quantity (Litres)</Text>
            <TextInput
              style={styles.litersInput}
              keyboardType="decimal-pad"
              value={approvedLiters}
              onChangeText={setApprovedLiters}
              placeholder="Enter litres"
              placeholderTextColor={C.textMuted}
              autoFocus
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeApproveModal} disabled={submittingAction}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleApprove} disabled={submittingAction} activeOpacity={0.85}>
                {submittingAction ? <ActivityIndicator color={C.night} /> : (
                  <><Ionicons name="flash" size={17} color={C.night} style={{ marginRight: 6 }} /><Text style={styles.modalConfirmText}>Confirm</Text></>
                )}
              </TouchableOpacity>
            </View>
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
  container: { flex: 1, backgroundColor: C.night },

  // ── Header ──
  headerBg: { width: '100%' },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,18,32,0.82)' },
  neonBar: { height: 3, backgroundColor: C.neon, shadowColor: C.neon, shadowOpacity: 1, shadowRadius: 8, elevation: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  rolePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,184,255,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.neon, marginBottom: 6, alignSelf: 'flex-start' },
  liveIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 5 },
  rolePillText: { fontSize: 10, fontWeight: '800', color: C.neon, letterSpacing: 1.5 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.white },
  headerSubtitle: { fontSize: 12, color: C.textSub, marginTop: 2 },
  profileBtn: { marginTop: 4 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,184,255,0.15)', borderWidth: 2, borderColor: C.neon, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: C.neon },
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(11,18,32,0.6)', borderRadius: 10, borderWidth: 1, borderColor: C.yellow, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  statNum: { fontSize: 16, fontWeight: '800', color: C.yellow },
  statLabel: { fontSize: 11, color: C.textMuted },

  // ── Queue ──
  scrollContent: { padding: 16, paddingBottom: 40 },
  centerBox: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: C.textMuted, fontSize: 14 },

  emptyCard: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,200,83,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.green },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },

  // ── Request Card ──
  requestCard: { backgroundColor: C.nightCard, borderRadius: 18, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.nightBorder, shadowColor: C.neon, shadowOpacity: 0.06, shadowRadius: 12, elevation: 6 },
  cardAccent: { height: 4 },
  accentDiesel: { backgroundColor: C.neon },
  accentPetrol: { backgroundColor: C.yellow },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingBottom: 10 },
  requestNum: { fontSize: 16, fontWeight: '800', color: C.white },
  requestTime: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  fuelBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  dieselBadge: { backgroundColor: 'rgba(0,184,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,184,255,0.3)' },
  petrolBadge: { backgroundColor: 'rgba(255,201,40,0.12)', borderWidth: 1, borderColor: 'rgba(255,201,40,0.3)' },
  fuelBadgeText: { fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },

  plateSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: C.nightCard2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.nightBorder },
  plateBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFDE7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: '#0B1220' },
  plateBlueBadge: { backgroundColor: C.primary, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, marginRight: 6 },
  plateBlueTxt: { color: C.white, fontSize: 8, fontWeight: '900' },
  plateNum: { fontSize: 18, fontWeight: '900', color: '#0B1220', letterSpacing: 1.5 },
  litersBox: { alignItems: 'flex-end' },
  litersNum: { fontSize: 28, fontWeight: '900', color: C.neon, textShadowColor: C.neon, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  litersUnit: { fontSize: 10, color: C.textMuted, letterSpacing: 2, fontWeight: '600' },

  infoGrid: { marginHorizontal: 16, backgroundColor: 'rgba(0,184,255,0.05)', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: C.nightBorder, gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoKey: { fontSize: 12, color: C.textMuted, fontWeight: '600', width: 46 },
  infoVal: { fontSize: 13, color: C.textSub, fontWeight: '700', flex: 1 },

  actionRow: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 0 },
  rejectBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.red, backgroundColor: 'rgba(229,57,53,0.08)', gap: 6 },
  rejectBtnText: { color: C.red, fontWeight: '700', fontSize: 14 },
  approveBtn: { flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: C.yellow, gap: 6, shadowColor: C.yellow, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  approveBtnText: { color: C.night, fontWeight: '800', fontSize: 14 },

  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(11,18,32,0.85)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.nightCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36, borderWidth: 1, borderColor: C.nightBorder },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.nightBorder, alignSelf: 'center', marginBottom: 20 },
  modalIconRow: { alignItems: 'center', marginBottom: 12 },
  modalIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.nightCard2, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 13, color: C.textMuted, textAlign: 'center', marginBottom: 20 },
  modalInputLabel: { fontSize: 12, fontWeight: '700', color: C.textSub, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  litersInput: { backgroundColor: C.nightCard2, borderWidth: 1.5, borderColor: C.nightBorder, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: 20 },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: C.nightCard2, alignItems: 'center', borderWidth: 1, borderColor: C.nightBorder },
  modalCancelText: { color: C.textMuted, fontWeight: '700', fontSize: 15 },
  modalConfirmBtn: { flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: C.yellow, shadowColor: C.yellow, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  modalConfirmText: { color: C.night, fontWeight: '800', fontSize: 15 },
});