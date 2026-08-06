import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import ManageEventPanel from '../components/ManageEventPanel.jsx';
import LoginForm from '../components/LoginForm.jsx';
import CreateEventForm from '../components/CreateEventForm.jsx';
import '../styles/AdminDashboard.css';

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [jwt, setJwt] = useState(() => localStorage.getItem('adminJwt'));
  const [adminUser, setAdminUser] = useState(() => {
      const user = localStorage.getItem('adminUser');
      return user ? JSON.parse(user) : null;
  });
  const [status, setStatus] = useState('idle'); // idle, loading, loaded, error
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('adminJwt');
    localStorage.removeItem('adminUser');
    setJwt(null);
    setAdminUser(null);
    setEvents([]);
    setSelectedEvent(null);
  }, []);

  const fetchEvents = useCallback(() => {
    setStatus('loading');
    if (!jwt) return;
    fetch('/api/admin/events', {
      headers: { 'Authorization': `Bearer ${jwt}` }
    })
    .then(res => {
        if (res.status === 401) {
          handleLogout(); // Use the logout function to clear everything
          throw new Error('Invalid or expired token. Please log in again.');
        }
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        return res.json();
    })
    .then(data => {
        setEvents(data);
        setStatus('loaded');
    })
    .catch(err => {
        setError(err.message || 'Failed to fetch data.');
        setStatus('error');
    });
  }, [jwt, handleLogout]);

  useEffect(() => {
    if (jwt && adminUser) {
      fetchEvents();
    } else {
      setStatus('idle');
    }
  }, [jwt, adminUser, fetchEvents]);

  const handleLogin = useCallback(async (username, password) => {
    setStatus('loading');
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('adminJwt', data.token);
            localStorage.setItem('adminUser', JSON.stringify(data.user));
            setJwt(data.token);
            setAdminUser(data.user);
            setError(null);
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        setError(err.message);
        setStatus('error');
    }
  }, []);

  const handleEventDeleted = useCallback(() => {
    setSelectedEvent(null);
    fetchEvents();
  }, [fetchEvents]);

  // If there's no token, show the login form
  if (!jwt || !adminUser) {
    return <LoginForm onLogin={handleLogin} status={status} error={error} />;
  }

  return (
    <div>
      <header className="card dashboard-header">
        <div>
            <h1>Admin Dashboard</h1>
            <p>Logged in as <span className="font-bold">{adminUser.username}</span> ({adminUser.role})</p>
        </div>
        <button onClick={handleLogout} className="button is-danger">Logout</button>
      </header>

      <div className="card grid-layout">
        {/* --- Left Column: Event List and Creation --- */}
        <div className="dashboard-left-column">
          <CreateEventForm jwt={jwt} onEventCreated={fetchEvents} />

          <div className="card dashboard-card">
            <h3 className="section-header">Existing Events</h3>
            {status === 'loading' && <p>Loading events...</p>}
            {status === 'error' && <p className="text-danger">Error: {error}</p>}
            <ul className="event-list">
              {events.length > 0 ? events.map(e => (
                <li key={e.id} className={`event-list-item ${selectedEvent?.id === e.id ? 'is-primary' : 'is-muted'}`} onClick={() => setSelectedEvent(e)}>
                  <p>{e.name}</p>
                  <p className="font-mono">{e.id}</p>
                  {adminUser.role === 'superadmin' && e.owner_username && (
                    <p className="text-sm text-muted">Owner: {e.owner_username}</p>
                  )}
                </li>
              )) : <p className="text-muted">No events found. Create one to get started.</p>}
            </ul>
          </div>
        </div>

        {/* --- Right Column: Event Management --- */}
        <div>
          {selectedEvent ? (
            <ManageEventPanel event={selectedEvent} token={jwt} onEventDeleted={handleEventDeleted} />
          ) : (
            <div className="card dashboard-card">
              <div className="placeholder-container">
                <h2>Select an event</h2>
                <p>Choose an event from the list on the left to manage its codes.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="card dashboard-footer">
        <Link to="/admin/change-password" className="button is-muted">Change Password</Link>
        {adminUser.role === 'superadmin' && (
            <Link to="/admin/manage-users" className="button is-primary">Manage Admins</Link>
        )}
      </footer>
    </div>
  );
}