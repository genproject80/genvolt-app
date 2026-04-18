import React, { useEffect, useState } from 'react';
import { IconDatabase, IconDeviceMobile, IconCalendar } from '@tabler/icons-react';
import { deviceTestingService } from '../../services/deviceTestingService';

/**
 * TableStatsCards - Shows total records, unique devices, oldest and latest records for a table.
 * Props:
 *   tableKey {string}
 */
const TableStatsCards = ({ tableKey }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tableKey) return;
    setLoading(true);
    deviceTestingService
      .getTableStats(tableKey)
      .then((result) => setStats(result.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [tableKey]);

  const fmt = (val) => (val ? String(val).slice(0, 19).replace('T', ' ') : '—');

  const cards = [
    {
      label: 'Total Records',
      value: loading ? '…' : stats ? Number(stats.total_records).toLocaleString() : '—',
      icon: <IconDatabase className="w-6 h-6" />,
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      iconBg: 'bg-blue-100',
    },
    {
      label: 'Unique Devices',
      value: loading ? '…' : stats ? Number(stats.unique_devices).toLocaleString() : '—',
      icon: <IconDeviceMobile className="w-6 h-6" />,
      bg: 'bg-green-50',
      text: 'text-green-700',
      iconBg: 'bg-green-100',
    },
    {
      label: 'Oldest Record (IST)',
      value: loading ? '…' : fmt(stats?.oldest_record),
      icon: <IconCalendar className="w-6 h-6" />,
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      iconBg: 'bg-yellow-100',
    },
    {
      label: 'Latest Record (IST)',
      value: loading ? '…' : fmt(stats?.latest_record),
      icon: <IconCalendar className="w-6 h-6" />,
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      iconBg: 'bg-purple-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bg} rounded-xl px-4 py-3 flex items-center gap-3`}
        >
          <div className={`${card.iconBg} ${card.text} rounded-lg p-2 flex-shrink-0`}>
            {card.icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 truncate">{card.label}</p>
            <p className={`text-sm font-bold ${card.text} truncate`}>{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TableStatsCards;
