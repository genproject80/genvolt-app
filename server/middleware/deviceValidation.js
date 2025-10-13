import { body, param, query } from 'express-validator';
import { handleValidationErrors } from './validation.js';
import { Device } from '../models/Device.js';
import { Client } from '../models/Client.js';

/**
 * Validation middleware for device operations
 */

// Device ID (path parameter) validation
export const validateDeviceId = [
  param('deviceId')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),
  handleValidationErrors
];

// Create device validation
export const createDeviceValidation = [
  body('device_id')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .isLength({ min: 3, max: 100 }).withMessage('Device ID must be 3-100 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Device ID can only contain letters, numbers, underscores, and hyphens')
    .custom(async (value) => {
      const exists = await Device.checkDeviceIdExists(value);
      if (exists) {
        throw new Error('Device ID already exists');
      }
      return true;
    }),

  body('client_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('Valid client ID required if provided')
    .custom(async (value) => {
      if (value) {
        const client = await Client.findById(value);
        if (!client) {
          throw new Error('Client not found');
        }
      }
      return true;
    }),

  body('channel_id')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Channel ID must be less than 100 characters'),

  body('api_key')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('API key must be less than 255 characters'),

  body('conversionLogic_ld')
    .optional({ values: 'falsy' })
    .isString().withMessage('Conversion logic must be a string'),

  body('TransactionTableID')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('Transaction Table ID must be a positive integer'),

  body('TransactionTableName')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 }).withMessage('Transaction Table Name must be less than 255 characters'),

  body('field_id')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Field ID must be less than 100 characters'),

  body('Model')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Model must be 2-100 characters if provided'),

  body('machin_id')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('Machine ID must be less than 100 characters'),

  body('onboarding_date')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      if (new Date(value) > new Date()) {
        throw new Error('Onboarding date cannot be in the future');
      }
      return true;
    }),

  handleValidationErrors
];

// Update device validation
export const updateDeviceValidation = [
  param('deviceId')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),

  body('device_id')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Device ID must be 3-100 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Device ID can only contain letters, numbers, underscores, and hyphens')
    .custom(async (value, { req }) => {
      if (value) {
        const exists = await Device.checkDeviceIdExists(value, parseInt(req.params.deviceId));
        if (exists) {
          throw new Error('Device ID already exists');
        }
      }
      return true;
    }),

  body('client_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('Valid client ID required if provided')
    .custom(async (value) => {
      if (value) {
        const client = await Client.findById(value);
        if (!client) {
          throw new Error('Client not found');
        }
      }
      return true;
    }),

  body('channel_id')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Channel ID must be less than 100 characters'),

  body('api_key')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('API key must be less than 255 characters'),

  body('conversionLogic_ld')
    .optional({ values: 'falsy' })
    .isString().withMessage('Conversion logic must be a string'),

  body('TransactionTableID')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 }).withMessage('Transaction Table ID must be a positive integer'),

  body('TransactionTableName')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 }).withMessage('Transaction Table Name must be less than 255 characters'),

  body('field_id')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Field ID must be less than 100 characters'),

  body('Model')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Model must be 2-100 characters if provided'),

  body('machin_id')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('Machine ID must be less than 100 characters'),

  body('onboarding_date')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      if (new Date(value) > new Date()) {
        throw new Error('Onboarding date cannot be in the future');
      }
      return true;
    }),

  handleValidationErrors
];

// Transfer device validation
export const transferDeviceValidation = [
  param('deviceId')
    .isInt({ min: 1 })
    .withMessage('Device ID must be a positive integer'),

  body('target_client_id')
    .notEmpty().withMessage('Target client ID is required')
    .isInt({ min: 1 }).withMessage('Target client ID must be a positive integer')
    .custom(async (value) => {
      const client = await Client.findById(value);
      if (!client) {
        throw new Error('Target client not found');
      }
      return true;
    })
    .custom(async (value, { req }) => {
      // Check that target client is different from current client
      const device = await Device.findById(parseInt(req.params.deviceId));
      if (device && device.client_id === value) {
        throw new Error('Cannot transfer device to the same client');
      }
      return true;
    }),

  body('machin_id')
    .notEmpty().withMessage('Machine ID is required')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Machine ID must be 1-100 characters'),

  handleValidationErrors
];

// Device filter validation
export const validateDeviceFilters = [
  query('client_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer'),

  query('Model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Model must be less than 100 characters'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1-100 characters'),

  query('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Start date must be a valid ISO 8601 date'),

  query('endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (req.query.startDate && value) {
        const start = new Date(req.query.startDate);
        const end = new Date(value);
        if (start >= end) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('sortBy')
    .optional()
    .isIn(['id', 'device_id', 'Model', 'machin_id', 'onboarding_date', 'client_name'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),

  handleValidationErrors
];

export default {
  validateDeviceId,
  createDeviceValidation,
  updateDeviceValidation,
  transferDeviceValidation,
  validateDeviceFilters
};
