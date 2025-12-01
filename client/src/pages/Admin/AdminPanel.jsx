import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AdminPanel = () => {
  const navigate = useNavigate();

  // Redirect to User Management when accessing /admin directly
  useEffect(() => {
    navigate('/admin/users', { replace: true });
  }, [navigate]);

  return null;
};

export default AdminPanel;