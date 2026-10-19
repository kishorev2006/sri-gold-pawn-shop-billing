import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/customers', label: 'Customers', icon: '👥' },
  { path: '/loans', label: 'Loans', icon: '📜' },
  { path: '/payments', label: 'Payments', icon: '💳' },
  { path: '/tasks', label: 'Tasks', icon: '✅' },
  { path: '/reports', label: 'Reports', icon: '📈' },
  { path: '/settings', label: 'Settings', icon: '⚙️' }
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">🪙</span>
        <span>Sri Gold Pawn Shop</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div>Offline Desktop v1.0.0</div>
        <div>Phase 1 Foundation</div>
      </div>
    </aside>
  );
}

