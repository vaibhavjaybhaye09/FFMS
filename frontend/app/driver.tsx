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
  FlatList,
  StatusBar,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../src/api/client';
import { getUser, getToken } from '../src/storage/token';

const { height } = Dimensions.get('window');

const C = {
  primary:    '#1565C0',
  yellow:     '#FFC928',
  white:      '#FFFFFF',
  red:        '#E53935',
  night:      '#0B1220',
  nightCard:  '#111827',
  nightCard2: '#0D1A2D',
  nightBorder:'#1E2D45',
  neon:       '#00B8FF',
  green:      '#00C853',
  textMuted:  '#8899BB',
  textSub:    '#B0C4DE',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  PENDING:   { bg: 'rgba(255,201,40,0.12)',  text: '#FFC928', icon: 'time-outline' },
  APPROVED:  { bg: 'rgba(0,184,255,0.12)',   text: '#00B8FF', icon: 'checkmark-circle-outline' },
  VERIFIED:  { bg: 'rgba(0,200,83,0.12)',    text: '#00C853', icon: 'shield-checkmark-outline' },
  COMPLETED: { bg: 'rgba(0,200,83,0.12)',    text: '#00C853', icon: 'flash' },
  REJECTED:  { bg: 'rgba(229,57,53,0.12)',   text: '#E53935', icon: 'close-circle-outline' },
};

export default function DriverScreen() {
  const router = useRouter();

  const [driverName, setDriverName] = useState('');
  const [truck, setTruck] = useState<any>(null);
  const [truckLoading, setTruckLoading] = useState(true);

  const [pumps, setPumps] = useState<any[]>([]);
  const [selectedPump, setSelectedPump] = useState<any>(null);
  const [pumpModalVisible, setPumpModalVisible] = useState(false);
  const [pumpsLoading, setPumpsLoading] = useState(true);

  const [requestedLiters, setRequestedLiters] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const loadDriverAndTruck = useCallback(async () => {
    setTruckLoading(true);
    try {
      const user = await getUser();
      setDriverName(user?.name || user?.first_name || 'Driver');
      const token = await getToken();
      console.log('[Driver] Token in storage:', token ? `✓ Found` : '✗ NOT FOUND');
      const response = await apiClient.get('/api/my-truck/');
      setTruck(response.data?.truck || null);
    } catch (error: any) {
      console.error('Error loading driver/truck:', error.message);
      setTruck(null);
    } finally { setTruckLoading(false); }
  }, []);

  const loadPumps = useCallback(async () => {
    setPumpsLoading(true);
    try {
      const response = await apiClient.get('/api/pumps/');
      setPumps(response.data?.pumps || []);
    } catch (error: any) {
      console.error('Error loading pumps:', error.message);
      setPumps([]);
    } finally { setPumpsLoading(false); }
  }, []);

  const loadMyRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const response = await apiClient.get('/api/fuel-requests/mine/');
      setMyRequests(response.data?.fuel_requests || []);
    } catch (error: any) {
      console.error('Error loading requests:', error.message);
      setMyRequests([]);
    } finally { setRequestsLoading(false); }
  }, []);

  useEffect(() => {
    loadDriverAndTruck();
    loadPumps();
    loadMyRequests();
  }, [loadDriverAndTruck, loadPumps, loadMyRequests]);

  const handleSelectPump = (pump: any) => { setSelectedPump(pump); setPumpModalVisible(false); };

  const handleSubmit = async () => {
    if (!truck) { Alert.alert('No Truck Assigned', 'You do not have a truck assigned yet. Contact your admin.'); return; }
    if (!selectedPump) { Alert.alert('Select a Pump', 'Please choose the pump station where you want fuel.'); return; }
    const liters = parseFloat(requestedLiters);
    if (isNaN(liters) || liters <= 0) { Alert.alert('Invalid Liters', 'Please enter a valid fuel quantity in liters.'); return; }
    if (truck.capacity_liters && liters > truck.capacity_liters) {
      Alert.alert('Exceeds Capacity', `Tank capacity is ${truck.capacity_liters} L. You requested ${liters} L.`);
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post('/api/fuel-requests/create/', {
        truck: truck.id, pump: selectedPump.id, fuel_type: truck.fuel_type,
        requested_liters: Number(requestedLiters), remarks,
      });
      Alert.alert('⛽ Request Sent!', `Fuel request created. Status: ${response.data?.fuel_request?.status || 'PENDING'}`);
      setRequestedLiters(''); setRemarks(''); setSelectedPump(null);
      loadMyRequests();
    } catch (error: any) {
      Alert.alert('Request Failed', error?.response?.data?.detail || error?.response?.data?.error || 'Unable to create fuel request.');
    } finally { setSubmitting(false); }
  };

  const renderRequestCard = (item: any) => {
    const s = (STATUS_STYLES as any)[item.status] || STATUS_STYLES.PENDING;
    return (
      <View key={item.id} style={styles.reqCard}>
        <View style={[styles.reqStatusBar, { backgroundColor: s.bg }]}>
          <Ionicons name={s.icon} size={14} color={s.text} style={{ marginRight: 5 }} />
          <Text style={[styles.reqStatusText, { color: s.text }]}>{item.status}</Text>
        </View>
        <View style={styles.reqBody}>
          <View style={styles.reqHeaderRow}>
            <Text style={styles.reqNum}>{item.request_number}</Text>
            <Text style={styles.reqDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
          <View style={styles.reqGrid}>
            <View style={styles.reqGridItem}>
              <Text style={styles.reqKey}>Truck</Text>
              <Text style={styles.reqVal}>{item.truck_number}</Text>
            </View>
            <View style={styles.reqGridItem}>
              <Text style={styles.reqKey}>Fuel</Text>
              <Text style={styles.reqVal}>{item.fuel_type}</Text>
            </View>
            <View style={styles.reqGridItem}>
              <Text style={styles.reqKey}>Requested</Text>
              <Text style={[styles.reqVal, { color: C.neon }]}>{item.requested_liters} L</Text>
            </View>
            {item.approved_liters ? (
              <View style={styles.reqGridItem}>
                <Text style={styles.reqKey}>Approved</Text>
                <Text style={[styles.reqVal, { color: C.green }]}>{item.approved_liters} L</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.reqPumpRow}>
            <Ionicons name="location-outline" size={13} color={C.textMuted} />
            <Text style={styles.reqPumpText}>{item.pump_name}</Text>
          </View>
          {item.remarks ? (
            <Text style={styles.reqRemarks}>"{item.remarks}"</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.night} />

      {/* ── Hero Header ── */}
      <ImageBackground
        source={require('../assets/images/pump_hero.jpg')}
        style={styles.heroBg}
        resizeMode="cover"
      >
        <View style={styles.heroOverlay} />
        <View style={styles.neonBar} />

        <View style={styles.heroContent}>
          <View>
            <View style={styles.rolePill}>
              <Ionicons name="car" size={11} color={C.green} style={{ marginRight: 4 }} />
              <Text style={styles.rolePillText}>DRIVER</Text>
            </View>
            <Text style={styles.heroName}>Hey, {driverName} 👋</Text>
            <Text style={styles.heroSub}>Ready to fuel up your truck?</Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/driver-profile')} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(driverName || 'D').charAt(0).toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Truck Info Strip */}
        {truckLoading ? (
          <View style={styles.truckStrip}>
            <ActivityIndicator size="small" color={C.neon} />
            <Text style={styles.truckStripText}>Loading truck info...</Text>
          </View>
        ) : truck ? (
          <View style={styles.truckStrip}>
            <View style={styles.truckPlate}>
              <View style={styles.plateBlue}><Text style={styles.plateBlueTxt}>IND</Text></View>
              <Text style={styles.plateNum}>{truck.truck_number}</Text>
            </View>
            <View style={styles.truckMeta}>
              <View style={[styles.fuelChip, truck.fuel_type === 'DIESEL' ? styles.fuelDiesel : styles.fuelPetrol]}>
                <Ionicons name="water" size={12} color={truck.fuel_type === 'DIESEL' ? C.neon : C.yellow} style={{ marginRight: 4 }} />
                <Text style={[styles.fuelChipText, { color: truck.fuel_type === 'DIESEL' ? C.neon : C.yellow }]}>{truck.fuel_type}</Text>
              </View>
              {truck.capacity_liters ? <Text style={styles.capacityText}>Cap: {truck.capacity_liters}L</Text> : null}
            </View>
          </View>
        ) : (
          <View style={[styles.truckStrip, { borderColor: C.red }]}>
            <Ionicons name="warning" size={16} color={C.red} style={{ marginRight: 8 }} />
            <Text style={[styles.truckStripText, { color: C.red }]}>No truck assigned — contact admin</Text>
          </View>
        )}
      </ImageBackground>

      {/* ── Content ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Fuel Request Form ── */}
          <View style={styles.formCard}>
            <View style={styles.formTitleRow}>
              <Ionicons name="flash" size={18} color={C.yellow} style={{ marginRight: 8 }} />
              <Text style={styles.formTitle}>Create Fuel Request</Text>
            </View>

            {/* Pump Selector */}
            <Text style={styles.fieldLabel}>Select Pump Station</Text>
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setPumpModalVisible(true)}
              disabled={pumpsLoading}
              activeOpacity={0.8}
            >
              {pumpsLoading ? (
                <ActivityIndicator size="small" color={C.neon} />
              ) : (
                <>
                  <Ionicons name="location-outline" size={18} color={selectedPump ? C.neon : C.textMuted} style={{ marginRight: 10 }} />
                  <Text style={[styles.dropdownText, !selectedPump && { color: C.textMuted }]}>
                    {selectedPump ? `${selectedPump.name} (${selectedPump.code})` : 'Choose a pump station'}
                  </Text>
                </>
              )}
              <Ionicons name="chevron-down" size={18} color={C.textMuted} />
            </TouchableOpacity>

            {/* Liters */}
            <Text style={styles.fieldLabel}>Fuel Quantity (Litres)</Text>
            <View style={styles.inputRow}>
              <Ionicons name="water-outline" size={18} color={C.neon} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                placeholder="e.g. 100"
                placeholderTextColor={C.textMuted}
                value={requestedLiters}
                onChangeText={setRequestedLiters}
                keyboardType="numeric"
              />
              <Text style={styles.unitLabel}>L</Text>
            </View>

            {/* Remarks */}
            <Text style={styles.fieldLabel}>Remarks (Optional)</Text>
            <View style={[styles.inputRow, { alignItems: 'flex-start', paddingTop: 12 }]}>
              <Ionicons name="chatbubble-outline" size={18} color={C.textMuted} style={{ marginRight: 10, marginTop: 2 }} />
              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="e.g. Urgent refuel, long route"
                placeholderTextColor={C.textMuted}
                value={remarks}
                onChangeText={setRemarks}
                multiline
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, (submitting || !truck) && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={submitting || !truck}
              activeOpacity={0.85}
            >
              {submitting ? <ActivityIndicator color={C.night} /> : (
                <>
                  <Ionicons name="flash" size={18} color={C.night} style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Submit Fuel Request</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── My Requests ── */}
          <Text style={styles.sectionHeader}>My Fuel Requests</Text>
          {requestsLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={C.neon} />
            </View>
          ) : myRequests.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={36} color={C.textMuted} />
              <Text style={styles.emptyText}>No fuel requests yet</Text>
            </View>
          ) : (
            myRequests.map(renderRequestCard)
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Pump Picker Modal ── */}
      <Modal visible={pumpModalVisible} transparent animationType="slide" onRequestClose={() => setPumpModalVisible(false)}>
        <View style={styles.pumpModalOverlay}>
          <View style={styles.pumpModalSheet}>
            <View style={styles.pumpModalHandle} />
            <Text style={styles.pumpModalTitle}>Select Pump Station</Text>
            {pumps.length === 0 ? (
              <Text style={styles.emptyText}>No pumps available</Text>
            ) : (
              <FlatList
                data={pumps}
                keyExtractor={(p: any) => String(p.id)}
                renderItem={({ item }: any) => (
                  <TouchableOpacity style={styles.pumpItem} onPress={() => handleSelectPump(item)} activeOpacity={0.8}>
                    <View style={styles.pumpItemIcon}>
                      <Ionicons name="flash" size={18} color={C.yellow} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pumpItemName}>{item.name}</Text>
                      <Text style={styles.pumpItemSub}>{item.code} · {item.city}</Text>
                    </View>
                    {selectedPump?.id === item.id && (
                      <Ionicons name="checkmark-circle" size={22} color={C.green} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.pumpModalClose} onPress={() => setPumpModalVisible(false)}>
              <Text style={styles.pumpModalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.night },

  // ── Hero ──
  heroBg: { width: '100%' },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,18,32,0.8)' },
  neonBar: { height: 3, backgroundColor: C.neon, shadowColor: C.neon, shadowOpacity: 1, shadowRadius: 8, elevation: 8 },
  heroContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  rolePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,200,83,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.green, marginBottom: 6, alignSelf: 'flex-start' },
  rolePillText: { fontSize: 10, fontWeight: '800', color: C.green, letterSpacing: 1.5 },
  heroName: { fontSize: 22, fontWeight: '800', color: C.white },
  heroSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  avatarBtn: {},
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,200,83,0.12)', borderWidth: 2, borderColor: C.green, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: C.green },

  // ── Truck Strip ──
  truckStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.nightBorder, gap: 12 },
  truckStripText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  truckPlate: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFDE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: '#0B1220' },
  plateBlue: { backgroundColor: C.primary, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 2, marginRight: 5 },
  plateBlueTxt: { color: C.white, fontSize: 7, fontWeight: '900' },
  plateNum: { fontSize: 14, fontWeight: '900', color: '#0B1220', letterSpacing: 1 },
  truckMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fuelChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  fuelDiesel: { backgroundColor: 'rgba(0,184,255,0.12)', borderColor: 'rgba(0,184,255,0.3)' },
  fuelPetrol: { backgroundColor: 'rgba(255,201,40,0.12)', borderColor: 'rgba(255,201,40,0.3)' },
  fuelChipText: { fontSize: 11, fontWeight: '800' },
  capacityText: { fontSize: 11, color: C.textMuted, fontWeight: '600' },

  // ── Form ──
  scrollContent: { padding: 16, paddingBottom: 40 },
  formCard: { backgroundColor: C.nightCard, borderRadius: 20, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: C.nightBorder },
  formTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  formTitle: { fontSize: 17, fontWeight: '800', color: C.white },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.textSub, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' },
  dropdownBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.nightCard2, borderRadius: 12, borderWidth: 1, borderColor: C.nightBorder, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16 },
  dropdownText: { flex: 1, fontSize: 14, color: C.white, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.nightCard2, borderRadius: 12, borderWidth: 1, borderColor: C.nightBorder, paddingHorizontal: 14, marginBottom: 16 },
  input: { flex: 1, fontSize: 15, color: C.white, paddingVertical: 13 },
  unitLabel: { fontSize: 14, color: C.neon, fontWeight: '700' },
  submitBtn: { flexDirection: 'row', backgroundColor: C.yellow, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4, shadowColor: C.yellow, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  submitBtnText: { color: C.night, fontSize: 16, fontWeight: '800' },

  // ── Section & Requests ──
  sectionHeader: { fontSize: 16, fontWeight: '800', color: C.white, marginBottom: 12 },
  centerBox: { padding: 24, alignItems: 'center' },
  emptyBox: { alignItems: 'center', padding: 24 },
  emptyText: { color: C.textMuted, fontSize: 14, marginTop: 8 },

  reqCard: { backgroundColor: C.nightCard, borderRadius: 16, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.nightBorder },
  reqStatusBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  reqStatusText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  reqBody: { padding: 14 },
  reqHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reqNum: { fontSize: 15, fontWeight: '800', color: C.white },
  reqDate: { fontSize: 11, color: C.textMuted },
  reqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  reqGridItem: { backgroundColor: C.nightCard2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.nightBorder },
  reqKey: { fontSize: 10, color: C.textMuted, fontWeight: '600', marginBottom: 2 },
  reqVal: { fontSize: 13, color: C.white, fontWeight: '700' },
  reqPumpRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reqPumpText: { fontSize: 12, color: C.textMuted },
  reqRemarks: { fontSize: 12, color: C.textMuted, fontStyle: 'italic', marginTop: 6 },

  // ── Pump Modal ──
  pumpModalOverlay: { flex: 1, backgroundColor: 'rgba(11,18,32,0.9)', justifyContent: 'flex-end' },
  pumpModalSheet: { backgroundColor: C.nightCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: height * 0.7, borderWidth: 1, borderColor: C.nightBorder },
  pumpModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.nightBorder, alignSelf: 'center', marginBottom: 16 },
  pumpModalTitle: { fontSize: 18, fontWeight: '800', color: C.white, marginBottom: 16 },
  pumpItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.nightBorder, gap: 12 },
  pumpItemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,201,40,0.1)', borderWidth: 1, borderColor: 'rgba(255,201,40,0.3)', justifyContent: 'center', alignItems: 'center' },
  pumpItemName: { fontSize: 15, fontWeight: '700', color: C.white },
  pumpItemSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  pumpModalClose: { backgroundColor: C.nightCard2, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: C.nightBorder },
  pumpModalCloseText: { color: C.textMuted, fontWeight: '700', fontSize: 15 },
});