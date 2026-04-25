import { useState, useEffect, useCallback } from 'react';
import { LineChart, DonutChart } from '@mantine/charts';
import {
  Table, Paper, ScrollArea, Center, Text, Badge, Group, Pagination,
} from '@mantine/core';
import { hyPureService } from '../../services/hyPureService';

// ─── SVG Gauge ───────────────────────────────────────────────────────────────
const GAUGE_CX = 90;
const GAUGE_CY = 100;
const GAUGE_R  = 70;

function fractionToPoint(p, radius) {
  const angle = Math.PI + p * Math.PI;
  return { x: GAUGE_CX + radius * Math.cos(angle), y: GAUGE_CY + radius * Math.sin(angle) };
}

function zoneArcPath(p1, p2) {
  const start = fractionToPoint(p1, GAUGE_R);
  const end   = fractionToPoint(p2, GAUGE_R);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${GAUGE_R} ${GAUGE_R} 0 ${(p2 - p1) > 0.5 ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const SvgGauge = ({ value, min, max, zones }) => {
  const clampedVal  = Math.max(min, Math.min(max, value ?? min));
  const totalRange  = max - min;
  const needleTip   = fractionToPoint((clampedVal - min) / totalRange, GAUGE_R - 22);
  const ticks       = Array.from({ length: 11 }, (_, i) => i);

  return (
    <svg viewBox="0 0 180 110" width="180" height="110">
      {zones.map((zone, i) => (
        <path key={i} d={zoneArcPath((zone.from - min) / totalRange, (zone.to - min) / totalRange)}
          fill="none" stroke={zone.color} strokeWidth={14} strokeLinecap="butt" />
      ))}
      {ticks.map((i) => {
        const outer = fractionToPoint(i / 10, GAUGE_R - 8);
        const inner = fractionToPoint(i / 10, GAUGE_R - 20);
        return <line key={i} x1={inner.x.toFixed(2)} y1={inner.y.toFixed(2)} x2={outer.x.toFixed(2)} y2={outer.y.toFixed(2)} stroke="#9CA3AF" strokeWidth={1} />;
      })}
      {ticks.filter(i => i % 2 === 0).map((i) => {
        const pt = fractionToPoint(i / 10, GAUGE_R - 30);
        return <text key={i} x={pt.x.toFixed(2)} y={pt.y.toFixed(2)} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#6B7280">{Math.round(min + (i / 10) * totalRange)}</text>;
      })}
      <line x1={GAUGE_CX} y1={GAUGE_CY} x2={needleTip.x.toFixed(2)} y2={needleTip.y.toFixed(2)} stroke="#1F2937" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={GAUGE_CX} cy={GAUGE_CY} r={5} fill="#374151" />
    </svg>
  );
};

const GaugeCard = ({ label, value, unit, min, max, zones }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col items-center">
    <h3 className="text-sm font-semibold text-gray-600 mb-1">{label}</h3>
    <SvgGauge value={value} min={min} max={max} zones={zones} />
    <div className="mt-1 text-center">
      <span className="text-2xl font-bold text-gray-900">{value ?? '—'}</span>
      <span className="text-sm text-gray-500 ml-1">{unit}</span>
    </div>
  </div>
);

// ─── Signal Bars ─────────────────────────────────────────────────────────────
const SignalBars = ({ strength }) => {
  const MAX   = 6;
  const level = Math.min(MAX, Math.max(0, Math.round(strength ?? 0)));
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-end gap-1 h-8">
        {Array.from({ length: MAX }, (_, i) => {
          const active = i < level;
          const color  = level <= 2 ? (active ? 'bg-red-500' : 'bg-gray-200') : level <= 4 ? (active ? 'bg-yellow-500' : 'bg-gray-200') : (active ? 'bg-green-500' : 'bg-gray-200');
          return <div key={i} className={`w-2.5 rounded-sm ${color}`} style={{ height: 8 + i * 4 }} />;
        })}
      </div>
      <p className="text-xs text-gray-500 mt-1">{strength ?? '—'}/5</p>
    </div>
  );
};

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUS_INDICATORS = [
  { label: 'HV Status',     key: 'HVS' },
  { label: 'Oil Level',     key: 'Oil_Level' },
  { label: 'Limit Switch',  key: 'Limit_Switch' },
  { label: 'Motor Forward', key: 'Motor_Forward' },
  { label: 'Motor Reverse', key: 'Motor_Reverse' },
  { label: 'Spark',         key: 'Spark',       invert: true },
  { label: 'Motor Trip',    key: 'Motor_Trip',  invert: true },
  { label: 'Buzzer',        key: 'Buzzer',      invert: true },
];

const FAULT_FIELDS = {
  Tank_Pressure:          'Tank Pressure High',
  Motor_Trip_Fault:       'Motor Trip Fault',
  Moisture_Contamination: 'Moisture / Contamination',
  HVS_OFF:                'HVS Off',
  Change_Collector:       'Change Collector',
  Pump_Suction:           'Check Pump Suction',
  Drain_Period_Over:      'Drain Period Over',
};

function getActiveFaults(row) {
  if (!row) return [];
  return Object.entries(FAULT_FIELDS)
    .filter(([field]) => parseInt(row[field]) === 1)
    .map(([field, description]) => ({ field, description }));
}

// ─── HyPure Dashboard ────────────────────────────────────────────────────────
const HyPureDashboard = () => {
  const [activeTab, setActiveTab]           = useState('device-overview');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  const [devicesLatest, setDevicesLatest]   = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError]     = useState(null);

  const [latest, setLatest]               = useState(null);
  const [history, setHistory]             = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError]     = useState(null);

  const [tableData, setTableData]   = useState([]);
  const [tableMeta, setTableMeta]   = useState(null);
  const [tableLoading, setTableLoading] = useState(false);

  const fetchDevicesLatest = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);
    const result = await hyPureService.getDevicesLatest();
    if (result.success) setDevicesLatest(result.data);
    else setDevicesError(result.error || 'Failed to load devices');
    setDevicesLoading(false);
  }, []);

  const fetchOverview = useCallback(async (deviceId) => {
    setOverviewLoading(true);
    setOverviewError(null);
    const result = await hyPureService.getOverview({ deviceIds: deviceId ? [deviceId] : [], historyLimit: 50 });
    if (result.success) { setLatest(result.data.latest); setHistory(result.data.history); }
    else setOverviewError(result.error || 'Failed to load data');
    setOverviewLoading(false);
  }, []);

  const fetchTableData = useCallback(async (deviceId, page) => {
    setTableLoading(true);
    const result = await hyPureService.getData({ deviceIds: deviceId ? [deviceId] : [], page, limit: 20 });
    if (result.success) { setTableData(result.data); setTableMeta(result.meta); }
    setTableLoading(false);
  }, []);

  useEffect(() => {
    fetchDevicesLatest();
    const interval = setInterval(fetchDevicesLatest, 60000);
    return () => clearInterval(interval);
  }, [fetchDevicesLatest]);

  useEffect(() => {
    if (!selectedDeviceId || activeTab !== 'detail') return;
    fetchOverview(selectedDeviceId);
    const interval = setInterval(() => fetchOverview(selectedDeviceId), 60000);
    return () => clearInterval(interval);
  }, [selectedDeviceId, activeTab, fetchOverview]);

  useEffect(() => {
    if (!selectedDeviceId || activeTab !== 'history') return;
    fetchTableData(selectedDeviceId, 1);
  }, [selectedDeviceId, activeTab, fetchTableData]);

  const handleDeviceClick = (deviceId) => { setSelectedDeviceId(deviceId); setActiveTab('detail'); };
  const handleViewHistory  = () => setActiveTab('history');
  const handleTablePageChange = (page) => fetchTableData(selectedDeviceId, page);

  const kvVal       = parseFloat(latest?.kV_Value)    || 0;
  const maVal       = parseFloat(latest?.mA_Value)    || 0;
  const pressureVal = parseFloat(latest?.Pressure)    || 0;
  const tempVal     = parseFloat(latest?.Temperature) || 0;
  const motorHrs    = (parseFloat(latest?.Motor_Runtime_Min) / 60).toFixed(1);
  const totalHrs    = (parseFloat(latest?.Total_Runtime_Min) / 60).toFixed(1);
  const deviceHrs   = (parseFloat(latest?.Device_Runtime_Min) / 60).toFixed(1);
  const offHrs      = Math.max(0, totalHrs - motorHrs).toFixed(1);
  const isRunning   = parseInt(latest?.Motor_Forward) === 1 || parseInt(latest?.Motor_Reverse) === 1;
  const activeFaults = getActiveFaults(latest);
  const runningCount = devicesLatest.filter(d => parseInt(d.Motor_Forward) === 1 || parseInt(d.Motor_Reverse) === 1).length;
  const stoppedCount = devicesLatest.length - runningCount;

  const runtimePieData = [
    { name: 'Running', value: parseFloat(motorHrs) || 0, color: '#10B981' },
    { name: 'Off',     value: parseFloat(offHrs)   || 0, color: '#F87171' },
  ];

  const chartData = history.map(r => ({
    time:     new Date(r.CreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    kV:       parseFloat(r.kV_Value)    || 0,
    mA:       parseFloat(r.mA_Value)    || 0,
    temp:     parseFloat(r.Temperature) || 0,
    pressure: parseFloat(r.Pressure)    || 0,
  }));

  const tabs = [
    { key: 'device-overview', label: 'Device Overview' },
    { key: 'detail',          label: 'Device Detail' },
    { key: 'history',         label: 'Device History' },
  ];

  // Device overview table rows
  const overviewRows = devicesLatest.map((row, i) => {
    const rowFaults = getActiveFaults(row);
    const running   = parseInt(row.Motor_Forward) === 1 || parseInt(row.Motor_Reverse) === 1;
    return (
      <Table.Tr key={row.Device_ID} style={{ cursor: 'pointer' }} onClick={() => handleDeviceClick(row.Device_ID)}>
        <Table.Td>
          <Badge color="teal" variant="filled" size="sm">{row.Device_ID}</Badge>
        </Table.Td>
        <Table.Td ta="center">
          <Text size="sm" fw={500}>{row.kV_Value != null ? `${row.kV_Value} kV` : '—'}</Text>
        </Table.Td>
        <Table.Td ta="center">
          <Text size="sm" fw={500}>{row.mA_Value != null ? `${row.mA_Value} mA` : '—'}</Text>
        </Table.Td>
        <Table.Td ta="center">
          <Text size="sm" fw={500}>{row.Temperature != null ? `${row.Temperature}°C` : '—'}</Text>
        </Table.Td>
        <Table.Td ta="center">
          <Text size="sm" fw={500}>{row.Pressure != null ? `${row.Pressure} bar` : '—'}</Text>
        </Table.Td>
        <Table.Td ta="center">
          <Text size="sm" fw={600} c="green">
            {((parseFloat(row.Total_Runtime_Min) || 0) / 60).toFixed(0)} Hrs
          </Text>
        </Table.Td>
        <Table.Td ta="center">
          <Text size="sm" fw={600} c="green">
            {((parseFloat(row.Motor_Runtime_Min) || 0) / 60).toFixed(0)} Hrs
          </Text>
        </Table.Td>
        <Table.Td ta="center">
          <Text size="sm" fw={600} c="blue">
            {((parseFloat(row.Device_Runtime_Min) || 0) / 60).toFixed(0)} Hrs
          </Text>
        </Table.Td>
        <Table.Td>
          {rowFaults.length > 0 ? (
            <Group gap={4} wrap="wrap">
              {rowFaults.map(f => (
                <Badge key={f.field} color="red" variant="light" size="xs">{f.description}</Badge>
              ))}
            </Group>
          ) : (
            <Text size="xs" fw={600} c="green">None</Text>
          )}
        </Table.Td>
        <Table.Td ta="center">
          <Badge color={running ? 'green' : 'red'} variant="light" size="sm">
            {running ? 'RUNNING' : 'STOPPED'}
          </Badge>
        </Table.Td>
      </Table.Tr>
    );
  });

  // History table rows
  const historyRows = tableData.map((row, i) => {
    const rowFaults = getActiveFaults(row);
    return (
      <Table.Tr key={row.Entry_ID ?? i}>
        <Table.Td><Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{new Date(row.CreatedAt).toLocaleString()}</Text></Table.Td>
        <Table.Td ta="center"><Text size="sm" fw={500}>{row.Signal_Strength ?? '—'}</Text></Table.Td>
        <Table.Td ta="center"><Text size="sm" fw={500}>{row.kV_Value != null ? `${row.kV_Value} kV` : '—'}</Text></Table.Td>
        <Table.Td ta="center"><Text size="sm" fw={500}>{row.mA_Value != null ? `${row.mA_Value} mA` : '—'}</Text></Table.Td>
        <Table.Td ta="center"><Text size="sm" fw={500}>{row.kV_Minimum != null ? `${row.kV_Minimum} kV` : '—'}</Text></Table.Td>
        <Table.Td ta="center"><Text size="sm" fw={500}>{row.mA_Minimum != null ? `${row.mA_Minimum} mA` : '—'}</Text></Table.Td>
        <Table.Td ta="center"><Text size="sm" fw={500}>{row.Temperature != null ? `${row.Temperature}°C` : '—'}</Text></Table.Td>
        <Table.Td ta="center"><Text size="sm" fw={500}>{row.Pressure != null ? `${row.Pressure} bar` : '—'}</Text></Table.Td>
        <Table.Td>
          {rowFaults.length > 0 ? (
            <Group gap={4} wrap="wrap">
              {rowFaults.map(f => (
                <Badge key={f.field} color="red" variant="light" size="xs">{f.description}</Badge>
              ))}
            </Group>
          ) : (
            <Text size="xs" c="dimmed">None</Text>
          )}
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <nav className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="px-6 py-3 flex items-center gap-4 text-xs text-gray-500">
          {activeTab === 'device-overview' && (
            <>
              <span>
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${devicesLoading ? 'bg-yellow-400 animate-pulse' : devicesError ? 'bg-red-500' : 'bg-green-500'}`} />
                {devicesLoading ? 'Loading…' : devicesError ? 'Error' : 'Live'}
              </span>
              <span>Total: <strong className="text-gray-700">{devicesLatest.length}</strong></span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Running: <strong className="text-gray-700 ml-1">{runningCount}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                Stopped: <strong className="text-gray-700 ml-1">{stoppedCount}</strong>
              </span>
              {!devicesLoading && (
                <button onClick={fetchDevicesLatest} className="ml-auto text-emerald-600 hover:underline">Refresh</button>
              )}
            </>
          )}
          {(activeTab === 'detail' || activeTab === 'history') && (
            <>
              <span>
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${overviewLoading ? 'bg-yellow-400 animate-pulse' : overviewError ? 'bg-red-500' : selectedDeviceId ? 'bg-green-500' : 'bg-gray-300'}`} />
                {overviewLoading ? 'Loading…' : overviewError ? 'Error' : selectedDeviceId ? 'Live' : '—'}
              </span>
              {selectedDeviceId && (
                <>
                  <span>Device: <strong className="text-gray-700">{selectedDeviceId}</strong></span>
                  {latest && <span>Last update: <strong className="text-gray-700">{new Date(latest.CreatedAt).toLocaleString()}</strong></span>}
                </>
              )}
              {!overviewLoading && selectedDeviceId && activeTab === 'detail' && (
                <button onClick={() => fetchOverview(selectedDeviceId)} className="ml-auto text-emerald-600 hover:underline">Refresh</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── DEVICE OVERVIEW TAB ── */}
      {activeTab === 'device-overview' && (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          {devicesLoading && devicesLatest.length > 0 && (
            <div className="px-4 py-1.5 bg-yellow-50 border-b border-yellow-100 text-xs text-yellow-700 animate-pulse">Refreshing…</div>
          )}
          {devicesError && <div className="p-6 text-center text-red-600 text-sm">{devicesError}</div>}
          {devicesLoading && devicesLatest.length === 0 && (
            <Center py="xl"><Text size="sm" c="dimmed" className="animate-pulse">Loading devices…</Text></Center>
          )}
          {!devicesLoading && !devicesError && devicesLatest.length === 0 && (
            <Center py="xl"><Text size="sm" c="dimmed">No HyPure devices found for your account.</Text></Center>
          )}
          {devicesLatest.length > 0 && (
            <>
              <ScrollArea>
                <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Device ID</Table.Th>
                      <Table.Th ta="center">Voltage (kV)</Table.Th>
                      <Table.Th ta="center">Current (mA)</Table.Th>
                      <Table.Th ta="center">Temperature</Table.Th>
                      <Table.Th ta="center">Pressure</Table.Th>
                      <Table.Th ta="center">Total Runtime</Table.Th>
                      <Table.Th ta="center">Motor Runtime</Table.Th>
                      <Table.Th ta="center">Device Runtime</Table.Th>
                      <Table.Th>Active Faults</Table.Th>
                      <Table.Th ta="center">Running Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>{overviewRows}</Table.Tbody>
                </Table>
              </ScrollArea>
              <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                Click any row to view Device Detail
              </div>
            </>
          )}
        </Paper>
      )}

      {/* ── DEVICE DETAIL TAB ── */}
      {activeTab === 'detail' && (
        <>
          {!selectedDeviceId ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center text-gray-500 text-sm">
              No device selected.{' '}
              <button onClick={() => setActiveTab('device-overview')} className="text-emerald-600 underline">Go to Device Overview</button>{' '}
              to select a device.
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <button onClick={handleViewHistory}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  View Device History
                </button>
              </div>

              {overviewError && !latest && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center text-red-700 text-sm">{overviewError}</div>
              )}
              {!overviewLoading && !overviewError && !latest && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center text-gray-500 text-sm">
                  No data found for device <strong>{selectedDeviceId}</strong>.
                </div>
              )}

              {activeFaults.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-red-800">
                    Active Faults: {activeFaults.map(f => f.description).join(', ')}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <GaugeCard label="Voltage" value={kvVal} unit="kV" min={0} max={20} zones={[{ from: 0, to: 5, color: '#EF4444' }, { from: 5, to: 10, color: '#F59E0B' }, { from: 10, to: 20, color: '#10B981' }]} />
                <GaugeCard label="Current" value={maVal} unit="mA" min={0} max={20} zones={[{ from: 0, to: 8, color: '#10B981' }, { from: 8, to: 15, color: '#F59E0B' }, { from: 15, to: 20, color: '#EF4444' }]} />
                <GaugeCard label="Pressure" value={pressureVal} unit="bar" min={0} max={10} zones={[{ from: 0, to: 3, color: '#10B981' }, { from: 3, to: 7, color: '#F59E0B' }, { from: 7, to: 10, color: '#EF4444' }]} />
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Runtime</h3>
                  <div className="flex justify-center">
                    <div style={{ width: 120, height: 120 }}>
                      <DonutChart data={runtimePieData} size={120} thickness={20} withTooltip tooltipDataSource="segment" />
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Motor</span>
                      <span className="font-bold text-gray-900">{motorHrs} Hrs</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> Off</span>
                      <span className="font-bold text-gray-900">{offHrs} Hrs</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-gray-100 pt-1">
                      <span className="text-gray-500">Device Total</span>
                      <span className="font-bold text-gray-900">{deviceHrs} Hrs</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[{ title: 'KV Trend', key: 'kV', color: '#10B981', unit: 'kV' }, { title: 'Current Trend', key: 'mA', color: '#EF4444', unit: 'mA' }].map(({ title, key, color, unit }) => (
                  <div key={key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3">{title}</h3>
                    <LineChart data={chartData} dataKey="time" h={200} w="100%" style={{ minWidth: 0 }} series={[{ name: key, color, label: `${title} (${unit})` }]} withDots={false} curveType="monotone" withTooltip withXAxis withYAxis gridAxis="xy" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[{ title: 'Temperature Trend (°C)', key: 'temp', color: '#F59E0B', unit: '°C' }, { title: 'Pressure Trend (bar)', key: 'pressure', color: '#3B82F6', unit: 'bar' }].map(({ title, key, color, unit }) => (
                  <div key={key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3">{title}</h3>
                    <LineChart data={chartData} dataKey="time" h={200} w="100%" style={{ minWidth: 0 }} series={[{ name: key, color, label: `${title} (${unit})` }]} withDots={false} curveType="monotone" withTooltip withXAxis withYAxis gridAxis="xy" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">System Status</h3>
                  <div className="space-y-2">
                    {STATUS_INDICATORS.map(({ label, key, invert }) => {
                      const val = parseInt(latest?.[key]) || 0;
                      const isOn  = val === 1;
                      const isGood = invert ? !isOn : isOn;
                      return (
                        <div key={key} className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{label}</span>
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className={`text-xs font-bold ${isGood ? 'text-green-600' : 'text-red-600'}`}>{isOn ? 'ON' : 'OFF'}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">Machine Status</h3>
                  <div className="flex justify-center mt-4">
                    {latest ? (
                      <span className={`px-4 py-2 rounded-lg text-sm font-bold ${isRunning ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                        {isRunning ? 'RUNNING' : 'STOPPED'}
                      </span>
                    ) : <span className="text-gray-400 text-sm">—</span>}
                  </div>
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Temperature:</span>
                      <span className="font-bold text-gray-900">{latest ? `${tempVal}°C` : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">Signal Strength</h3>
                  <div className="flex justify-center mt-4"><SignalBars strength={parseInt(latest?.Signal_Strength)} /></div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">Fault Status</h3>
                  {!latest ? (
                    <p className="text-sm text-gray-400 text-center py-4">No data</p>
                  ) : activeFaults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4">
                      <svg className="w-10 h-10 text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-semibold text-green-600">No Faults</p>
                      <p className="text-xs text-gray-400 mt-1">System operating normally</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeFaults.map(f => (
                        <div key={f.field} className="flex items-center gap-2 p-2 rounded-md bg-red-50 border border-red-200">
                          <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                          <span className="text-xs font-semibold text-red-800">{f.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── DEVICE HISTORY TAB ── */}
      {activeTab === 'history' && (
        <>
          {!selectedDeviceId ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center text-gray-500 text-sm">
              No device selected.{' '}
              <button onClick={() => setActiveTab('device-overview')} className="text-emerald-600 underline">Go to Device Overview</button>{' '}
              to select a device.
            </div>
          ) : (
            <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">History — {selectedDeviceId}</h3>
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveTab('detail')} className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline">
                    ← Back to Device Detail
                  </button>
                  {tableLoading && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
                </div>
              </div>

              <ScrollArea>
                {tableLoading ? (
                  <Center py="xl"><Text size="sm" c="dimmed" className="animate-pulse">Loading…</Text></Center>
                ) : tableData.length === 0 ? (
                  <Center py="xl"><Text size="sm" c="dimmed">No data available</Text></Center>
                ) : (
                  <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Time</Table.Th>
                        <Table.Th ta="center">Signal</Table.Th>
                        <Table.Th ta="center">Voltage (kV)</Table.Th>
                        <Table.Th ta="center">Current (mA)</Table.Th>
                        <Table.Th ta="center">kV Min</Table.Th>
                        <Table.Th ta="center">mA Min</Table.Th>
                        <Table.Th ta="center">Temp °C</Table.Th>
                        <Table.Th ta="center">Pressure</Table.Th>
                        <Table.Th>Faults</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>{historyRows}</Table.Tbody>
                  </Table>
                )}
              </ScrollArea>

              {tableMeta && tableMeta.totalPages > 1 && (
                <Group justify="space-between" align="center" px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                  <Text size="sm" c="dimmed">
                    Page {tableMeta.page} of {tableMeta.totalPages} — {tableMeta.total} records
                  </Text>
                  <Pagination total={tableMeta.totalPages} value={tableMeta.page} onChange={handleTablePageChange} size="sm" />
                </Group>
              )}
            </Paper>
          )}
        </>
      )}
    </div>
  );
};

export default HyPureDashboard;
