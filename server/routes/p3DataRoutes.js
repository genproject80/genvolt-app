import express from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import {
  getP3Data,
  exportP3Data,
  getP3Stats
} from '../controllers/p3DataController.js';

const router = express.Router();

/**
 * Validation rules for P3 IoT data queries
 */
const p3DataQueryValidation = [
  query('device_ids')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed);
        } catch (e) {
          return typeof value === 'string';
        }
      }
      return Array.isArray(value);
    })
    .withMessage('Device IDs must be an array or comma-separated string'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters'),
  query('sort_field')
    .optional()
    .isIn([
      'Entry_ID', 'CreatedAt', 'Device_ID', 'Signal_Strength',
      'Event_Type', 'Latitude', 'Longitude', 'Battery_Voltage_mV',
      'machine_id', 'grease_left'
    ])
    .withMessage('Invalid sort field'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Sort order must be ASC or DESC')
];

/**
 * Validation rules for P3 data export
 */
const p3DataExportValidation = [
  query('device_ids')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed);
        } catch (e) {
          return typeof value === 'string';
        }
      }
      return Array.isArray(value);
    })
    .withMessage('Device IDs must be an array or comma-separated string'),
  query('search')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters'),
  query('format')
    .optional()
    .isIn(['json', 'csv'])
    .withMessage('Format must be json or csv'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Export limit must be between 1 and 10000')
];

/**
 * Validation rules for P3 data statistics
 */
const p3DataStatsValidation = [
  query('device_ids')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed);
        } catch (e) {
          return typeof value === 'string';
        }
      }
      return Array.isArray(value);
    })
    .withMessage('Device IDs must be an array or comma-separated string')
];

// All P3 data routes require authentication
router.use(authenticate);

/**
 * GET /api/iot-data/p3
 * Get P3 IoT data with device ID filtering and HKMI hierarchy
 * Query params:
 * - device_ids: Array of device IDs or comma-separated string
 * - page: Page number (default: 1)
 * - limit: Records per page (default: 20, max: 100)
 * - search: Search term for Device_ID, machine_id, or section
 * - sort_field: Field to sort by (default: CreatedAt)
 * - sort_order: ASC or DESC (default: DESC)
 * - sden, den, aen, sse: Hierarchy filters
 */
router.get('/',
  p3DataQueryValidation,
  getP3Data
);

/**
 * GET /api/iot-data/p3/export
 * Export filtered P3 IoT data
 * Query params:
 * - device_ids: Array of device IDs or comma-separated string
 * - search: Search term
 * - format: json or csv (default: json)
 * - limit: Maximum records to export (default: 10000, max: 10000)
 * - sden, den, aen, sse: Hierarchy filters
 */
router.get('/export',
  p3DataExportValidation,
  exportP3Data
);

/**
 * GET /api/iot-data/p3/stats
 * Get aggregated statistics for filtered P3 devices
 * Query params:
 * - device_ids: Array of device IDs or comma-separated string
 */
router.get('/stats',
  p3DataStatsValidation,
  getP3Stats
);

export default router;
