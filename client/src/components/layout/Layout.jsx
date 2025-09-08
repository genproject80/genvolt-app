import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Header */}
      <Header />
      
      {/* Main Content Area */}
      <main className="ml-64 pt-20">
        <div className="px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;