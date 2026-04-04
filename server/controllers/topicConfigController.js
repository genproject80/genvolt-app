import { ClientTopicConfig } from '../models/ClientTopicConfig.js';
import { saveTopicConfig } from '../services/topicConfigService.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// GET /api/topic-config — all clients with custom topic configs
// ---------------------------------------------------------------------------
export const getAllTopicConfigs = asyncHandler(async (req, res) => {
  const configs = await ClientTopicConfig.getAll();
  res.json({ success: true, data: configs.map(c => c.toJSON()) });
});

// ---------------------------------------------------------------------------
// GET /api/topic-config/:clientId — get config for one client
// ---------------------------------------------------------------------------
export const getClientTopicConfig = asyncHandler(async (req, res) => {
  const clientId = parseInt(req.params.clientId);
  const config = await ClientTopicConfig.findByClientId(clientId);
  // Return actual config or default fallback
  const response = config ?? ClientTopicConfig.getDefault(clientId);
  res.json({ success: true, data: response.toJSON() });
});

// ---------------------------------------------------------------------------
// PUT /api/topic-config/:clientId — create or update topic config
// Body: { topic_prefix, telemetry_suffix, config_suffix, device_type_overrides }
// ---------------------------------------------------------------------------
export const saveClientTopicConfig = asyncHandler(async (req, res) => {
  const clientId = parseInt(req.params.clientId);
  const { topic_prefix, telemetry_suffix, config_suffix, device_type_overrides } = req.body;

  if (!topic_prefix) throw new ValidationError('topic_prefix is required');
  if (!telemetry_suffix) throw new ValidationError('telemetry_suffix is required');
  if (!config_suffix) throw new ValidationError('config_suffix is required');

  const saved = await saveTopicConfig(
    clientId,
    { topic_prefix, telemetry_suffix, config_suffix, device_type_overrides },
    req.user.user_id
  );

  res.json({
    success: true,
    data: saved.toJSON(),
    message: 'Topic config saved. Updated topics pushed to active devices. Subscriber reload signaled.',
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/topic-config/:clientId — reset to defaults
// ---------------------------------------------------------------------------
export const resetTopicConfig = asyncHandler(async (req, res) => {
  const clientId = parseInt(req.params.clientId);
  await ClientTopicConfig.deleteByClientId(clientId);
  res.json({
    success: true,
    message: 'Topic config reset to defaults',
    data: ClientTopicConfig.getDefault(clientId).toJSON(),
  });
});
