import React from 'react';

const LoadingSpinner = ({ size = 'medium', className = '', inline = false, showText = true }) => {
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12'
  };

  const spinnerElement = (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-gray-300 border-t-primary-600`}
    />
  );

  if (inline) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        {spinnerElement}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center min-h-screen ${className}`}>
      <div className="flex flex-col items-center space-y-4">
        {spinnerElement}
        {showText && <p className="text-gray-600 text-sm">Loading...</p>}
      </div>
    </div>
  );
};

export default LoadingSpinner;