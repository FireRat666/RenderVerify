import React, { useState, useCallback } from 'react';
import '../styles/CreateEventForm.css';

export default function CreateEventForm({ jwt, onEventCreated }) {
  const [newEventID, setNewEventID] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [createMessage, setCreateMessage] = useState({ text: '', type: '' });

  const handleCreateEvent = useCallback(async (e) => {
    e.preventDefault();
    setCreateMessage({ text: 'Creating event...', type: 'loading' });
    const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newEventID, name: newEventName, description: newEventDesc })
    });
    const data = await res.json();
    if (res.ok) {
        setCreateMessage({ text: `Event "${data.name}" created successfully!`, type: 'success' });
        setNewEventID('');
        setNewEventName('');
        setNewEventDesc('');
        onEventCreated(); // Notify parent to refresh the list
    } else {
        setCreateMessage({ text: data.message, type: 'error' });
    }
  }, [jwt, newEventID, newEventName, newEventDesc, onEventCreated]);

  return (
    <div className="card dashboard-card">
      <h3 className="section-header">Create New Event</h3>
      <form onSubmit={handleCreateEvent}>
        <div>
          <label htmlFor="event-id">Event ID</label>
          <input id="event-id" type="text" value={newEventID} onChange={e => setNewEventID(e.target.value)} placeholder="e.g., 'conference-2025'" required />
        </div>
        <div>
          <label htmlFor="event-name">Event Name</label>
          <input id="event-name" type="text" value={newEventName} onChange={e => setNewEventName(e.target.value)} placeholder="e.g., 'Annual Tech Conference'" required />
        </div>
        <div>
          <label htmlFor="event-desc">Description</label>
          <textarea id="event-desc" value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} rows="3"></textarea>
        </div>
        <button type="submit" className="button is-primary full-width">Create Event</button>
        {createMessage.text && <p className={`create-event-message ${createMessage.type === 'error' ? 'text-danger' : 'text-success'}`}>{createMessage.text}</p>}
      </form>
    </div>
  );
}