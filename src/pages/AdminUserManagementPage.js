import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Title } from '../components/UI';
import '../styles/AdminForms.css';

export default function AdminUserManagementPage() {
    // State for the creation form
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('admin');

    // State for the user list and page status
    const [users, setUsers] = useState([]);
    const [status, setStatus] = useState('loading'); // loading, loaded, error
    const [message, setMessage] = useState({ text: '', type: '' });
    const [currentUser, setCurrentUser] = useState(null);

    const navigate = useNavigate();
    const token = localStorage.getItem('adminJwt');

    const fetchUsers = useCallback(async () => {
        setStatus('loading');
        try {
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to fetch users.');
            const data = await res.json();
            setUsers(data);
            setStatus('loaded');
        } catch (err) {
            setMessage({ text: err.message, type: 'error' });
            setStatus('error');
        }
    }, [token]);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('adminUser'));
        if (!token || !user || user.role !== 'superadmin') {
            navigate('/admin');
        }
    }, [token, navigate]);

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        setMessage({ text: 'Creating admin...', type: 'loading' });
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const data = await res.json();
        if (res.ok) {
            setMessage({ text: `Admin "${data.username}" created successfully.`, type: 'success' });
            setUsername('');
            setPassword('');
            fetchUsers(); // Refresh the list
        } else {
            setMessage({ text: data.message, type: 'error' });
        }
    };

    const handleUpdateRole = async (userId, newRole) => {
        setMessage({ text: 'Updating role...', type: 'loading' });
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to update role.');
            setMessage({ text: 'Role updated successfully.', type: 'success' });
            fetchUsers(); // Refresh list
        } catch (err) {
            setMessage({ text: err.message, type: 'error' });
        }
    };

    const handleDeleteUser = async (userId, userUsername) => {
        if (window.confirm(`Are you sure you want to delete the admin "${userUsername}"? This action cannot be undone.`)) {
            setMessage({ text: 'Deleting user...', type: 'loading' });
            try {
                const res = await fetch(`/api/admin/users/${userId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.status === 204) {
                    setMessage({ text: `User "${userUsername}" deleted successfully.`, type: 'success' });
                    fetchUsers(); // Refresh list
                } else {
                    const data = await res.json();
                    throw new Error(data.message || 'Failed to delete user.');
                }
            } catch (err) {
                setMessage({ text: err.message, type: 'error' });
            }
        }
    };

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('adminUser'));
        if (!token || !user || user.role !== 'superadmin') {
            navigate('/admin');
        } else {
            setCurrentUser(user);
            fetchUsers();
        }
    }, [token, navigate, fetchUsers]);

    const superadminCount = users.filter(u => u.role === 'superadmin').length;

    const UserRow = ({ user }) => {
        const isCurrentUser = user.id === currentUser.id;
        const canDemote = !(isCurrentUser && superadminCount <= 1);

        return (
            <li className="user-list-item">
                <div className="user-info">
                    <strong>{user.username}</strong> {isCurrentUser && <span className="tag-you">(You)</span>}
                    <br />
                    <span className="text-muted">Role: {user.role} | Joined: {new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                <div className="user-actions">
                    {!isCurrentUser && (
                        <>
                            <select
                                defaultValue={user.role}
                                onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                                disabled={!canDemote}
                                title={!canDemote ? 'Cannot demote the last superadmin.' : 'Change role'}
                            >
                                <option value="admin">Admin</option>
                                <option value="superadmin">Super Admin</option>
                            </select>
                            <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                className="button is-danger is-small"
                            >
                                Delete
                            </button>
                        </>
                    )}
                     {isCurrentUser && !canDemote && (
                        <p className="text-muted text-sm">Cannot remove the last superadmin.</p>
                    )}
                </div>
            </li>
        );
    };

    if (!token) return null;

    return (
        <Card className="admin-form-card">
            <Title>Admin User Management</Title>
            <form onSubmit={handleCreateAdmin} className="create-admin-form">
                <h4>Create New Admin</h4>
                <div>
                    <label>Username</label>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div>
                    <label>Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <div>
                    <label>Role</label>
                    <select value={role} onChange={e => setRole(e.target.value)}>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Super Admin</option>
                    </select>
                </div>
                <button type="submit" className="button is-primary">Create Admin</button>
                {message.text && <p className={`message-feedback ${message.type === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>}
            </form>

            <hr />

            <div className="existing-admins-section">
                <h4>Existing Admins</h4>
                {status === 'loading' && <p>Loading users...</p>}
                {status === 'error' && <p className="text-danger">Could not load users.</p>}
                {status === 'loaded' && (
                    <ul className="user-list">
                        {users.map(user => <UserRow key={user.id} user={user} />)}
                    </ul>
                )}
            </div>

            <div className="form-footer">
                <Link to="/admin" className="button is-muted">Back to Dashboard</Link>
            </div>
        </Card>
    );
}