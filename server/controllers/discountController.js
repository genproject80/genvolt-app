import { ClientDiscount } from '../models/ClientDiscount.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// GET /api/discounts/:clientId — full discount history for a client
// ---------------------------------------------------------------------------
export const getDiscountHistory = asyncHandler(async (req, res) => {
  const clientId = parseInt(req.params.clientId);
  const discounts = await ClientDiscount.getByClientId(clientId);
  res.json({ success: true, data: discounts.map(d => d.toJSON()) });
});

// ---------------------------------------------------------------------------
// GET /api/discounts/:clientId/active — current unused discount for client
// ---------------------------------------------------------------------------
export const getActiveDiscount = asyncHandler(async (req, res) => {
  const clientId = parseInt(req.params.clientId);
  const discount = await ClientDiscount.getUnused(clientId);
  res.json({ success: true, data: discount ? discount.toJSON() : null });
});

// ---------------------------------------------------------------------------
// POST /api/discounts — create a one-time discount for a client
// Body: { client_id, discount_type: 'PERCENTAGE'|'FIXED', discount_value }
// ---------------------------------------------------------------------------
export const createDiscount = asyncHandler(async (req, res) => {
  const { client_id, discount_type, discount_value } = req.body;

  if (!client_id) throw new ValidationError('client_id is required');
  if (!discount_type || !['PERCENTAGE', 'FIXED'].includes(discount_type)) {
    throw new ValidationError("discount_type must be 'PERCENTAGE' or 'FIXED'");
  }
  if (discount_value === undefined || discount_value <= 0) {
    throw new ValidationError('discount_value must be greater than 0');
  }
  if (discount_type === 'PERCENTAGE' && discount_value > 100) {
    throw new ValidationError('Percentage discount cannot exceed 100');
  }

  // Enforce one active discount per client
  const existing = await ClientDiscount.getUnused(parseInt(client_id));
  if (existing) {
    throw new ValidationError(
      `Client already has an active discount (${existing.discount_type} ${existing.discount_value}). Remove it first.`
    );
  }

  const discount = await ClientDiscount.create({
    client_id:      parseInt(client_id),
    discount_type,
    discount_value: parseFloat(discount_value),
    created_by:     req.user.user_id,
  });

  res.status(201).json({ success: true, data: discount.toJSON() });
});

// ---------------------------------------------------------------------------
// DELETE /api/discounts/:id — remove an unused discount
// ---------------------------------------------------------------------------
export const deleteDiscount = asyncHandler(async (req, res) => {
  const discountId = parseInt(req.params.id);
  const discount = await ClientDiscount.findById(discountId);
  if (!discount) throw new NotFoundError('Discount not found');
  if (discount.is_used) {
    throw new ValidationError('Cannot delete an already-used discount');
  }

  await ClientDiscount.delete(discountId);
  res.json({ success: true, message: 'Discount removed' });
});
