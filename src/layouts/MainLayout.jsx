import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';

const pageTitles = {
  '/': 'Dashboard',
  '/customers': 'Customer Management',
  '/loans': 'Loan Management',
  '/payments': 'Payment History',
  '/tasks': 'Tasks & Reminders',
  '/reports': 'Reports & Analytics',
  '/settings': 'System Settings'
};

export function MainLayout() {
  const location = useLocation();
  const currentTitle = pageTitles[location.pathname] || 'Sri Gold Pawn Shop';

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-wrapper">
        <Header title={currentTitle} />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

