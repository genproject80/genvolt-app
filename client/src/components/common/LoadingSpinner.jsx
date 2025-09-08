import React from 'react';

const LoadingSpinner = ({ size = 'medium', className = '' }) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12'
  };

  return (
    <div className={`flex items-center justify-center min-h-screen ${className}`}>
      <div className="flex flex-col items-center space-y-4">
        <div
          className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-gray-300 border-t-primary-600`}
        />
        <p className="text-gray-600 text-sm">Loading...</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;