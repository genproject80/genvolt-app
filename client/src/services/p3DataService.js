/**
 * P3 IoT Data Service
 * Handles API calls for P3 SICK sensor data
 */

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

/**
 * Helper function to make authenticated API calls
 */
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = localStorage.getItem('accessToken');

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch (e) {
      errorData = { message: errorText || 'An error occurred' };
    }
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch P3 IoT data with pagination and filters
 */
export const fetchP3Data = async ({
  deviceIds = [],
  page = 1,
  limit = 20,
  search = '',
  sortField = 'CreatedAt',
  sortOrder = 'DESC',
  sden = null,
  den = null,
  aen = null,
  sse = null,
  eventDate = null // Date filter for Motor Runs and Train Passed counts (format: YYYY-MM-DD)
} = {}) => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort_field: sortField,
    sort_order: sortOrder
  });

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  if (search) {
    params.append('search', search);
  }

  if (sden) params.append('sden', sden);
  if (den) params.append('den', den);
  if (aen) params.append('aen', aen);
  if (sse) params.append('sse', sse);
  if (eventDate) params.append('event_date', eventDate);

  return makeAuthenticatedRequest(`/iot-data/p3?${params}`);
};

/**
 * Export P3 IoT data
 */
export const exportP3Data = async ({
  deviceIds = [],
  search = '',
  format = 'json',
  limit = 10000,
  sden = null,
  den = null,
  aen = null,
  sse = null,
  eventDate = null // Date filter for Motor Runs and Train Passed counts (format: YYYY-MM-DD)
} = {}) => {
  const params = new URLSearchParams({
    format,
    limit: limit.toString()
  });

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  if (search) {
    params.append('search', search);
  }

  if (sden) params.append('sden', sden);
  if (den) params.append('den', den);
  if (aen) params.append('aen', aen);
  if (sse) params.append('sse', sse);
  if (eventDate) params.append('event_date', eventDate);

  return makeAuthenticatedRequest(`/iot-data/p3/export?${params}`);
};

/**
 * Download P3 data as CSV file
 */
export const downloadP3CSVExport = async ({
  deviceIds = [],
  search = '',
  filename = 'p3_data_export.csv',
  sden = null,
  den = null,
  aen = null,
  sse = null,
  eventDate = null // Date filter for Motor Runs and Train Passed counts (format: YYYY-MM-DD)
} = {}) => {
  const token = localStorage.getItem('accessToken');

  const params = new URLSearchParams({
    format: 'csv',
    limit: '10000'
  });

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  if (search) {
    params.append('search', search);
  }

  if (sden) params.append('sden', sden);
  if (den) params.append('den', den);
  if (aen) params.append('aen', aen);
  if (sse) params.append('sse', sse);
  if (eventDate) params.append('event_date', eventDate);

  const response = await fetch(`${API_BASE}/iot-data/p3/export?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * Fetch P3 IoT data statistics
 */
export const fetchP3Stats = async ({ deviceIds = [] } = {}) => {
  const params = new URLSearchParams();

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  return makeAuthenticatedRequest(`/iot-data/p3/stats?${params}`);
};

export const p3DataService = {
  fetchP3Data,
  exportP3Data,
  downloadP3CSVExport,
  fetchP3Stats
};

export default p3DataService;
