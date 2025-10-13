import React, { createContext, useContext, useState, useCallback } from 'react';
import { clientService } from '../services/clientService.js';

const ClientContext = createContext({});

export const useClient = () => {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
};

export const ClientProvider = ({ children }) => {
  const [clients, setClients] = useState([]);
  const [clientHierarchy, setClientHierarchy] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  });

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getAllClients = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await clientService.getAllClients(options);
      
      if (response.success) {
        setClients(response.data.clients);
        setPagination(response.data.pagination);
      } else {
        throw new Error(response.message || 'Failed to fetch clients');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const getClientById = useCallback(async (clientId) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await clientService.getClientById(clientId);
      
      if (response.success) {
        return response.data.client;
      } else {
        throw new Error(response.message || 'Failed to fetch client');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch client:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getClientHierarchy = useCallback(async (excludeClientId = null) => {
    try {
      setError(null);

      // Use getDescendantClients to get hierarchical clients (user's client + descendants)
      const response = await clientService.getDescendantClients();

      if (response.success) {
        let clients = response.data.clients;

        // Exclude the specified client if provided (for edit mode)
        if (excludeClientId) {
          clients = clients.filter(client => client.client_id !== parseInt(excludeClientId));
        }

        setClientHierarchy(clients);
        return clients;
      } else {
        throw new Error(response.message || 'Failed to fetch client hierarchy');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch client hierarchy:', err);
      return [];
    }
  }, []);

  const createClient = useCallback(async (clientData) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await clientService.createClient(clientData);
      
      if (response.success) {
        const newClient = response.data.client;
        
        setClients(prev => [newClient, ...prev]);
        
        setPagination(prev => ({
          ...prev,
          totalCount: prev.totalCount + 1
        }));
        
        return newClient;
      } else {
        throw new Error(response.message || 'Failed to create client');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to create client:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateClient = useCallback(async (clientId, clientData) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await clientService.updateClient(clientId, clientData);
      
      if (response.success) {
        const updatedClient = response.data.client;
        
        setClients(prev => 
          prev.map(client => 
            client.client_id === clientId ? updatedClient : client
          )
        );
        
        return updatedClient;
      } else {
        throw new Error(response.message || 'Failed to update client');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to update client:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteClient = useCallback(async (clientId) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await clientService.deleteClient(clientId);
      
      if (response.success) {
        setClients(prev => 
          prev.filter(client => client.client_id !== clientId)
        );
        
        setPagination(prev => ({
          ...prev,
          totalCount: Math.max(0, prev.totalCount - 1)
        }));
        
        return true;
      } else {
        throw new Error(response.message || 'Failed to delete client');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to delete client:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkEmailAvailability = useCallback(async (email, excludeClientId = null) => {
    try {
      setError(null);
      
      const response = await clientService.checkEmailAvailability(email, excludeClientId);
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to check email availability');
      }
    } catch (err) {
      console.error('Failed to check email availability:', err);
      return { available: false, message: 'Error checking email availability' };
    }
  }, []);

  const getClientStats = useCallback(async () => {
    try {
      setError(null);
      
      const response = await clientService.getClientStats();
      
      if (response.success) {
        return response.data.stats;
      } else {
        throw new Error(response.message || 'Failed to fetch client statistics');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch client statistics:', err);
      return null;
    }
  }, []);

  const refreshClients = useCallback((options = {}) => {
    return getAllClients(options);
  }, [getAllClients]);

  const value = {
    clients,
    clientHierarchy,
    loading,
    error,
    pagination,
    clearError,
    getAllClients,
    getClientById,
    getClientHierarchy,
    createClient,
    updateClient,
    deleteClient,
    checkEmailAvailability,
    getClientStats,
    refreshClients
  };

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
};

export default ClientProvider;