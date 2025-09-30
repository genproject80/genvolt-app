import express from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import {
  getIoTData,
  exportIoTData,
  getIoTDataStats
} from '../controllers/iotDataController.js';

const router = express.Router();

/**
 * Validation rules for IoT data queries
 */
const iotDataQueryValidation = [
  query('device_ids')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed);
        } catch (e) {
          // Also allow comma-separated string
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
      'Entry_ID', 'CreatedAt', 'Device_ID', 'MessageType', 'Timestamp',
      'GSM_Signal_Strength', 'Motor_ON_Time_sec', 'Motor_OFF_Time_sec',
      'Latitude', 'Longitude', 'Train_Passed'
    ])
    .withMessage('Invalid sort field'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Sort order must be ASC or DESC')
];

/**
 * Validation rules for IoT data export
 */
const iotDataExportValidation = [
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
 * Validation rules for IoT data statistics
 */
const iotDataStatsValidation = [
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

// All IoT data routes require authentication
router.use(authenticate);

/**
 * GET /api/iot-data/sick
 * Get IoT data with device ID filtering
 * Query params:
 * - device_ids: Array of device IDs or comma-separated string
 * - page: Page number (default: 1)
 * - limit: Records per page (default: 20, max: 100)
 * - search: Search term for Device_ID, MessageType, or FaultDescriptions
 * - sort_field: Field to sort by (default: Timestamp)
 * - sort_order: ASC or DESC (default: DESC)
 */
router.get('/sick',
  iotDataQueryValidation,
  getIoTData
);

/**
 * GET /api/iot-data/sick/export
 * Export filtered IoT data
 * Query params:
 * - device_ids: Array of device IDs or comma-separated string
 * - search: Search term
 * - format: json or csv (default: json)
 * - limit: Maximum records to export (default: 10000, max: 10000)
 */
router.get('/sick/export',
  iotDataExportValidation,
  exportIoTData
);

/**
 * GET /api/iot-data/sick/stats
 * Get aggregated statistics for filtered devices
 * Query params:
 * - device_ids: Array of device IDs or comma-separated string
 */
router.get('/sick/stats',
  iotDataStatsValidation,
  getIoTDataStats
);

export default router;