import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import { TableConfig } from '../models/TableConfig.js';
import { getTableColumns, tableExists, mapSqlType } from '../utils/schemaIntrospection.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/table-config
 * Returns all table configurations (active + inactive) for admin UI.
 */
export const getAllTableConfigs = asyncHandler(async (req, res) => {
  const configs = await TableConfig.getAll();
  res.json({ success: true, data: configs });
});

/**
 * GET /api/table-config/:configId
 * Returns a single table configuration.
 */
export const getTableConfigById = asyncHandler(async (req, res) => {
  const configId = parseInt(req.params.configId, 10);
  if (isNaN(configId)) throw new ValidationError('configId must be a number');

  const config = await TableConfig.getById(configId);
  if (!config) throw new NotFoundError(`Table configuration #${configId} not found`);

  res.json({ success: true, data: config });
});

/**
 * POST /api/table-config
 * Creates a new table configuration.
 * Body: { table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config }
 */
export const createTableConfig = asyncHandler(async (req, res) => {
  const { table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config } = req.body;

  // Validation
  if (!table_key || !table_name || !display_name) {
    throw new ValidationError('table_key, table_name, and display_name are required');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(table_key)) {
    throw new ValidationError('table_key may only contain letters, numbers, and underscores');
  }
  if (!Array.isArray(column_config) || column_config.length === 0) {
    throw new ValidationError('column_config must be a non-empty array');
  }

  // Check table_key uniqueness
  const existing = await TableConfig.getByKey(table_key);
  if (existing) throw new ConflictError(`table_key "${table_key}" is already in use`);

  // Check the database table exists
  const exists = await tableExists(table_name);
  if (!exists) throw new ValidationError(`Database table "${table_name}" does not exist`);

  const config = await TableConfig.create({
    table_key,
    table_name,
    display_name,
    icon_name,
    is_exportable,
    sort_order,
    column_config,
    created_by: req.user?.user_id
  });

  logger.info(`TableConfig created: ${table_key} by user ${req.user?.email}`);

  res.status(201).json({ success: true, data: config });
});

/**
 * PUT /api/table-config/:configId
 * Updates an existing table configuration (table_key is immutable).
 */
export const updateTableConfig = asyncHandler(async (req, res) => {
  const configId = parseInt(req.params.configId, 10);
  if (isNaN(configId)) throw new ValidationError('configId must be a number');

  const { table_name, display_name, icon_name, is_exportable, sort_order, column_config } = req.body;

  if (!table_name || !display_name) {
    throw new ValidationError('table_name and display_name are required');
  }
  if (!Array.isArray(column_config) || column_config.length === 0) {
    throw new ValidationError('column_config must be a non-empty array');
  }

  const existing = await TableConfig.getById(configId);
  if (!existing) throw new NotFoundError(`Table configuration #${configId} not found`);

  // Validate DB table exists if it changed
  if (table_name !== existing.table_name) {
    const exists = await tableExists(table_name);
    if (!exists) throw new ValidationError(`Database table "${table_name}" does not exist`);
  }

  const updated = await TableConfig.update(configId, {
    table_name,
    display_name,
    icon_name,
    is_exportable,
    sort_order,
    column_config,
    updated_by: req.user?.user_id
  });

  logger.info(`TableConfig updated: #${configId} by user ${req.user?.email}`);

  res.json({ success: true, data: updated });
});

/**
 * DELETE /api/table-config/:configId
 * Permanently deletes a table configuration.
 */
export const deleteTableConfig = asyncHandler(async (req, res) => {
  const configId = parseInt(req.params.configId, 10);
  if (isNaN(configId)) throw new ValidationError('configId must be a number');

  const existing = await TableConfig.getById(configId);
  if (!existing) throw new NotFoundError(`Table configuration #${configId} not found`);

  await TableConfig.delete(configId);

  logger.info(`TableConfig deleted: #${configId} (${existing.table_key}) by user ${req.user?.email}`);

  res.json({ success: true, message: 'Table configuration deleted' });
});

/**
 * PATCH /api/table-config/:configId/toggle
 * Toggles is_active for a configuration.
 */
export const toggleTableConfig = asyncHandler(async (req, res) => {
  const configId = parseInt(req.params.configId, 10);
  if (isNaN(configId)) throw new ValidationError('configId must be a number');

  const existing = await TableConfig.getById(configId);
  if (!existing) throw new NotFoundError(`Table configuration #${configId} not found`);

  const updated = await TableConfig.toggleActive(configId, req.user?.user_id);

  logger.info(`TableConfig toggled: #${configId} is_active=${updated.is_active} by user ${req.user?.email}`);

  res.json({ success: true, data: updated });
});

/**
 * GET /api/table-config/introspect/:tableName
 * Returns available columns from a database table.
 */
export const getAvailableColumns = asyncHandler(async (req, res) => {
  const { tableName } = req.params;

  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    throw new ValidationError('tableName may only contain letters, numbers, and underscores');
  }

  const exists = await tableExists(tableName);
  if (!exists) throw new NotFoundError(`Database table "${tableName}" does not exist`);

  const columns = await getTableColumns(tableName);

  const mapped = columns.map((col) => ({
    column_name: col.column_name,
    data_type: col.data_type,
    suggested_type: mapSqlType(col.data_type),
    is_nullable: col.is_nullable === 'YES',
    max_length: col.max_length,
    ordinal_position: col.ordinal_position
  }));

  res.json({ success: true, data: mapped });
});
