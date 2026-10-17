import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient, { BASE_URL } from '../src/api/client';
import { getUser } from '../src/storage/token';

const C = {
  primary:    '#0284C7',
  yellow:     '#D97706',
  white:      '#FFFFFF',
  red:        '#DC2626',
  green:      '#16A34A',
  bg:         '#F8FAFC',
  card:       '#FFFFFF',
  card2:      '#F1F5F9',
  border:     '#E2E8F0',
  borderStrong:'#CBD5E1',
  text:       '#0F172A',
  textMuted:  '#64748B',
  textSub:    '#334155',
  night:      '#F8FAFC',
  nightCard:  '#FFFFFF',
  nightCard2: '#F1F5F9',
  nightBorder:'#E2E8F0',
  neon:       '#0284C7',
};

export default function OperatorCompletedScreen() {
  const router = useRouter();

  const [completedRequests, setCompletedRequests] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    total_requests: 0,
    total_liters: 0,
    diesel_liters: 0,
    petrol_liters: 0,
    period: 'Last 30 Days',
    pump_name: '',
    pump_code: '',
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/fuel-requests/operator-completed/');
      setCompletedRequests(response.data?.fuel_requests || []);
      if (response.data?.stats) {
        setStats(response.data.stats);
      }
    } catch (error: any) {
      console.error('Error loading operator completed requests:', error);
      setCompletedRequests([]);
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

  const filteredRequests = completedRequests.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.request_number?.toLowerCase().includes(q) ||
      item.truck_number?.toLowerCase().includes(q) ||
      item.driver_name?.toLowerCase().includes(q) ||
      item.customer_name?.toLowerCase().includes(q)
    );
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Completed Dispensing</Text>
          <Text style={styles.headerSubtitle}>
            {stats.pump_name ? `${stats.pump_name} · Last 30 Days` : 'Past 1 Month History'}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.8}>
          <Ionicons name="reload" size={18} color={C.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.green]} tintColor={C.green} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 30-Day Summary Banner ── */}
        <View style={styles.summaryBanner}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryLabel}>TOTAL DISPENSED (LAST 1 MONTH)</Text>
              <Text style={styles.summaryTotalVal}>
                {stats.total_liters} <Text style={{ fontSize: 16, color: C.green }}>LITRES</Text>
              </Text>
            </View>
            <View style={styles.summaryBadge}>
              <Ionicons name="calendar-outline" size={13} color={C.neon} style={{ marginRight: 4 }} />
              <Text style={styles.summaryBadgeText}>30 Days</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryGrid}>
            <View style={styles.summaryGridItem}>
              <Text style={styles.summaryGridKey}>Total Dispensed</Text>
              <Text style={styles.summaryGridVal}>{stats.total_requests} Trucks</Text>
            </View>
            <View style={styles.summaryGridItem}>
              <Text style={styles.summaryGridKey}>Diesel Total</Text>
              <Text style={[styles.summaryGridVal, { color: C.neon }]}>{stats.diesel_liters} L</Text>
            </View>
            <View style={styles.summaryGridItem}>
              <Text style={styles.summaryGridKey}>Petrol Total</Text>
              <Text style={[styles.summaryGridVal, { color: C.yellow }]}>{stats.petrol_liters} L</Text>
            </View>
          </View>
        </View>

        {/* ── Search Bar ── */}
        {completedRequests.length > 0 && (
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={C.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter by plate, request #, or driver..."
              placeholderTextColor={C.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── List ── */}
        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={C.green} />
            <Text style={styles.loadingText}>Loading 30-day dispensing records...</Text>
          </View>
        ) : filteredRequests.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="file-tray-outline" size={44} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No Matching Records' : 'No Completed Requests'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Try a different search term.'
                : 'No fuel was dispensed at this pump in the last 30 days.'}
            </Text>
          </View>
        ) : (
          filteredRequests.map((item) => (
            <View key={item.id} style={styles.requestCard}>
              <View style={styles.cardAccent} />

              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.requestNum}>{item.request_number}</Text>
                  <Text style={styles.requestTime}>
                    Dispensed:{' '}
                    {item.completed_at
                      ? new Date(item.completed_at).toLocaleString()
                      : new Date(item.approved_at || item.created_at).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.completedStatusBadge}>
                  <Ionicons name="checkmark-circle" size={13} color={C.green} style={{ marginRight: 4 }} />
                  <Text style={styles.completedStatusText}>DISPENSED</Text>
                </View>
              </View>

              <View style={styles.plateSection}>
                <View style={styles.plateBox}>
                  <View style={styles.plateBlueBadge}><Text style={styles.plateBlueTxt}>IND</Text></View>
                  <Text style={styles.plateNum}>{item.truck_number}</Text>
                </View>
                <View style={styles.litersBox}>
                  <Text style={styles.litersNum}>{item.approved_liters || item.requested_liters}</Text>
                  <Text style={styles.litersUnit}>LITRES DISPENSED</Text>
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
                <View style={styles.infoRow}>
                  <Ionicons name="checkmark-done-outline" size={15} color={C.green} />
                  <Text style={styles.infoKey}>Operator</Text>
                  <Text style={[styles.infoVal, { color: C.green }]}>{item.operator_name || 'Pump Operator'}</Text>
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
              </View>

              {/* Dispensed Verification Photos */}
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
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(2,132,199,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  headerSubtitle: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // ── Summary Banner ──
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

  // ── Search ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 16,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 13, fontWeight: '500' },

  // ── Request Card ──
  requestCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardAccent: { height: 4, backgroundColor: C.green },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 10,
  },
  requestNum: { fontSize: 16, fontWeight: '800', color: C.text },
  requestTime: { fontSize: 11, color: C.textMuted, marginTop: 2 },
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

  plateSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  plateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDE7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 2,
    borderColor: '#0B1220',
  },
  plateBlueBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginRight: 6,
  },
  plateBlueTxt: { color: C.white, fontSize: 8, fontWeight: '900' },
  plateNum: { fontSize: 17, fontWeight: '900', color: '#0B1220', letterSpacing: 1.5 },
  litersBox: { alignItems: 'flex-end' },
  litersNum: { fontSize: 26, fontWeight: '900', color: C.green },
  litersUnit: { fontSize: 9, color: C.green, letterSpacing: 1.5, fontWeight: '700' },

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
  infoKey: { fontSize: 12, color: C.textMuted, fontWeight: '600', width: 55 },
  infoVal: { fontSize: 13, color: C.text, fontWeight: '700', flex: 1 },

  centerBox: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: C.textMuted, fontSize: 13 },
  emptyCard: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 },
  emptySubtitle: { fontSize: 12, color: C.textMuted, textAlign: 'center', lineHeight: 18 },

  // ── History Photos ──
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
    fontSize: 10,
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
