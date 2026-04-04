import React from 'react';
import { Link } from 'react-router-dom';
import { ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { useSubscription } from '../context/SubscriptionContext';

/**
 * Renders a persistent banner at the top of the layout when the subscription
 * is in GRACE or EXPIRED state. Returns null for ACTIVE or no subscription.
 */
export default function SubscriptionBanner() {
  const { isGrace, isExpired, hasNoSub, daysRemainingInGrace, subscription, loading } = useSubscription();

  if (loading || (!isGrace && !isExpired)) return null;

  if (isGrace) {
    return (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-yellow-800">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-yellow-500" />
          <span>
            <strong>Grace period active.</strong> Your{' '}
            <strong>{subscription?.plan_name}</strong> subscription has expired.
            New device activations are blocked.{' '}
            {daysRemainingInGrace !== null && (
              <span>
                Devices will be deactivated in{' '}
                <strong>{daysRemainingInGrace} day{daysRemainingInGrace !== 1 ? 's' : ''}</strong>.
              </span>
            )}
          </span>
        </div>
        <Link
          to="/billing"
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
        >
          Renew Now →
        </Link>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-red-800">
          <XCircleIcon className="w-4 h-4 flex-shrink-0 text-red-500" />
          <span>
            <strong>Subscription expired.</strong> All your devices have been deactivated.
            Subscribe to reactivate them.
          </span>
        </div>
        <Link
          to="/billing"
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Subscribe Now →
        </Link>
      </div>
    );
  }

  return null;
}
