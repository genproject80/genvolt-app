import React from 'react';
import HistoricDataTable from './HistoricDataTable';

const HistoricDataSection = ({
  deviceHistory,
  historyLoading,
  historyError,
  historyPagination,
  historyFilters,
  onHistoryPageChange,
  onHistoryFiltersChange,
  deviceId,
  onRowClick
}) => {
  const handleExport = () => {
    if (!deviceHistory || deviceHistory.length === 0) {
      alert('No data to export');
      return;
    }

    // Prepare CSV headers
    const headers = [
      'Entry ID',
      'Timestamp',
      'Device ID',
      'GSM Signal Strength',
      'Motor Status',
      'Motor ON Time (sec)',
      'Motor OFF Time (sec)',
      'Motor Current (mA)',
      'Wheels Configured',
      'Wheels Detected',
      'Latitude',
      'Longitude',
      'Fault Code',
      'Fault Descriptions',
      'Train Passed'
    ];

    // Format data rows
    const rows = deviceHistory.map(row => [
      row.Entry_ID || '',
      row.CreatedAt || row.Timestamp || '',
      row.Device_ID || '',
      row.GSM_Signal_Strength || '0',
      row.Motor_ON_Time_sec > 0 ? 'Running' : 'Stopped',
      row.Motor_ON_Time_sec || '0',
      row.Motor_OFF_Time_sec || '0',
      row.Motor_Current_mA || '0',
      row.Number_of_Wheels_Configured || '0',
      row.Number_of_Wheels_Detected || '0',
      row.Latitude || '',
      row.Longitude || '',
      row.Fault_Code && row.Fault_Code !== '0' ? row.Fault_Code : 'OK',
      row.FaultDescriptions || '',
      row.Train_Passed ? 'Yes' : 'No'
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape cells that contain commas, quotes, or newlines
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    // Generate filename with device ID and current date
    const date = new Date().toISOString().split('T')[0];
    const filename = `motor_device_${deviceId}_history_${date}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Historic Data for Motor Device {deviceId}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={historyLoading || !deviceHistory || deviceHistory.length === 0}
            className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => onHistoryFiltersChange && onHistoryFiltersChange(historyFilters)}
            className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Historic Data Content */}
      <div>
        <HistoricDataTable
          data={deviceHistory}
          loading={historyLoading}
          error={historyError}
          pagination={historyPagination}
          filters={historyFilters}
          onPageChange={onHistoryPageChange}
          onFiltersChange={onHistoryFiltersChange}
          onRowClick={onRowClick}
        />
      </div>
    </div>
  );
};

export default HistoricDataSection;