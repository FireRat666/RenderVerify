import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { Card, Title } from '../components/UI.jsx';
import '../styles/RegistrationPage.css';

export default function RegistrationPage() {
  const { eventID, userID, username } = useParams();
  const [status, setStatus] = useState('loading'); // loading, needs_code, registered, error
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/confirm/${userID}/${eventID}`) // The confirm URL doesn't need the username
      .then(res => res.json())
      .then(data => {
        if (data.registered) {
          setStatus('registered');
          setMessage('You are already registered for this event.');
        } else {
          setStatus('needs_code');
        }
      }).catch(err => {
          setStatus('error');
          setMessage('Could not verify registration status.');
      });
  }, [userID, eventID]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
        const res = await fetch(`/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userID, eventID, code, username })
        });
        const data = await res.json();
        setMessage(data.message);
        if (res.ok) {
            setStatus('registered');
        } else {
            setStatus('needs_code');
        }
    } catch(err) {
        setStatus('error');
        setMessage('A network error occurred. Please try again.');
    }
  };
  
  if (status === 'loading') return <Card className="text-center"><p>Loading...</p></Card>;
  if (status === 'error') return <Card className="text-center"><Title>Error</Title><p className="text-danger">{message}</p></Card>;
  if (status === 'registered') return <Card className="text-center"><Title>Registration Complete</Title><p className="text-success">{message}</p></Card>;

  return (
    <Card className="registration-card text-center">
        <Title>Register for Event</Title>
        <p>Username: <span className="font-mono">{username}</span></p>
        {username.length > 50 && (
            <p className="text-muted text-sm">(Your original username was too long and has been shortened)</p>
        )}
        <p className="mb-6">Event ID: <span className="font-mono">{eventID}</span></p>
        <form onSubmit={handleSubmit}>
            <div>
                <label htmlFor="code-input">Registration Code</label>
                <input id="code-input" type="text" value={code} onChange={e => setCode(e.target.value)} required />
            </div>
            <button type="submit" className="button is-primary full-width">Register</button>
            {message && <p className="message-text text-danger">{message}</p>}
        </form>
    </Card>
  );
}