import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import {
  getAllClients,
  getClientById,
  getClientHierarchy,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
  checkEmailAvailability
} from '../controllers/clientController.js';

const router = express.Router();

/**
 * Validation rules for client creation
 */
const createClientValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Client name is required and must be between 1-255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required')
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters'),
  body('phone')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Phone number must be less than 20 characters'),
  body('Address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters'),
  body('contact_person')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Contact person name must be less than 255 characters'),
  body('thinkspeak_subscription_info')
    .optional()
    .isLength({ max: 500 })
    .withMessage('ThinkSpeak subscription info must be less than 500 characters'),
  body('city')
    .optional()
    .isLength({ max: 100 })
    .withMessage('City must be less than 100 characters'),
  body('state')
    .optional()
    .isLength({ max: 100 })
    .withMessage('State must be less than 100 characters'),
  body('parent_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Parent ID must be a positive integer'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('Active status must be a boolean')
];

/**
 * Validation rules for client update
 */
const updateClientValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Client name is required and must be between 1-255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required')
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters'),
  body('phone')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Phone number must be less than 20 characters'),
  body('Address')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters'),
  body('contact_person')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Contact person name must be less than 255 characters'),
  body('thinkspeak_subscription_info')
    .optional()
    .isLength({ max: 500 })
    .withMessage('ThinkSpeak subscription info must be less than 500 characters'),
  body('city')
    .optional()
    .isLength({ max: 100 })
    .withMessage('City must be less than 100 characters'),
  body('state')
    .optional()
    .isLength({ max: 100 })
    .withMessage('State must be less than 100 characters'),
  body('parent_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Parent ID must be a positive integer'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('Active status must be a boolean')
];

/**
 * Validation rules for client ID parameter
 */
const clientIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer')
];

/**
 * Validation rules for email availability check
 */
const emailCheckValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('excludeClientId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Exclude client ID must be a positive integer')
];

/**
 * Validation rules for query parameters
 */
const queryValidation = [
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be a boolean'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
];

// All client routes require authentication
router.use(authenticate);

// Public client routes (accessible by all authenticated users)

/**
 * GET /api/clients/hierarchy
 * Get client hierarchy for dropdown
 */
router.get('/hierarchy', getClientHierarchy);

/**
 * GET /api/clients/stats
 * Get client statistics
 */
router.get('/stats', 
  getClientStats
);

/**
 * POST /api/clients/check-email
 * Check if email is available
 */
router.post('/check-email', 
  emailCheckValidation,
  checkEmailAvailability
);

/**
 * GET /api/clients
 * Get all clients
 */
router.get('/', 
  queryValidation,
  getAllClients
);

/**
 * GET /api/clients/:id
 * Get client by ID
 */
router.get('/:id', 
  clientIdValidation,
  getClientById
);

/**
 * POST /api/clients
 * Create a new client
 */
router.post('/', 
  createClientValidation,
  createClient
);

/**
 * PUT /api/clients/:id
 * Update an existing client
 */
router.put('/:id', 
  updateClientValidation,
  updateClient
);

/**
 * DELETE /api/clients/:id
 * Delete a client (soft delete)
 */
router.delete('/:id', 
  clientIdValidation,
  deleteClient
);

export default router;