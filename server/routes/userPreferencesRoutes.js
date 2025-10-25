import express from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import {
  saveUserPreference,
  getUserPreferences,
  deleteUserPreference
} from '../controllers/userPreferencesController.js';

const router = express.Router();

/**
 * Validation rules for saving user preferences
 */
const savePreferenceValidation = [
  body('preference_name')
    .notEmpty()
    .withMessage('Preference name is required')
    .isLength({ max: 255 })
    .withMessage('Preference name must be less than 255 characters'),
  body('preference_value')
    .notEmpty()
    .withMessage('Preference value is required')
    .isLength({ max: 255 })
    .withMessage('Preference value must be less than 255 characters'),
  body('dashboard_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Dashboard ID must be a positive integer')
];

/**
 * Validation rules for getting user preferences
 */
const getPreferenceValidation = [
  query('preference_name')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Preference name must be less than 255 characters'),
  query('dashboard_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Dashboard ID must be a positive integer')
];

/**
 * Validation rules for deleting user preferences
 */
const deletePreferenceValidation = [
  query('preference_name')
    .notEmpty()
    .withMessage('Preference name is required')
    .isLength({ max: 255 })
    .withMessage('Preference name must be less than 255 characters'),
  query('dashboard_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Dashboard ID must be a positive integer')
];

// All user preference routes require authentication
router.use(authenticate);

/**
 * POST /api/user-preferences
 * Save or update a user preference
 */
router.post('/',
  savePreferenceValidation,
  saveUserPreference
);

/**
 * GET /api/user-preferences
 * Get user preferences (all or specific by name)
 */
router.get('/',
  getPreferenceValidation,
  getUserPreferences
);

/**
 * DELETE /api/user-preferences
 * Delete a specific user preference
 */
router.delete('/',
  deletePreferenceValidation,
  deleteUserPreference
);

export default router;
