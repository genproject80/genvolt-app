import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import LoadingSpinner from '../common/LoadingSpinner';

const DeviceDetailsModal = ({ isOpen, onClose, device }) => {
  const { getDeviceTransferHistory } = useDevice();
  const [transferHistory, setTransferHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load transfer history when modal opens
  useEffect(() => {
    if (isOpen && device) {
      loadTransferHistory();
    }
  }, [isOpen, device]);

  const loadTransferHistory = async () => {
    if (!device?.id) return;

    try {
      setLoadingHistory(true);
      const history = await getDeviceTransferHistory(device.id);
      setTransferHistory(history?.transfers || []);
    } catch (error) {
      console.error('Failed to load transfer history:', error);
      setTransferHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (!device) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Device Details"
      size="lg"
    >
      <div className="space-y-6">
        {/* Device Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Device Information</h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600">Device ID</p>
                <p className="text-sm font-medium text-gray-900">{device.device_id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Machine ID</p>
                <p className="text-sm text-gray-900">{device.machin_id || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Model</p>
                <p className="text-sm text-gray-900">
                  {device.model_number ? (
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {device.model_number}
                    </span>
                  ) : (
                    'N/A'
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Channel ID</p>
                <p className="text-sm text-gray-900">{device.channel_id || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Current Client</p>
                <p className="text-sm text-gray-900">
                  {device.client_name ? (
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                      {device.client_name}
                    </span>
                  ) : (
                    'No client assigned'
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Onboarding Date</p>
                <p className="text-sm text-gray-900">{formatDate(device.onboarding_date)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transfer History */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Transfer History</h3>
          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : transferHistory.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600">No transfer history available</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      From Client
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      To Client
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transferHistory.map((transfer, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(transfer.transfer_date || transfer.assignment_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {transfer.seller_name || transfer.from_client || 'N/A'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {transfer.buyer_name || transfer.to_client || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceDetailsModal;
