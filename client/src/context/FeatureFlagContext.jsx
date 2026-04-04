import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getFeatureFlags } from '../services/featureFlagService';

const FeatureFlagContext = createContext(null);

export const FeatureFlagProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  const [flags, setFlags]     = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    if (!isAuthenticated) {
      setFlags([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getFeatureFlags();
      setFlags(data || []);
    } catch {
      // Non-fatal: fall back to all-disabled if API is unavailable
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const isEnabled = (flagName) => {
    const flag = flags.find(f => f.flag_name === flagName);
    return flag ? flag.is_enabled : false;
  };

  const isPaymentsEnabled = isEnabled('payments_enabled');

  return (
    <FeatureFlagContext.Provider value={{ flags, loading, isEnabled, isPaymentsEnabled, refreshFlags: fetchFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = () => {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagProvider');
  return ctx;
};
