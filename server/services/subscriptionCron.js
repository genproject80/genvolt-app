import cron from 'node-cron';
import { handleSubscriptionExpiry } from './subscriptionService.js';
import { logger } from '../utils/logger.js';

/**
 * Schedules the subscription expiry check to run every hour.
 * Call startSubscriptionCron() once from server.js after DB connects.
 */
export const startSubscriptionCron = () => {
  // Run at the top of every hour: '0 * * * *'
  cron.schedule('0 * * * *', async () => {
    try {
      await handleSubscriptionExpiry();
    } catch (error) {
      logger.error('Subscription cron job failed:', error);
    }
  });

  logger.info('✅ Subscription expiry cron scheduled (hourly)');
};
