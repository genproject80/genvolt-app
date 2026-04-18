import { Badge } from '@mantine/core';

const colorMap = {
  general: {
    Active:   'green',
    Inactive: 'gray',
    Unknown:  'gray',
  },
  signal: {
    On: 'green', true: 'green', 1: 'green',
    Off: 'red',  false: 'red',  0: 'red',
  },
  fault: {
    fault:   'red',
    normal:  'green',
    warning: 'yellow',
  },
  power: {
    Active:   'green',
    Inactive: 'gray',
    Fault:    'red',
  },
};

const labelMap = {
  general: { Active: 'Active', Inactive: 'Inactive', Unknown: 'Unknown' },
  signal:  { On: 'On', true: 'On', 1: 'On', Off: 'Off', false: 'Off', 0: 'Off' },
  fault:   { fault: 'Fault Detected', normal: 'Normal', warning: 'Warning' },
  power:   { Active: 'Active', Inactive: 'Inactive', Fault: 'Fault' },
};

const StatusBadge = ({ status, type = 'general', className = '' }) => {
  const typeColors = colorMap[type] ?? colorMap.general;
  const typeLabels = labelMap[type] ?? labelMap.general;
  const color = typeColors[status] ?? 'gray';
  const label = typeLabels[status] ?? status ?? 'Unknown';

  return (
    <Badge color={color} variant="light" size="sm" className={className}>
      {label}
    </Badge>
  );
};

export default StatusBadge;
