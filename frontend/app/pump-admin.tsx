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

export default function PumpAdminScreen() {
  const router = useRouter();

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

  const handleLogout = async () => {
    await removeToken();
    router.replace('/');
  };

  const statItems = [
    { icon: 'people', color: C.neon, bg: 'rgba(0,184,255,0.12)', label: 'Truck Owners', val: stats.total_customers },
    { icon: 'bus', color: C.green, bg: 'rgba(0,200,83,0.12)', label: 'Fleet Trucks', val: stats.total_trucks },
    { icon: 'person', color: C.yellow, bg: 'rgba(255,201,40,0.12)', label: 'Operators', val: stats.total_operators },
    { icon: 'water', color: '#9C27B0', bg: 'rgba(156,39,176,0.12)', label: 'Fuel Requests', val: stats.total_requests },
  ];

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

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.adminPill}>
              <Ionicons name="shield" size={11} color={C.yellow} style={{ marginRight: 4 }} />
              <Text style={styles.adminPillText}>PUMP ADMIN CONSOLE</Text>
            </View>
            <Text style={styles.headerTitle}>{pump?.name || 'Fuel Station'}</Text>
            <View style={styles.pumpCodeRow}>
              <Ionicons name="location-outline" size={13} color={C.neon} style={{ marginRight: 4 }} />
              <Text style={styles.pumpCodeText}>
                {pump?.code ? `${pump.code} · ` : ''}{pump?.city || 'Online'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={22} color={C.red} />
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
            onPress={() => setCreateCustomerModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={18} color={C.neon} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.neon }]}>+ Add Truck Owner</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: 'rgba(255,201,40,0.16)', borderColor: 'rgba(255,201,40,0.5)' }]}
            onPress={() => setCreateOperatorModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="key" size={18} color={C.yellow} style={{ marginRight: 6 }} />
            <Text style={[styles.actionBtnText, { color: C.yellow }]}>+ Add Operator</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs Bar ── */}
        <View style={styles.tabBar}>
          {[
            { key: 'customers', icon: 'people-outline', label: `Truck Owners (${customers.length})` },
            { key: 'operators', icon: 'settings-outline', label: `Operators (${operators.length})` },
            { key: 'pump', icon: 'business-outline', label: 'Station Info' },
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
                    <View style={[styles.custAvatar, { borderColor: C.yellow, backgroundColor: 'rgba(255,201,40,0.12)' }]}>
                      <Text style={[styles.custAvatarText, { color: C.yellow }]}>{(op.first_name || 'O').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>{op.full_name || op.first_name}</Text>
                      <View style={styles.custPhoneRow}>
                        <Ionicons name="call-outline" size={11} color={C.textSub} style={{ marginRight: 3 }} />
                        <Text style={styles.custPhone}>Login: {op.mobile_number}</Text>
                      </View>
                    </View>
                    <View style={[styles.truckBadge, { borderColor: 'rgba(255,201,40,0.4)', backgroundColor: 'rgba(255,201,40,0.12)' }]}>
                      <Text style={[styles.truckBadgeText, { color: C.yellow }]}>DISPENSER</Text>
                    </View>
                  </View>
                  <View style={styles.custFooter}>
                    <Text style={styles.custId}>ID: {op.employee_id || `OPER${op.id}`}</Text>
                    <Text style={[styles.statusTextBadge, op.must_change_password ? { color: C.yellow } : { color: C.green }]}>
                      {op.must_change_password ? 'Temp Password' : 'Password Active'}
                    </Text>
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
              <Ionicons name="flash" size={20} color={C.yellow} />
              <Text style={styles.pumpInfoTitle}>Station Overview</Text>
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
  heroBg: { width: '100%' },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,18,32,0.84)' },
  neonBar: { height: 3, backgroundColor: C.neon, shadowColor: C.neon, shadowOpacity: 1, shadowRadius: 8, elevation: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 22 },
  adminPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,201,40,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,201,40,0.4)', marginBottom: 6, alignSelf: 'flex-start' },
  adminPillText: { fontSize: 10, fontWeight: '800', color: C.yellow, letterSpacing: 1.5 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.white, marginBottom: 4 },
  pumpCodeRow: { flexDirection: 'row', alignItems: 'center' },
  pumpCodeText: { fontSize: 12, color: C.neon, fontWeight: '600' },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(229,57,53,0.12)', borderWidth: 1, borderColor: 'rgba(229,57,53,0.3)', justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 50 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: C.nightCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.nightBorder },
  statIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statVal: { fontSize: 24, fontWeight: '900', marginBottom: 2 },
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
  custCard: { backgroundColor: C.nightCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.nightBorder },
  custHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  custAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,184,255,0.12)', borderWidth: 1.5, borderColor: C.neon, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  custAvatarText: { fontSize: 17, fontWeight: '800', color: C.neon },
  custName: { fontSize: 15, fontWeight: '800', color: C.white },
  custPhoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  custUsername: { fontSize: 11, color: C.neon, fontWeight: '600' },
  custDivider: { fontSize: 10, color: C.textMuted, marginHorizontal: 6 },
  custPhone: { fontSize: 11, color: C.textSub },
  truckBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,184,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,184,255,0.3)' },
  truckBadgeText: { fontSize: 11, fontWeight: '800', color: C.neon },
  custFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: C.nightBorder },
  custId: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  activePill: { flexDirection: 'row', alignItems: 'center' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 5 },
  activePillText: { fontSize: 11, fontWeight: '700', color: C.green },
  statusTextBadge: { fontSize: 11, fontWeight: '700' },
  pumpInfoCard: { backgroundColor: C.nightCard, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.nightBorder },
  pumpInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.nightBorder },
  pumpInfoTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(30,46,74,0.5)' },
  infoKey: { fontSize: 13, color: C.textSub },
  infoVal: { fontSize: 13, color: C.white, fontWeight: '600' },
  adminInfoBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.nightCard2, borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: C.nightBorder },
  adminInfoLabel: { fontSize: 10, color: C.textSub, fontWeight: '700', textTransform: 'uppercase' },
  adminInfoName: { fontSize: 14, fontWeight: '800', color: C.white, marginTop: 1 },
  adminInfoMobile: { fontSize: 12, color: C.neon, marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.nightCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, borderWidth: 1, borderColor: C.nightBorder },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.nightBorder, alignSelf: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: C.white, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: C.textSub, textAlign: 'center', marginTop: 3, marginBottom: 16 },
  modalInputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: C.textSub, letterSpacing: 0.8, marginBottom: 5 },
  charCount: { fontSize: 11, fontWeight: '800' },
  textInput: { backgroundColor: C.nightCard2, borderRadius: 10, paddingHorizontal: 12, height: 46, color: C.white, fontSize: 14, borderWidth: 1, borderColor: C.nightBorder },
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
});
