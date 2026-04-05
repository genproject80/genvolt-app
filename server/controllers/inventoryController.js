import { Inventory } from '../models/Inventory.js';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// GET /api/inventory
// All inventory entries including inactive (admin view)
// ---------------------------------------------------------------------------
export const getAllInventory = asyncHandler(async (req, res) => {
  const entries = await Inventory.findAll();
  res.json({ success: true, data: entries.map(e => e.toJSON()) });
});

// ---------------------------------------------------------------------------
// GET /api/inventory/active
// Active entries only — used for device form dropdowns
// ---------------------------------------------------------------------------
export const getActiveInventory = asyncHandler(async (req, res) => {
  const entries = await Inventory.findAllActive();
  res.json({ success: true, data: entries.map(e => e.toJSON()) });
});

// ---------------------------------------------------------------------------
// GET /api/inventory/:modelNumber
// Single entry
// ---------------------------------------------------------------------------
export const getInventoryByModelNumber = asyncHandler(async (req, res) => {
  const entry = await Inventory.findByModelNumber(req.params.modelNumber);
  if (!entry) throw new NotFoundError(`Inventory model '${req.params.modelNumber}' not found`);
  res.json({ success: true, data: entry.toJSON() });
});

// ---------------------------------------------------------------------------
// POST /api/inventory
// Create a new model entry
// ---------------------------------------------------------------------------
export const createInventory = asyncHandler(async (req, res) => {
  const { model_number, display_name, device_id_prefix, decoder_logic_ids, description } = req.body;

  if (!model_number)      throw new ValidationError('model_number is required');
  if (!display_name)      throw new ValidationError('display_name is required');
  if (!device_id_prefix)  throw new ValidationError('device_id_prefix is required');

  // Validate decoder_logic_ids — must be a single-element array (1:1 model↔logicId)
  if (decoder_logic_ids !== undefined) {
    if (!Array.isArray(decoder_logic_ids) || decoder_logic_ids.length !== 1) {
      throw new ValidationError('decoder_logic_ids must be an array with exactly one integer');
    }
    if (typeof decoder_logic_ids[0] !== 'number' || !Number.isInteger(decoder_logic_ids[0])) {
      throw new ValidationError('decoder_logic_ids must contain exactly one integer');
    }
  }

  // Check for duplicate model_number
  const existing = await Inventory.findByModelNumber(model_number);
  if (existing) throw new ConflictError(`Model '${model_number}' already exists`);

  const entry = await Inventory.create({
    model_number,
    display_name,
    device_id_prefix: device_id_prefix.toUpperCase(),
    decoder_logic_ids: decoder_logic_ids ?? [],
    description,
  });

  res.status(201).json({ success: true, data: entry.toJSON() });
});

// ---------------------------------------------------------------------------
// PUT /api/inventory/:modelNumber
// Update editable fields (model_number itself is immutable PK)
// ---------------------------------------------------------------------------
export const updateInventory = asyncHandler(async (req, res) => {
  const { modelNumber } = req.params;
  const entry = await Inventory.findByModelNumber(modelNumber);
  if (!entry) throw new NotFoundError(`Inventory model '${modelNumber}' not found`);

  const { decoder_logic_ids } = req.body;
  if (decoder_logic_ids !== undefined) {
    if (!Array.isArray(decoder_logic_ids) || decoder_logic_ids.length !== 1) {
      throw new ValidationError('decoder_logic_ids must be an array with exactly one integer');
    }
    if (typeof decoder_logic_ids[0] !== 'number' || !Number.isInteger(decoder_logic_ids[0])) {
      throw new ValidationError('decoder_logic_ids must contain exactly one integer');
    }
  }

  if (req.body.device_id_prefix) {
    req.body.device_id_prefix = req.body.device_id_prefix.toUpperCase();
  }

  const updated = await Inventory.update(modelNumber, req.body);
  res.json({ success: true, data: updated.toJSON() });
});

// ---------------------------------------------------------------------------
// DELETE /api/inventory/:modelNumber
// Soft-delete (set is_active = 0). Blocked if devices reference this model.
// ---------------------------------------------------------------------------
export const deactivateInventory = asyncHandler(async (req, res) => {
  const { modelNumber } = req.params;
  const entry = await Inventory.findByModelNumber(modelNumber);
  if (!entry) throw new NotFoundError(`Inventory model '${modelNumber}' not found`);

  const hasDevices = await Inventory.hasDevices(modelNumber);
  if (hasDevices) {
    const archived = await Inventory.deactivate(modelNumber);
    return res.json({
      success: true,
      data: archived.toJSON(),
      warning: 'Model has associated devices. It has been deactivated — existing devices are unaffected.',
    });
  }

  const archived = await Inventory.deactivate(modelNumber);
  res.json({ success: true, data: archived.toJSON() });
});
