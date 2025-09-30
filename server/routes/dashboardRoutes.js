import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import {
  getUserDashboards,
  getDashboardById,
  createDashboard,
  updateDashboard,
  deleteDashboard
} from '../controllers/dashboardController.js';

const router = express.Router();

/**
 * Validation rules for dashboard creation
 */
const createDashboardValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Dashboard name is required and must be between 1-255 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Dashboard name can only contain alphanumeric characters, underscores, and hyphens'),
  body('display_name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Display name is required and must be between 1-255 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('client_id')
    .notEmpty()
    .withMessage('Client ID is required')
    .isLength({ max: 255 })
    .withMessage('Client ID must be less than 255 characters')
];

/**
 * Validation rules for dashboard update
 */
const updateDashboardValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Dashboard ID must be a positive integer'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Dashboard name is required and must be between 1-255 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Dashboard name can only contain alphanumeric characters, underscores, and hyphens'),
  body('display_name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Display name is required and must be between 1-255 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('client_id')
    .notEmpty()
    .withMessage('Client ID is required')
    .isLength({ max: 255 })
    .withMessage('Client ID must be less than 255 characters'),
  body('is_active')
    .isBoolean()
    .withMessage('Active status must be a boolean')
];

/**
 * Validation rules for dashboard ID parameter
 */
const dashboardIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Dashboard ID must be a positive integer')
];

// All dashboard routes require authentication
router.use(authenticate);

/**
 * GET /api/dashboards
 * Get user-accessible dashboards
 */
router.get('/',
  getUserDashboards
);

/**
 * GET /api/dashboards/:id
 * Get specific dashboard details
 */
router.get('/:id',
  dashboardIdValidation,
  getDashboardById
);

/**
 * POST /api/dashboards
 * Create a new dashboard (requires Create Dashboard permission)
 */
router.post('/',
  createDashboardValidation,
  createDashboard
);

/**
 * PUT /api/dashboards/:id
 * Update an existing dashboard (requires Edit Dashboard permission)
 */
router.put('/:id',
  updateDashboardValidation,
  updateDashboard
);

/**
 * DELETE /api/dashboards/:id
 * Delete a dashboard (requires Delete Dashboard permission)
 */
router.delete('/:id',
  dashboardIdValidation,
  deleteDashboard
);

export default router;