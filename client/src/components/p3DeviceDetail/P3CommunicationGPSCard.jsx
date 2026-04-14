import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const P3CommunicationGPSCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Communication & IMSI</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  const commGps = data?.communication_gps;
  const imsi = commGps?.imsi ?? data?.IMSI;
  const gsmSignal = commGps?.gsm_signal ?? data?.GSM_Signal_Strength ?? 0;

  const getSignalBadge = (strength) => {
    if (strength >= 5) return { label: 'Excellent', className: 'bg-gray-100 text-gray-600' };
    if (strength >= 4) return { label: 'Good', className: 'bg-green-100 text-green-600' };
    if (strength >= 3) return { label: 'Fair', className: 'bg-yellow-100 text-yellow-600' };
    if (strength >= 1) return { label: 'Poor', className: 'bg-red-100 text-red-600' };
    return { label: 'No Signal', className: 'bg-gray-100 text-gray-600' };
  };

  const signalBadge = getSignalBadge(gsmSignal);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        Communication & IMSI
      </h3>

      <div className="space-y-3">
        {/* GSM Signal */}
        <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-200">
          <span className="text-sm text-gray-600">GSM Signal:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{gsmSignal}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${signalBadge.className}`}>
              {signalBadge.label}
            </span>
          </div>
        </div>

        {/* IMSI */}
        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-gray-600">IMSI:</span>
          <span className="text-sm font-medium text-gray-900 font-mono">
            {imsi != null ? imsi : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default P3CommunicationGPSCard;
