import React, { useState, useEffect } from 'react';
import { deviceTestingService } from '../../services/deviceTestingService';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

/**
 * Returns a Tailwind background class based on count.
 */
const heatColor = (count) => {
  if (count === 0) return 'bg-gray-100 text-gray-400';
  if (count < 5) return 'bg-yellow-100 text-yellow-800';
  if (count < 10) return 'bg-orange-200 text-orange-900';
  return 'bg-green-200 text-green-900';
};

/**
 * HourlyDashboard - 24-hour heatmap of device activity in IST.
 * Props:
 *   tableKey {string}
 */
const HourlyDashboard = ({ tableKey }) => {
  const [data, setData] = useState([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    if (!tableKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await deviceTestingService.getHourlyDashboard(tableKey, date || undefined);
      setData(result.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tableKey]);

  const handleApply = (e) => {
    e.preventDefault();
    fetchData();
  };

  return (
    <div className="space-y-4">
      {/* Date Filter */}
      <form onSubmit={handleApply} className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Date (IST):</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          type="submit"
          className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          Apply
        </button>
        {date && (
          <button
            type="button"
            onClick={() => { setDate(''); }}
            className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400">{date ? `Filtered: ${date}` : 'All dates'}</span>
      </form>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span className="font-medium">Legend:</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded bg-gray-100 border border-gray-200" /> 0 records</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200" /> 1–4</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded bg-orange-200 border border-orange-300" /> 5–9</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-200 border border-green-300" /> 10+</span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
      ) : data.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500">No data found for the selected filter.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[140px]">Device ID</th>
                {HOURS.map((h) => (
                  <th key={h} className="px-2 py-2 text-center font-semibold text-gray-500 w-10">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800 sticky left-0 bg-white z-10 min-w-[140px] border-r border-gray-100">
                    {row.device_id}
                  </td>
                  {HOURS.map((h) => {
                    const count = row[`H${h}`] || 0;
                    return (
                      <td key={h} className="px-0.5 py-1 text-center">
                        <span
                          className={`inline-block w-8 h-7 leading-7 rounded text-center font-semibold ${heatColor(count)}`}
                          title={`Hour ${h}:00 IST — ${count} record${count !== 1 ? 's' : ''}`}
                        >
                          {count > 0 ? count : ''}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">All times are in IST (UTC+5:30).</p>
    </div>
  );
};

export default HourlyDashboard;
