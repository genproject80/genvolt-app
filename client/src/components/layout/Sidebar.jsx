import { useState } from 'react';
import { NavLink, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { Stack, Text, ScrollArea, Box } from '@mantine/core';
import {
  IconLayoutDashboard,
  IconHome,
  IconSettings,
  IconUsers,
  IconChevronDown,
  IconChevronRight,
  IconShieldCheck,
  IconBuilding,
  IconDeviceDesktop,
  IconFlask,
  IconTable,
  IconDatabase,
  IconCreditCard,
  IconClipboardList,
  IconLayoutGrid,
  IconTag,
  IconServer,
  IconArchive,
  IconFlag,
} from '@tabler/icons-react';
import { useDashboard } from '../../context/DashboardContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../../context/FeatureFlagContext';
import clsx from 'clsx';

const NavItem = ({ to, icon: Icon, label, onClick, end = false }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      clsx(
        'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors no-underline',
        isActive
          ? 'bg-violet-50 text-violet-700'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      )
    }
  >
    <Icon size={18} />
    {label}
  </NavLink>
);

const subNavClassName = (isActive, forceActive) =>
  clsx(
    'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors no-underline',
    isActive || forceActive
      ? 'bg-violet-50 text-violet-700'
      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
  );

const SubNavItem = ({ to, icon: Icon, label, onClick, end = false, forceActive = false, active }) => {
  if (!to) {
    return (
      <a
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
        className={clsx('cursor-pointer', subNavClassName(active, forceActive))}
      >
        <Icon size={16} />
        {label}
      </a>
    );
  }
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => subNavClassName(isActive, forceActive)}
    >
      <Icon size={16} />
      {label}
    </NavLink>
  );
};

const SectionToggle = ({ icon: Icon, label, isActive, isOpen, onToggle }) => (
  <button
    onClick={onToggle}
    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
    className={clsx(
      'w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors',
      isActive
        ? 'bg-violet-50 text-violet-700'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    )}
  >
    <span className="flex items-center gap-3">
      <Icon size={18} />
      {label}
    </span>
    {isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
  </button>
);

const Sidebar = ({ onNavigate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isDashboardRoute = location.pathname.startsWith('/dashboard');
  const isClientDeviceRoute = !!useMatch('/admin/clients/:clientId/devices');

  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [deviceTestingOpen, setDeviceTestingOpen] = useState(true);

  const { dashboards, activeDashboard, setActiveDashboard } = useDashboard();
  const { user } = useAuth();
  const { hasAnyPermission, canViewDeviceTesting, canManageDeviceTestingTables } = usePermissions();
  const { isPaymentsEnabled } = useFeatureFlags();
  const isAdmin = ['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(user?.role_name || user?.role);

  const handleDashboardClick = (dashboard) => {
    setActiveDashboard(dashboard);
    if (location.pathname !== '/dashboard') navigate('/dashboard');
    onNavigate?.();
  };

  return (
    <ScrollArea h="100%" type="scroll">
      {/* Nav header */}
      <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <Text size="sm" fw={500} c="gray.7">Navigation</Text>
      </Box>

      <Stack gap={2} px="xs" py="xs">
        {/* Dashboard section */}
        <SectionToggle
          icon={IconHome}
          label="Dashboard"
          isActive={isDashboardRoute}
          isOpen={dashboardOpen}
          onToggle={() => setDashboardOpen((o) => !o)}
        />
        {dashboardOpen && (
          <div className="flex flex-col gap-0.5 pl-6 pt-0.5">
            {dashboards.map((dashboard) => (
              <SubNavItem
                key={dashboard.id}
                icon={IconLayoutDashboard}
                label={dashboard.display_name}
                active={activeDashboard?.id === dashboard.id}
                onClick={() => handleDashboardClick(dashboard)}
              />
            ))}
          </div>
        )}

        {/* Billing */}
        {isPaymentsEnabled && (
          <NavItem to="/billing" icon={IconCreditCard} label="Billing" onClick={onNavigate} />
        )}

        {/* Device Testing section */}
        {canViewDeviceTesting && (
          <>
            <SectionToggle
              icon={IconFlask}
              label="Device Testing"
              isActive={location.pathname.startsWith('/device-testing')}
              isOpen={deviceTestingOpen}
              onToggle={() => setDeviceTestingOpen((o) => !o)}
            />
            {deviceTestingOpen && (
              <div className="flex flex-col gap-0.5 pl-6 pt-0.5">
                <SubNavItem to="/device-testing" end icon={IconDatabase} label="Data Tables" onClick={onNavigate} />
              </div>
            )}
          </>
        )}

        {/* Admin section */}
        {user?.role !== 'CLIENT_USER' && (
          <>
            <SectionToggle
              icon={IconSettings}
              label="Admin"
              isActive={isAdminRoute}
              isOpen={adminOpen}
              onToggle={() => setAdminOpen((o) => !o)}
            />
            {adminOpen && (
              <div className="flex flex-col gap-0.5 pl-6 pt-0.5">
                <SubNavItem to="/admin/users" icon={IconUsers} label="User Management" onClick={onNavigate} />

                <SubNavItem to="/admin/clients" end icon={IconBuilding} label="Client Management" onClick={onNavigate} forceActive={isClientDeviceRoute} />

                {isClientDeviceRoute && (
                  <div className="ml-4 pl-2 border-l-2 border-violet-300">
                    <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-violet-600">
                      <IconServer size={14} />
                      Client Devices
                    </span>
                  </div>
                )}

                {hasAnyPermission(['Create Role', 'Edit Role']) && (
                  <SubNavItem to="/admin/roles" icon={IconShieldCheck} label="Role Management" onClick={onNavigate} />
                )}

                <SubNavItem to="/admin/devices" icon={IconDeviceDesktop} label="Device Management" onClick={onNavigate} />

                {isPaymentsEnabled && hasAnyPermission(['Manage Plans']) && (
                  <SubNavItem to="/admin/plans" icon={IconLayoutGrid} label="Plans" onClick={onNavigate} />
                )}

                {isPaymentsEnabled && hasAnyPermission(['Manage Discounts']) && (
                  <SubNavItem to="/admin/discounts" icon={IconTag} label="Discounts" onClick={onNavigate} />
                )}

                {isAdmin && (
                  <SubNavItem to="/admin/inventory" icon={IconArchive} label="Inventory" onClick={onNavigate} />
                )}

                {isPaymentsEnabled && hasAnyPermission(['Manage Subscriptions']) && (
                  <SubNavItem to="/admin/subscriptions" icon={IconClipboardList} label="Subscriptions" onClick={onNavigate} />
                )}

                {isAdmin && (
                  <SubNavItem to="/admin/feature-flags" icon={IconFlag} label="Feature Flags" onClick={onNavigate} />
                )}

                {canManageDeviceTestingTables && (
                  <SubNavItem to="/admin/table-config" icon={IconTable} label="Table Configuration" onClick={onNavigate} />
                )}
              </div>
            )}
          </>
        )}
      </Stack>
    </ScrollArea>
  );
};

export default Sidebar;
