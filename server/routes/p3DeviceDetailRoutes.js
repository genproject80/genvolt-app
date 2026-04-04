import express from 'express';
import { param, query } from 'express-validator';
import { getP3DeviceDetails, getP3DeviceHistory } from '../controllers/p3DeviceDetailController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Debug logging for all P3 device detail routes
router.use((req, res, next) => {
  next();
});

// Apply authentication to all P3 device detail routes
router.use(authenticate);

/**
 * GET /api/p3-device-details/:entryId
 * Get detailed P3 device information for specific IoT entry
 */
router.get('/:entryId',
  [
    param('entryId')
      .notEmpty()
      .withMessage('Entry ID is required')
      .isNumeric()
      .withMessage('Entry ID must be a number')
  ],
  getP3DeviceDetails
);

/**
 * GET /api/p3-device-details/:entryId/history
 * Get historical P3 IoT data for a specific entry
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
      .isIn(['CreatedAt', 'Entry_ID', 'Signal_Strength', 'Motor_Current_Average_mA', 'Battery_Voltage_mV', 'Event_Type'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['ASC', 'DESC'])
      .withMessage('Sort order must be ASC or DESC')
  ],
  getP3DeviceHistory
);

export default router;
