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
} from 'react-native';
import { useRouter } from 'expo-router';
import apiClient from '../src/api/client';
import { getUser, getToken } from '../src/storage/token';

const STATUS_COLORS = {
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  APPROVED: { bg: '#dbeafe', text: '#1d4ed8' },
  VERIFIED: { bg: '#ccfbf1', text: '#0f766e' },
  COMPLETED: { bg: '#dcfce7', text: '#166534' },
  REJECTED: { bg: '#fee2e2', text: '#b91c1c' },
};

export default function DriverScreen() {
  const router = useRouter();

  // Driver + truck info (auto-loaded, not typed manually)
  const [driverName, setDriverName] = useState('');
  const [truck, setTruck] = useState(null); // { id, truck_number, fuel_type, capacity_liters }
  const [truckLoading, setTruckLoading] = useState(true);

  // Pumps for the dropdown
  const [pumps, setPumps] = useState([]);
  const [selectedPump, setSelectedPump] = useState(null); // { id, name, code, city }
  const [pumpModalVisible, setPumpModalVisible] = useState(false);
  const [pumpsLoading, setPumpsLoading] = useState(true);

  // Request form
  const [requestedLiters, setRequestedLiters] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Request history
  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const loadDriverAndTruck = useCallback(async () => {
    setTruckLoading(true);
    try {
      const user = await getUser();
      console.log('Driver user data:', user);
      setDriverName(user?.name || user?.first_name || 'Driver');

      // Debug: Check token
      const token = await getToken();
      console.log('[Driver] Token in storage:', token ? `✓ Found (${token.substring(0, 20)}...)` : '✗ NOT FOUND');

      const response = await apiClient.get('/api/my-truck/');
      console.log('Truck response:', response.data);
      setTruck(response.data?.truck || null);
    } catch (error) {
      console.error('Error loading driver/truck:', error.message);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
      setTruck(null);
    } finally {
      setTruckLoading(false);
    }
  }, []);

  const loadPumps = useCallback(async () => {
    setPumpsLoading(true);
    try {
      const response = await apiClient.get('/api/pumps/');
      console.log('Pumps response:', response.data);
      setPumps(response.data?.pumps || []);
    } catch (error) {
      console.error('Error loading pumps:', error.message);
      console.error('Error details:', error.response?.data);
      setPumps([]);
    } finally {
      setPumpsLoading(false);
    }
  }, []);

  const loadMyRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const response = await apiClient.get('/api/fuel-requests/mine/');
      console.log('My requests response:', response.data);
      setMyRequests(response.data?.fuel_requests || []);
    } catch (error) {
      console.error('Error loading requests:', error.message);
      console.error('Error details:', error.response?.data);
      setMyRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDriverAndTruck();
    loadPumps();
    loadMyRequests();
  }, [loadDriverAndTruck, loadPumps, loadMyRequests]);

  const handleSelectPump = (pump) => {
    setSelectedPump(pump);
    setPumpModalVisible(false);
  };

  const handleSubmit = async () => {
    if (!truck) {
      Alert.alert('No truck assigned', 'You do not have a truck assigned yet. Contact your admin.');
      return;
    }

    if (!selectedPump) {
      Alert.alert('Select a pump', 'Please choose a pump from the list.');
      return;
    }

    if (!requestedLiters) {
      Alert.alert('Missing fields', 'Please enter the fuel quantity.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiClient.post('/api/fuel-requests/create/', {
        truck: truck.id,
        pump: selectedPump.id,
        fuel_type: truck.fuel_type,
        requested_liters: Number(requestedLiters),
        remarks,
      });

      Alert.alert(
        'Request sent',
        `Fuel request created successfully. Status: ${response.data?.fuel_request?.status || 'PENDING'}`
      );

      setRequestedLiters('');
      setRemarks('');
      setSelectedPump(null);

      loadMyRequests();
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error?.response?.data?.non_field_errors?.[0] ||
        error?.response?.data?.fuel_type ||
        error?.response?.data?.requested_liters ||
        'Unable to create fuel request.';

      Alert.alert('Request failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRequestCard = (item) => {
    const colors = STATUS_COLORS[item.status] || STATUS_COLORS.PENDING;

    return (
      <View key={item.id} style={styles.requestCard}>
        <View style={styles.requestCardHeader}>
          <Text style={styles.requestNumber}>{item.request_number}</Text>
          <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.statusBadgeText, { color: colors.text }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.requestLine}>
          Truck: <Text style={styles.requestLineValue}>{item.truck_number}</Text>
        </Text>
        <Text style={styles.requestLine}>
          Pump: <Text style={styles.requestLineValue}>{item.pump_name}</Text>
        </Text>
        <Text style={styles.requestLine}>
          Fuel: <Text style={styles.requestLineValue}>{item.fuel_type}</Text>
        </Text>
        <Text style={styles.requestLine}>
          Requested: <Text style={styles.requestLineValue}>{item.requested_liters} L</Text>
          {item.approved_liters ? (
            <Text style={styles.requestLine}>  •  Approved: <Text style={styles.requestLineValue}>{item.approved_liters} L</Text></Text>
          ) : null}
        </Text>
        {item.remarks ? <Text style={styles.requestLine}>Remarks: {item.remarks}</Text> : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Create Fuel Request</Text>
            <Text style={styles.subtitle}>Driver dashboard</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/driver-profile')}>
            <Text style={styles.profileButtonText}>Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Driver + truck info (auto-loaded) */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Driver</Text>
            <Text style={styles.infoValue}>{driverName}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Truck</Text>
            {truckLoading ? (
              <ActivityIndicator size="small" color="#16a34a" />
            ) : truck ? (
              <Text style={styles.infoValue}>
                {truck.truck_number} ({truck.fuel_type})
              </Text>
            ) : (
              <Text style={styles.infoValueMuted}>Not assigned</Text>
            )}
          </View>
        </View>

        {!truckLoading && !truck && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              No truck is assigned to you yet. Contact your admin before creating a request.
            </Text>
          </View>
        )}

        {/* Pump dropdown */}
        <Text style={styles.fieldLabel}>Select Pump</Text>
        <TouchableOpacity
          style={styles.dropdownField}
          onPress={() => setPumpModalVisible(true)}
          disabled={pumpsLoading}
        >
          {pumpsLoading ? (
            <ActivityIndicator size="small" color="#16a34a" />
          ) : (
            <Text style={selectedPump ? styles.dropdownText : styles.dropdownPlaceholder}>
              {selectedPump ? `${selectedPump.name} (${selectedPump.code})` : 'Choose a pump'}
            </Text>
          )}
          <Text style={styles.dropdownChevron}>▾</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Requested liters"
          value={requestedLiters}
          onChangeText={setRequestedLiters}
          keyboardType="numeric"
        />

        <TextInput
          style={[styles.input, styles.remarksInput]}
          placeholder="Remarks (optional)"
          value={remarks}
          onChangeText={setRemarks}
          multiline
        />

        <TouchableOpacity
          style={[styles.button, (submitting || !truck) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !truck}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Request</Text>}
        </TouchableOpacity>

        {/* Request history */}
        <Text style={styles.sectionTitle}>Your Requests</Text>

        {requestsLoading ? (
          <ActivityIndicator size="small" color="#16a34a" style={{ marginTop: 12 }} />
        ) : myRequests.length === 0 ? (
          <Text style={styles.emptyText}>You have not made any fuel requests yet.</Text>
        ) : (
          myRequests.map(renderRequestCard)
        )}
      </ScrollView>

      {/* Pump selection modal */}
      <Modal
        visible={pumpModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPumpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Pump</Text>
              <TouchableOpacity onPress={() => setPumpModalVisible(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={pumps}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={<Text style={styles.emptyText}>No active pumps found.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pumpOption} onPress={() => handleSelectPump(item)}>
                  <Text style={styles.pumpOptionName}>{item.name}</Text>
                  <Text style={styles.pumpOptionMeta}>{item.code} • {item.city}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 15,
    color: '#475569',
  },
  profileButton: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  profileButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '700',
  },
  infoValueMuted: {
    fontSize: 15,
    color: '#dc2626',
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  warningText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 6,
  },
  dropdownField: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 16,
    color: '#0f172a',
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: '#94a3b8',
  },
  dropdownChevron: {
    fontSize: 16,
    color: '#64748b',
  },
  input: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    fontSize: 16,
  },
  remarksInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 28,
    marginBottom: 12,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  requestCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  requestNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  requestLine: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 2,
  },
  requestLineValue: {
    color: '#0f172a',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    color: '#2563eb',
    fontWeight: '600',
  },
  pumpOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pumpOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  pumpOptionMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
});