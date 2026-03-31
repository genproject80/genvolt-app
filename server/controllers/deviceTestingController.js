import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { TableConfig } from '../models/TableConfig.js';
import { DeviceTesting } from '../models/DeviceTesting.js';
import { toCsv, sendCsvResponse } from '../utils/csvExport.js';
import { logger } from '../utils/logger.js';

const MAX_EXPORT_ROWS = 10000;
const DEFAULT_PAGE_LIMIT = 100;

/**
 * GET /api/device-testing/tables
 * Returns list of active table configurations for the current user.
 */
export const getAvailableTables = asyncHandler(async (req, res) => {
  const tables = await TableConfig.getAllActive();
  res.json({
    success: true,
    data: tables.map((t) => ({
      config_id: t.config_id,
      table_key: t.table_key,
      display_name: t.display_name,
      icon_name: t.icon_name,
      is_exportable: t.is_exportable,
      sort_order: t.sort_order,
      columns: t.column_config
    }))
  });
});

/**
 * GET /api/device-testing/dashboard/hourly
 * Returns 24-hour heatmap pivot data.
 * Query params: date (YYYY-MM-DD, IST), tableKey (defaults to 'raw_messages')
 */
export const getHourlyDashboard = asyncHandler(async (req, res) => {
  const { date, tableKey = 'raw_messages' } = req.query;

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError('date must be in YYYY-MM-DD format');
  }

  const config = await TableConfig.getByKey(tableKey);
  if (!config) {
    throw new NotFoundError(`Table configuration not found for key: ${tableKey}`);
  }

  const rows = await DeviceTesting.getHourlyDashboard(config.table_name, date || null);

  res.json({
    success: true,
    data: rows,
    meta: { date: date || null, table_key: tableKey, display_name: config.display_name }
  });
});

/**
 * GET /api/device-testing/:tableKey/stats
 * Returns statistics for a specific table.
 */
export const getTableStats = asyncHandler(async (req, res) => {
  const { tableKey } = req.params;

  const config = await TableConfig.getByKey(tableKey);
  if (!config) {
    throw new NotFoundError(`Table configuration not found for key: ${tableKey}`);
  }

  const stats = await DeviceTesting.getTableStats(config.table_name);

  res.json({
    success: true,
    data: stats
  });
});

/**
 * GET /api/device-testing/:tableKey/export
 * Streams a CSV file with up to 10K records.
 * Query params: search
 */
export const exportTableData = asyncHandler(async (req, res) => {
  const { tableKey } = req.params;
  const { search } = req.query;

  const config = await TableConfig.getByKey(tableKey);
  if (!config) {
    throw new NotFoundError(`Table configuration not found for key: ${tableKey}`);
  }
  if (!config.is_exportable) {
    throw new ValidationError('This table is not configured for export');
  }

  const rows = await DeviceTesting.getExportData(config.table_name, config.column_config, {
    search,
    maxRows: MAX_EXPORT_ROWS
  });

  const csvContent = toCsv(rows, config.column_config);
  const filename = `${config.table_key}_export_${new Date().toISOString().slice(0, 10)}`;
  sendCsvResponse(res, csvContent, filename);
});

/**
 * GET /api/device-testing/:tableKey
 * Returns paginated rows for a table.
 * Query params: page, limit, search
 */
export const getTableData = asyncHandler(async (req, res) => {
  const { tableKey } = req.params;
  const {
    page = 1,
    limit = DEFAULT_PAGE_LIMIT,
    search
  } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(parseInt(limit, 10) || DEFAULT_PAGE_LIMIT, DEFAULT_PAGE_LIMIT);

  if (isNaN(pageNum) || pageNum < 1) {
    throw new ValidationError('page must be a positive integer');
  }

  const config = await TableConfig.getByKey(tableKey);
  if (!config) {
    throw new NotFoundError(`Table configuration not found for key: ${tableKey}`);
  }

  const { rows, total } = await DeviceTesting.getTableData(
    config.table_name,
    config.column_config,
    { page: pageNum, limit: limitNum, search }
  );

  const totalPages = Math.ceil(total / limitNum);

  res.json({
    success: true,
    data: rows,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrevious: pageNum > 1
    },
    config: {
      display_name: config.display_name,
      columns: config.column_config,
      is_exportable: config.is_exportable
    }
  });
});
