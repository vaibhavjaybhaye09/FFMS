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
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../src/api/client';

export default function OperatorScreen() {
  const router = useRouter();

  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  // Approval modal state (for manual fallback)
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [manualNumber, setManualNumber] = useState('');
  const [loadingApprove, setLoadingApprove] = useState(false);

  // OCR state
  const [verifyingId, setVerifyingId] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const response = await apiClient.get('/api/fuel-requests/operator-queue/');
      setQueue(response.data?.fuel_requests || []);
    } catch (error) {
      console.error('Error loading queue:', error);
      setQueue([]);
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const openApproveModal = (request) => {
    setSelectedRequest(request);
    setManualNumber('');
  };

  const closeApproveModal = () => {
    setSelectedRequest(null);
    setManualNumber('');
  };

  const handleApprove = async () => {
    if (!manualNumber) {
      Alert.alert('Missing fields', 'Please enter the vehicle number manually.');
      return;
    }

    setLoadingApprove(true);

    try {
      const response = await apiClient.post(`/api/fuel-requests/${selectedRequest.id}/manual-verify/`, {
        manual_number: manualNumber,
      });

      Alert.alert('Request approved', response.data?.message || 'Fuel request approved successfully.');
      closeApproveModal();
      loadQueue(); // Refresh the list
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Unable to approve this request.';

      Alert.alert('Approval failed', message);
    } finally {
      setLoadingApprove(false);
    }
  };

  const handleVerify = async (request) => {
    // 1. Launch Camera
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Permission required", "Camera access is needed to scan the number plate.");
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      quality: 0.8, // Good quality for OCR
    });

    if (pickerResult.canceled) {
      return;
    }

    const imageUri = pickerResult.assets[0].uri;

    // 2. Upload image to verify-vehicle endpoint
    setVerifyingId(request.id);
    
    const formData = new FormData();
    formData.append('vehicle_image', {
      uri: imageUri,
      name: 'plate.jpg',
      type: 'image/jpeg',
    } as any);

    try {
      const response = await apiClient.post(`/api/fuel-requests/${request.id}/verify-vehicle/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data?.status === 'APPROVED') {
        Alert.alert('Approved!', response.data.message);
        loadQueue();
      } else if (response.data?.status === 'REJECTED') {
        Alert.alert('Verification Failed', response.data.message);
        loadQueue();
      } else if (response.data?.status === 'MANUAL_REQUIRED') {
        Alert.alert('OCR Failed', response.data.message);
        openApproveModal(request); // Fallback to manual entry
      }

    } catch (error) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.response?.data?.detail || 'Error communicating with server for OCR.';
      Alert.alert('Error', msg);
    } finally {
      setVerifyingId(null);
    }
  };

  const renderRequestCard = (item) => (
    <View key={item.id} style={styles.requestCard}>
      <View style={styles.requestCardHeader}>
        <Text style={styles.requestNumber}>{item.request_number}</Text>
        <Text style={styles.timeText}>{new Date(item.created_at).toLocaleTimeString()}</Text>
      </View>

      <Text style={styles.requestLine}>
        Truck: <Text style={styles.requestLineValue}>{item.truck_number}</Text>
      </Text>
      <Text style={styles.requestLine}>
        Driver: <Text style={styles.requestLineValue}>{item.driver_name || 'N/A'}</Text>
      </Text>
      <Text style={styles.requestLine}>
        Fuel: <Text style={styles.requestLineValue}>{item.fuel_type}</Text>
      </Text>
      <Text style={styles.requestLine}>
        Requested: <Text style={styles.requestLineValue}>{item.requested_liters} L</Text>
      </Text>
      {item.remarks ? <Text style={styles.requestLine}>Remarks: {item.remarks}</Text> : null}

      <TouchableOpacity 
        style={styles.approveButton} 
        onPress={() => handleVerify(item)}
        disabled={verifyingId === item.id}
      >
        {verifyingId === item.id ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.approveButtonText}>Verify & Approve (OCR)</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Operator Dashboard</Text>
            <Text style={styles.subtitle}>Pending fuel requests</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/operator-profile')}>
            <Text style={styles.profileButtonText}>Profile</Text>
          </TouchableOpacity>
        </View>

        {loadingQueue ? (
          <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
        ) : queue.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No pending requests for your pump.</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={loadQueue}>
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {queue.map(renderRequestCard)}
            <TouchableOpacity style={[styles.refreshButton, { marginTop: 16 }]} onPress={loadQueue}>
              <Text style={styles.refreshButtonText}>Refresh Queue</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Approval Modal */}
      <Modal visible={!!selectedRequest} transparent animationType="slide" onRequestClose={closeApproveModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approve Request</Text>
              <TouchableOpacity onPress={closeApproveModal}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>
              Verify truck number for request <Text style={{ fontWeight: '700' }}>{selectedRequest?.request_number}</Text>
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter truck number plate"
              value={manualNumber}
              onChangeText={setManualNumber}
              autoCapitalize="characters"
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleApprove} disabled={loadingApprove}>
              {loadingApprove ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Confirm & Approve</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    marginBottom: 24,
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
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 16,
    marginBottom: 16,
  },
  refreshButton: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  refreshButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  requestCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  requestNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  timeText: {
    fontSize: 12,
    color: '#64748b',
  },
  requestLine: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 4,
  },
  requestLineValue: {
    color: '#0f172a',
    fontWeight: '600',
  },
  approveButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 14,
  },
  approveButtonText: {
    color: '#fff',
    fontWeight: '700',
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
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    color: '#64748b',
    fontWeight: '600',
  },
  modalLabel: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    marginBottom: 16,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});