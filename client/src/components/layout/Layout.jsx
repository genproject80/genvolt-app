import { AppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Header from './Header';
import Sidebar from './Sidebar';
import SubscriptionBanner from '../GracePeriodBanner';

const NAVBAR_WIDTH = 256;
const HEADER_HEIGHT = 60;

const Layout = ({ children }) => {
  const [navbarOpened, { toggle: toggleNavbar, close: closeNavbar }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{
        width: NAVBAR_WIDTH,
        breakpoint: 'lg',
        collapsed: { mobile: !navbarOpened },
      }}
      bg="gray.0"
    >
      <AppShell.Header>
        <Header navbarOpened={navbarOpened} onToggleNavbar={toggleNavbar} />
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar onNavigate={closeNavbar} />
      </AppShell.Navbar>

      <AppShell.Main>
        <SubscriptionBanner />
        <div className="px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
};

export default Layout;
