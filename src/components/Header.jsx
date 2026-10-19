import React, { useEffect, useState } from 'react';
import { databaseService } from '../services/databaseService';

export function Header({ title }) {
  const [dbStatus, setDbStatus] = useState({ connected: false, loading: true });

  useEffect(() => {
    let isMounted = true;
    async function checkDb() {
      try {
        const res = await databaseService.getStatus();
        if (isMounted) {
          if (res.success && res.data) {
            setDbStatus({ connected: res.data.connected, loading: false });
          } else {
            setDbStatus({ connected: false, loading: false });
          }
        }
      } catch (err) {
        if (isMounted) {
          setDbStatus({ connected: false, loading: false });
        }
      }
    }
    checkDb();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>
      <div className="header-actions">
        <div
          className={`status-badge ${
            dbStatus.loading
              ? ''
              : dbStatus.connected
              ? 'connected'
              : 'disconnected'
          }`}
        >
          <span className="status-dot"></span>
          <span>
            {dbStatus.loading
              ? 'Connecting DB...'
              : dbStatus.connected
              ? 'SQLite Connected'
              : 'DB Offline'}
          </span>
        </div>
      </div>
    </header>
  );
}

