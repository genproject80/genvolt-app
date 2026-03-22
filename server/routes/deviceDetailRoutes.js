import express from 'express';
import { body, param, query } from 'express-validator';
import { getDeviceDetails, getDeviceHistory } from '../controllers/deviceDetailController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Debug logging for all device detail routes
router.use((req, res, next) => {
  next();
});

// Apply authentication to all device detail routes
router.use(authenticate);

/**
 * GET /api/device-details/:entryId
 * Get detailed device information for specific IoT entry
 */
router.get('/:entryId',
  [
    param('entryId')
      .notEmpty()
      .withMessage('Entry ID is required')
      .isNumeric()
      .withMessage('Entry ID must be a number')
  ],
  getDeviceDetails
);

/**
 * GET /api/device-details/:entryId/history
 * Get historical IoT data for a specific entry
 */
router.get('/:entryId/history',
  [
    param('entryId')
      .notEmpty()
      .withMessage('Entry ID is required')
      .isNumeric()
      .withMessage('Entry ID must be a number'),
    query('timeRange')
      .optional()
      .isIn(['all', '2h', '24h', '7d', '30d'])
      .withMessage('Time range must be one of: all, 2h, 24h, 7d, 30d'),
    query('status')
      .optional()
      .isIn(['all', 'active', 'fault'])
      .withMessage('Status must be one of: all, active, fault'),
    query('search')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Search term must not exceed 100 characters'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sortField')
      .optional()
      .isIn(['timestamp', 'runtime', 'power_status', 'hv_output_voltage', 'hv_output_current'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['ASC', 'DESC'])
      .withMessage('Sort order must be ASC or DESC')
  ],
  getDeviceHistory
);

export default router;