import React, { useState } from 'react';
import { Card, Title } from './UI.jsx';

export default function LoginForm({ onLogin, status, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <Card className="login-card">
      <Title>Admin Access</Title>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div>
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="button is-primary full-width" disabled={status === 'loading'}>
          {status === 'loading' ? 'Logging in...' : 'Login'}
        </button>
        {status === 'error' && <p className="text-danger" style={{ textAlign: 'center' }}>{error}</p>}
      </form>
    </Card>
  );
}