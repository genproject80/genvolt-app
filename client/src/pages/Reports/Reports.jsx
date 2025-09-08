import React from 'react';

const Reports = () => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
        <p className="text-gray-600">
          Generate and view detailed reports about your IoT system performance.
        </p>
      </div>

      {/* Reports Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Reports */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Available Reports</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Energy Usage Report</h3>
              <p className="text-sm text-gray-600 mb-3">Detailed analysis of energy consumption patterns.</p>
              <button className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors">
                Generate Report
              </button>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Device Performance</h3>
              <p className="text-sm text-gray-600 mb-3">Performance metrics and uptime statistics.</p>
              <button className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors">
                Generate Report
              </button>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Cost Analysis</h3>
              <p className="text-sm text-gray-600 mb-3">Financial impact and savings analysis.</p>
              <button className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors">
                Generate Report
              </button>
            </div>
          </div>
        </div>

        {/* Recent Reports */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Reports</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">Energy Usage - March 2024</h4>
                  <p className="text-sm text-gray-500">Generated 2 days ago</p>
                </div>
                <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                  Download
                </button>
              </div>
              
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">Device Performance - Q1 2024</h4>
                  <p className="text-sm text-gray-500">Generated 1 week ago</p>
                </div>
                <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                  Download
                </button>
              </div>
              
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">Cost Analysis - February 2024</h4>
                  <p className="text-sm text-gray-500">Generated 2 weeks ago</p>
                </div>
                <button className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;