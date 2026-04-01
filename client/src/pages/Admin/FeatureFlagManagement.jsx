import React, { useState, useEffect, useCallback } from 'react';
import { getFeatureFlags, updateFeatureFlag } from '../../services/featureFlagService';
import { useFeatureFlags } from '../../context/FeatureFlagContext';

export default function FeatureFlagManagement() {
  const { refreshFlags } = useFeatureFlags();

  const [flags, setFlags]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(null); // flag_id currently being saved
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFeatureFlags();
      setFlags(data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (flag) => {
    setSaving(flag.flag_id);
    setError('');
    try {
      const updated = await updateFeatureFlag(flag.flag_id, !flag.is_enabled);
      setFlags(prev => prev.map(f => f.flag_id === updated.flag_id ? updated : f));
      // Refresh the app-wide context so sidebar/routes react immediately
      await refreshFlags();
    } catch (err) {
      setError(err?.message || 'Failed to update flag');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enable or disable platform features globally. Changes take effect immediately for all users.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Flag table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : flags.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-500">No feature flags configured.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Feature</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {flags.map((flag) => (
                <tr key={flag.flag_id} className="text-sm text-gray-700 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{flag.display_name}</div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{flag.flag_name}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-500 max-w-sm">{flag.description}</td>
                  <td className="px-6 py-4">
                    {flag.is_enabled ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(flag)}
                      disabled={saving === flag.flag_id}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                        flag.is_enabled ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                      role="switch"
                      aria-checked={flag.is_enabled}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          flag.is_enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Last updated values are shown. Refresh the page if you need the latest state.
      </p>
    </div>
  );
}
