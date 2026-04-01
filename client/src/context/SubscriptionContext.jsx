import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getMySubscription } from '../services/subscriptionService';

const SubscriptionContext = createContext(null);

export const SubscriptionProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();

  const [subscription, setSubscription]     = useState(null);
  const [activeDeviceCount, setActiveDeviceCount] = useState(0);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);

  const fetchMySubscription = useCallback(async () => {
    if (!isAuthenticated || !user?.client_id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMySubscription();
      setSubscription(data?.subscription || null);
      setActiveDeviceCount(data?.active_device_count ?? 0);
    } catch (err) {
      setError(err?.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.client_id]);

  // Load on mount and whenever auth state changes
  useEffect(() => {
    fetchMySubscription();
  }, [fetchMySubscription]);

  // ---- Computed helpers ----
  const status       = subscription?.status ?? null;
  const isActive     = status === 'ACTIVE';
  const isGrace      = status === 'GRACE';
  const isExpired    = status === 'EXPIRED';
  const hasNoSub     = !subscription && !loading;

  const daysUntilExpiry = (() => {
    if (!subscription?.end_date) return null;
    const diff = new Date(subscription.end_date) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const daysRemainingInGrace = (() => {
    if (!subscription?.grace_end_date) return null;
    const diff = new Date(subscription.grace_end_date) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        activeDeviceCount,
        loading,
        error,
        isActive,
        isGrace,
        isExpired,
        hasNoSub,
        daysUntilExpiry,
        daysRemainingInGrace,
        refreshSubscription: fetchMySubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
};
