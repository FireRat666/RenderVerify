import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Title } from '../components/UI';
import '../styles/AdminForms.css';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const navigate = useNavigate();
  const token = localStorage.getItem('adminJwt');

  useEffect(() => {
    if (!token) {
        navigate('/admin');
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'New passwords do not match.', type: 'error' });
      return;
    }
    setMessage({ text: 'Updating password...', type: 'loading' });

    const res = await fetch('/api/admin/password', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    setMessage({ text: data.message, type: res.ok ? 'success' : 'error' });
    if (res.ok) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  if (!token) return null;

  return (
    <Card className="admin-form-card">
      <Title>Change Password</Title>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="current-password">Current Password</label>
          <input id="current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="new-password">New Password</label>
          <input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="confirm-password">Confirm New Password</label>
          <input id="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        </div>
        <button type="submit" className="button is-primary">Update Password</button>
        {message.text && <p className={`message-feedback ${message.type === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>}
      </form>
      <div className="form-footer">
        <Link to="/admin" className="button is-muted">Back to Dashboard</Link>
      </div>
    </Card>
  );
}