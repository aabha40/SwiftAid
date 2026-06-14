import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = {
  patient: [
    { icon: '🚨', label: 'Emergency', path: '/patient', tab: 'request' },
    { icon: '🗺️', label: 'Track trip', path: '/patient', tab: 'track' },
    { icon: '📋', label: 'My requests', path: '/patient', tab: 'history' },
  ],
  driver: [
    { icon: '🚑', label: 'Dashboard', path: '/driver', tab: 'main' },
  ],
  hospital_admin: [
    { icon: '🏥', label: 'Dashboard', path: '/hospital', tab: 'main' },
  ],
  super_admin: [
    { icon: '📊', label: 'Overview', path: '/admin', tab: 'overview' },
    { icon: '🚑', label: 'Fleet', path: '/admin', tab: 'fleet' },
    { icon: '🏥', label: 'Hospitals', path: '/admin', tab: 'hospitals' },
    { icon: '👥', label: 'Users', path: '/admin', tab: 'users' },
  ],
};

const ROLE_COLORS = {
  patient: '#e94560',
  driver: '#10b981',
  hospital_admin: '#3b82f6',
  super_admin: '#8b5cf6',
};

// Global tab state — shared between Sidebar and Dashboards
let tabListeners = [];
let currentTab = 'overview';

export const setGlobalTab = (tab) => {
  currentTab = tab;
  sessionStorage.setItem('swiftaid_active_tab', tab);
  tabListeners.forEach(fn => fn(tab));
};

export const useGlobalTab = (defaultTab) => {
  // Try to restore from sessionStorage first
  const stored = sessionStorage.getItem('swiftaid_active_tab');
  const [tab, setTab] = React.useState(stored || defaultTab);

  React.useEffect(() => {
    const listener = (t) => {
      setTab(t);
      sessionStorage.setItem('swiftaid_active_tab', t);
    };
    tabListeners.push(listener);
    return () => { tabListeners = tabListeners.filter(fn => fn !== listener); };
  }, []);

  return [tab, setGlobalTab];
};

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState('overview');
  const navItems = NAV[user?.role] || [];
  const color = ROLE_COLORS[user?.role] || '#e94560';
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  // Listen for tab changes
  React.useEffect(() => {
    const listener = (t) => setActiveTab(t);
    tabListeners.push(listener);
    return () => { tabListeners = tabListeners.filter(fn => fn !== listener); };
  }, []);

  const handleNav = (item) => {
    navigate(item.path);
    setGlobalTab(item.tab);
    setActiveTab(item.tab);
  };

  return (
    <aside style={S.sidebar}>
      {/* Logo */}
      <div style={S.logo}>
        <div style={{ ...S.logoIcon, background: color }}>🚑</div>
        <div>
          <div style={S.logoText}>SwiftAid</div>
          <div style={S.logoSub}>Emergency System</div>
        </div>
      </div>

      {/* User card */}
      <div style={{ ...S.userCard, borderColor: color + '30' }}>
        <div style={{ ...S.avatar, background: color }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.userName}>{user?.name}</div>
          <div style={{ ...S.userRole, color }}>{user?.role?.replace('_', ' ')}</div>
        </div>
        <div style={{ ...S.onlineDot, background: color }} />
      </div>

      {/* Nav items */}
      <nav style={S.nav}>
        {navItems.map(item => {
          const active = activeTab === item.tab;
          return (
            <button key={item.tab} onClick={() => handleNav(item)} style={{
              ...S.navItem,
              background: active ? color + '20' : 'transparent',
              color: active ? color : '#64748b',
              borderLeft: active ? `3px solid ${color}` : '3px solid transparent',
            }}>
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: active ? 600 : 400 }}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <button onClick={() => {
  const confirm = window.confirm('Are you sure you want to logout?');
  if (confirm) { logout(); navigate('/login'); }
}} style={S.logout}>
  🚪 Logout
</button>
    </aside>
  );
};

const S = {
  sidebar: { width: '220px', flexShrink: 0, background: '#0d1526', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', padding: '20px 12px', minHeight: '100vh' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '0 8px' },
  logoIcon: { width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 },
  logoText: { fontSize: '15px', fontWeight: 700, color: '#f1f5f9' },
  logoSub: { fontSize: '10px', color: '#475569', marginTop: '1px' },
  userCard: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid', marginBottom: '16px' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 },
  userName: { fontSize: '12px', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRole: { fontSize: '10px', fontWeight: 500, textTransform: 'capitalize', marginTop: '1px' },
  onlineDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left', width: '100%' },
  logout: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, marginTop: '8px', width: '100%' },
};

export default Sidebar;