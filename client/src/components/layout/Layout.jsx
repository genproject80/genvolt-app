import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import SubscriptionBanner from '../GracePeriodBanner';

const Layout = ({ children }) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} />

      {/* Header */}
      <Header onMenuClick={() => setIsMobileSidebarOpen(true)} />

      {/* Subscription grace / expired banner — sits between header and content */}
      <div className="lg:ml-64 pt-16">
        <SubscriptionBanner />
      </div>

      {/* Main Content Area */}
      <main className="lg:ml-64 pt-4">
        <div className="px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;