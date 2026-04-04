import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import SubscriptionBanner from '../GracePeriodBanner';

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Header */}
      <Header />

      {/* Subscription grace / expired banner — sits between header and content */}
      <div className="ml-64 pt-16">
        <SubscriptionBanner />
      </div>

      {/* Main Content Area */}
      <main className="ml-64 pt-4">
        <div className="px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;