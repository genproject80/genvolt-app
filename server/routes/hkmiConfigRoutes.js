import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getHkmiDevices,
  getDeviceLatestConfig,
  publishDeviceConfig,
} from '../controllers/hkmiConfigController.js';

const router = express.Router();

// GET /api/hkmi-config/devices — list devices in user's client scope
router.get('/devices', authenticate, getHkmiDevices);

// GET /api/hkmi-config/device/:deviceId/latest — latest config values from telemetry
router.get('/device/:deviceId/latest', authenticate, getDeviceLatestConfig);

// POST /api/hkmi-config/device/:deviceId/publish — push config to device via MQTT
router.post('/device/:deviceId/publish', authenticate, publishDeviceConfig);

export default router;