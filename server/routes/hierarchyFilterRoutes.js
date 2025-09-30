import express from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import {
  getOverallManagers,
  getLevel2Managers,
  getLevel3Managers,
  getLevel4Managers,
  getFilteredDevices,
  applyHierarchyFilters,
  getMachineSuggestions
} from '../controllers/hierarchyFilterController.js';

const router = express.Router();

/**
 * Validation rules for hierarchy filter queries
 */
const hierarchyFilterQueryValidation = [
  query('dashboard_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Dashboard ID must be a positive integer'),
  query('sden')
    .optional()
    .isLength({ max: 100 })
    .withMessage('SDEN must be less than 100 characters'),
  query('den')
    .optional()
    .isLength({ max: 100 })
    .withMessage('DEN must be less than 100 characters'),
  query('aen')
    .optional()
    .isLength({ max: 100 })
    .withMessage('AEN must be less than 100 characters'),
  query('sse')
    .optional()
    .isLength({ max: 100 })
    .withMessage('SSE must be less than 100 characters'),
  query('machineId')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Machine ID must be less than 255 characters')
];

/**
 * Validation rules for machine suggestions
 */
const machineSuggestionsValidation = [
  query('q')
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2-100 characters'),
  query('sden')
    .optional()
    .isLength({ max: 100 })
    .withMessage('SDEN must be less than 100 characters'),
  query('den')
    .optional()
    .isLength({ max: 100 })
    .withMessage('DEN must be less than 100 characters'),
  query('aen')
    .optional()
    .isLength({ max: 100 })
    .withMessage('AEN must be less than 100 characters'),
  query('sse')
    .optional()
    .isLength({ max: 100 })
    .withMessage('SSE must be less than 100 characters')
];

/**
 * Validation rules for applying hierarchy filters
 */
const applyFiltersValidation = [
  body('sden')
    .optional()
    .isLength({ max: 100 })
    .withMessage('SDEN must be less than 100 characters'),
  body('den')
    .optional()
    .isLength({ max: 100 })
    .withMessage('DEN must be less than 100 characters'),
  body('aen')
    .optional()
    .isLength({ max: 100 })
    .withMessage('AEN must be less than 100 characters'),
  body('sse')
    .optional()
    .isLength({ max: 100 })
    .withMessage('SSE must be less than 100 characters'),
  body('machineId')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Machine ID must be less than 255 characters')
];

// All hierarchy filter routes require authentication
router.use(authenticate);

/**
 * GET /api/hierarchy-filters/sden
 * Get unique Overall Managers (SDEN values)
 */
router.get('/sden',
  getOverallManagers
);

/**
 * GET /api/hierarchy-filters/den
 * Get unique Level 2 Managers (DEN values)
 * Optional query param: sden (to filter based on Overall Manager)
 */
router.get('/den',
  hierarchyFilterQueryValidation,
  getLevel2Managers
);

/**
 * GET /api/hierarchy-filters/aen
 * Get unique Level 3 Managers (AEN values)
 * Optional query params: sden, den
 */
router.get('/aen',
  hierarchyFilterQueryValidation,
  getLevel3Managers
);

/**
 * GET /api/hierarchy-filters/sse
 * Get unique Level 4 Managers (SSE values)
 * Optional query params: sden, den, aen
 */
router.get('/sse',
  hierarchyFilterQueryValidation,
  getLevel4Managers
);

/**
 * GET /api/hierarchy-filters/devices
 * Get filtered device IDs based on hierarchy filters
 * Optional query params: sden, den, aen, sse, machineId
 */
router.get('/devices',
  hierarchyFilterQueryValidation,
  getFilteredDevices
);

/**
 * GET /api/hierarchy-filters/machine-suggestions
 * Get machine ID suggestions for autocomplete
 * Required query param: q (search term)
 * Optional query params: sden, den, aen, sse
 */
router.get('/machine-suggestions',
  machineSuggestionsValidation,
  getMachineSuggestions
);

/**
 * POST /api/hierarchy-filters/apply
 * Apply combined filters and get device IDs
 * Body params: sden, den, aen, sse, machineId (all optional)
 */
router.post('/apply',
  applyFiltersValidation,
  applyHierarchyFilters
);

export default router;