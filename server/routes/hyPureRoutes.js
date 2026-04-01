import express from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { getHyPureOverview, getHyPureData, getHyPureDevicesLatest } from '../controllers/hyPureController.js';

const router = express.Router();

const deviceIdsValidation = query('device_ids')
  .optional()
  .custom((value) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed);
      } catch {
        return typeof value === 'string';
      }
    }
    return Array.isArray(value);
  })
  .withMessage('Device IDs must be an array or comma-separated string');

const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sort_field')
    .optional()
    .isIn(['Entry_ID', 'CreatedAt', 'Device_ID', 'kV_Value', 'mA_Value', 'Pressure', 'Temperature'])
    .withMessage('Invalid sort field'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Sort order must be ASC or DESC')
];

router.use(authenticate);

/**
 * GET /api/hypure/devices/latest
 * Most recent row per device, for the Device Overview table.
 */
router.get('/devices/latest', getHyPureDevicesLatest);

/**
 * GET /api/hypure/overview
 * Latest row + last N rows (history) for the dashboard overview widgets.
 */
router.get('/overview', [deviceIdsValidation], getHyPureOverview);

/**
 * GET /api/hypure
 * Paginated data for the Detailed Data table.
 */
router.get('/', [deviceIdsValidation, ...paginationValidation], getHyPureData);

export default router;