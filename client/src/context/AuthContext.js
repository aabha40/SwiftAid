import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('swiftaid_token');
    const userData = localStorage.getItem('swiftaid_user');
    if (token && userData) setUser(JSON.parse(userData));
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    setUser(userData);
    localStorage.setItem('swiftaid_token', token);
    localStorage.setItem('swiftaid_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.clear();
  };

  const getDashboardRoute = (role) => ({
    patient: '/patient',
    driver: '/driver',
    hospital_admin: '/hospital',
    super_admin: '/admin',
  }[role] || '/login');

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getDashboardRoute, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);