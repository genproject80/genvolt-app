import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getAllDevices,
  getDeviceById,
  createDevice,
  updateDevice,
  deleteDevice,
  transferDevice,
  getDeviceTransfers,
  getDeviceStats
} from '../controllers/deviceController.js';

const router = express.Router();

// Apply authentication to all device routes
router.use(authenticate);

/**
 * Validation rules for device creation
 */
const createDeviceValidation = [
  body('device_id')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device ID is required and must be between 1-100 characters'),
  body('client_id')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer'),
  body('channel_id')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('Channel ID must be less than 100 characters'),
  body('api_key')
    .optional({ checkFalsy: true })
    .isLength({ max: 255 })
    .withMessage('API key must be less than 255 characters'),
  body('Model')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('Model must be less than 100 characters'),
  body('machin_id')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('Machine ID must be less than 100 characters'),
  body('field_id')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('Field ID must be less than 100 characters'),
  body('TransactionTableID')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('Transaction Table ID must be a positive integer'),
  body('TransactionTableName')
    .optional({ checkFalsy: true })
    .isLength({ max: 255 })
    .withMessage('Transaction table name must be less than 255 characters'),
  body('conversionLogic_ld')
    .optional({ checkFalsy: true })
    .isString()
    .withMessage('Conversion logic must be a string')
];

/**
 * Validation rules for device updates
 */
const updateDeviceValidation = [
  body('device_id')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device ID must be between 1-100 characters'),
  body('client_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer'),
  body('channel_id')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Channel ID must be less than 100 characters'),
  body('api_key')
    .optional()
    .isLength({ max: 255 })
    .withMessage('API key must be less than 255 characters'),
  body('Model')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Model must be less than 100 characters'),
  body('machin_id')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Machine ID must be less than 100 characters'),
  body('field_id')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Field ID must be less than 100 characters'),
  body('TransactionTableID')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Transaction Table ID must be a positive integer'),
  body('TransactionTableName')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Transaction table name must be less than 255 characters'),
  body('conversionLogic_ld')
    .optional()
    .isString()
    .withMessage('Conversion logic must be a string')
];

/**
 * Validation rules for pagination and search
 */
const paginationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('clientId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters'),
  query('sortField')
    .optional()
    .isIn(['device_id', 'Model', 'client_name', 'onboarding_date'])
    .withMessage('Invalid sort field'),
  query('sortDirection')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage('Sort direction must be asc or desc')
];

/**
 * Routes with permission checks and validation
 */

// Get all devices with client-scoped filtering
router.get('/',
  requirePermission('View Device'),
  paginationValidation,
  getAllDevices
);

// Get device statistics
router.get('/stats',
  requirePermission('View Device'),
  getDeviceStats
);

// Get device by ID
router.get('/:id',
  requirePermission('View Device'),
  param('id')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),
  getDeviceById
);

// Get device transfer history
router.get('/:id/transfers',
  requirePermission('View Device'),
  param('id')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),
  getDeviceTransfers
);

// Create new device
router.post('/',
  requirePermission('Onboard Device'),
  createDeviceValidation,
  createDevice
);

// Update device
router.put('/:id',
  requirePermission('Onboard Device'),
  param('id')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),
  updateDeviceValidation,
  updateDevice
);

// Transfer device ownership
router.post('/:id/transfer',
  requirePermission('Onboard Device'),
  param('id')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),
  body('buyer_id')
    .isInt({ min: 1 })
    .withMessage('Buyer ID must be a positive integer'),
  transferDevice
);

// Delete device
router.delete('/:id',
  requirePermission('Remove Device'),
  param('id')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),
  deleteDevice
);

export default router;