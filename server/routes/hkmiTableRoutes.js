import express from 'express';
import { query } from 'express-validator';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { getHKMITableData } from '../controllers/hkmiTableController.js';
import { uploadHKMIData } from '../controllers/hkmiUploadController.js';

const router = express.Router();

// Configure multer for file upload (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

/**
 * Validation rules for HKMI table queries
 */
const hkmiTableQueryValidation = [
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
    .isString()
    .trim()
    .withMessage('Search term must be a string'),
  query('sort_field')
    .optional()
    .isString()
    .withMessage('Sort field must be a string'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC'])
    .withMessage('Sort order must be ASC or DESC')
];

/**
 * @route   GET /api/hkmi-table
 * @desc    Get HKMI table data with pagination and filtering
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  hkmiTableQueryValidation,
  getHKMITableData
);

/**
 * @route   POST /api/hkmi-table/upload
 * @desc    Upload and process HKMI configuration data (Excel/CSV)
 * @access  Private
 */
router.post(
  '/upload',
  authenticate,
  upload.single('file'),
  uploadHKMIData
);

export default router;
