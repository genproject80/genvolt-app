/**
 * P3 IoT Data Service
 * Handles API calls for P3 SICK sensor data
 */

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`;

//const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

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

/**
 * Fetch P3 service metrics (curves with last_service_date > 15 days)
 */
export const fetchP3ServiceMetrics = async ({ deviceIds = [] } = {}) => {
  const params = new URLSearchParams();

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  return makeAuthenticatedRequest(`/iot-data/p3/service-metrics?${params}`);
};

/**
 * Fetch P3 CoF metrics (curves with last_cof_value > 0.25)
 */
export const fetchP3CofMetrics = async ({ deviceIds = [] } = {}) => {
  const params = new URLSearchParams();

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  return makeAuthenticatedRequest(`/iot-data/p3/cof-metrics?${params}`);
};

/**
 * Fetch P3 CoF date metrics (curves with last_cof_date > 1 month)
 */
export const fetchP3CofDateMetrics = async ({ deviceIds = [] } = {}) => {
  const params = new URLSearchParams();

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  return makeAuthenticatedRequest(`/iot-data/p3/cof-date-metrics?${params}`);
};

/**
 * Fetch P3 grease metrics (curves with grease_left < 40 kg)
 */
export const fetchP3GreaseMetrics = async ({ deviceIds = [] } = {}) => {
  const params = new URLSearchParams();

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  return makeAuthenticatedRequest(`/iot-data/p3/grease-metrics?${params}`);
};

/**
 * Fetch P3 device status metrics (Active vs Inactive counts)
 */
export const fetchP3StatusMetrics = async ({ deviceIds = [] } = {}) => {
  const params = new URLSearchParams();

  if (deviceIds.length > 0) {
    params.append('device_ids', JSON.stringify(deviceIds));
  }

  return makeAuthenticatedRequest(`/iot-data/p3/status-metrics?${params}`);
};

export const p3DataService = {
  fetchP3Data,
  exportP3Data,
  downloadP3CSVExport,
  fetchP3Stats,
  fetchP3ServiceMetrics,
  fetchP3CofMetrics,
  fetchP3CofDateMetrics,
  fetchP3GreaseMetrics,
  fetchP3StatusMetrics
};

export default p3DataService;
