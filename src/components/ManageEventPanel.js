import React, { useState, useEffect, useCallback } from 'react';
import '../styles/ManageEventPanel.css';

export default function ManageEventPanel({ event, token, onEventDeleted }) {
  // State for codes and pagination
  const [codes, setCodes] = useState([]);
  const [totalCodes, setTotalCodes] = useState(0);
  const [overallTotalCodes, setOverallTotalCodes] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [status, setStatus] = useState('loading');
  const [newCodes, setNewCodes] = useState(''); // For the textarea
  const [message, setMessage] = useState({ text: '', type: '' });
  const [filterText, setFilterText] = useState('');
  const [selectedCodes, setSelectedCodes] = useState(new Set());
  const [codesPerPage, setCodesPerPage] = useState(100);
  const [debouncedFilterText, setDebouncedFilterText] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showUsedOnly, setShowUsedOnly] = useState(false);

  // Debounce filter input to avoid excessive API calls
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilterText(filterText);
      setCurrentPage(1); // Reset to first page on new filter
    }, 500); // 500ms delay

    return () => {
      clearTimeout(handler);
    };
  }, [filterText]);

  const fetchCodes = useCallback((page, filter, currentSortBy, currentSortOrder, usedOnly) => {
    setStatus('loading');
    const params = new URLSearchParams({
      page: page,
      limit: codesPerPage,
      filter: filter,
      sortBy: currentSortBy,
      sortOrder: currentSortOrder,
    });
    if (usedOnly) {
      params.append('used', 'true');
    }
    fetch(`/api/admin/events/${event.id}/codes?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.ok ? res.json() : Promise.reject('Failed to fetch codes.'))
    .then(data => {
      setCodes(data.codes);
      setTotalCodes(data.total);
      if (filter === '') {
        setOverallTotalCodes(data.total);
      }
      setSelectedCodes(new Set()); // Clear selection on refresh
      setStatus('loaded');
    })
    .catch(err => {
      setStatus('error');
      setMessage({ text: err.toString(), type: 'error' });
    });
  }, [event.id, token, codesPerPage]);

  useEffect(() => {
    if (event && token) {
      fetchCodes(currentPage, debouncedFilterText, sortBy, sortOrder, showUsedOnly);
    }
  }, [event, token, fetchCodes, currentPage, debouncedFilterText, sortBy, sortOrder, showUsedOnly]);

  const handleAddCodes = async (e) => {
    e.preventDefault();
    const codeList = newCodes.split('\n').map(c => c.trim()).filter(c => c);
    if (codeList.length === 0) {
      setMessage({ text: 'Please enter at least one code.', type: 'error' });
      return;
    }
    setMessage({ text: 'Adding codes...', type: 'loading' });

    const res = await fetch(`/api/admin/events/${event.id}/codes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: codeList })
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ text: data.message, type: 'success' });
      setNewCodes('');
      // Clearing the filter will trigger a refetch to page 1 with no filter.
      if (filterText) setFilterText(''); else fetchCodes(1, '', sortBy, sortOrder, showUsedOnly);
    } else {
      setMessage({ text: data.message, type: 'error' });
    }
  };

  const handleDeleteEvent = async () => {
    if (window.confirm(`Are you sure you want to delete the event "${event.name}"? This action cannot be undone.`)) {
        setMessage({ text: 'Deleting event...', type: 'loading' });
        const res = await fetch(`/api/admin/events/${event.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            // No need to set a success message, as the component will be unmounted.
            onEventDeleted(); // Notify parent to clear selection and refresh list
        } else {
            const data = await res.json().catch(() => ({}));
            setMessage({ text: data.message || 'An error occurred while deleting the event.', type: 'error' });
        }
    }
  };

  const handleSelectCode = (codeId) => {
    setSelectedCodes(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(codeId)) {
        newSelected.delete(codeId);
      } else {
        newSelected.add(codeId);
      }
      return newSelected;
    });
  };

  const handleSelectAll = () => {
    const visibleIds = new Set(codes.map(c => c.id));
    const newSelected = new Set(selectedCodes);

    // Check if all currently visible codes are selected
    const allVisibleSelected = codes.length > 0 && codes.every(c => newSelected.has(c.id));

    if (allVisibleSelected) {
      // If so, deselect them
      visibleIds.forEach(id => newSelected.delete(id));
    } else {
      // Otherwise, select them
      visibleIds.forEach(id => newSelected.add(id));
    }
    setSelectedCodes(newSelected);
  };

  const handleSort = (column) => {
    // If clicking the same column, toggle order. Otherwise, set new column and default to 'asc'.
    if (sortBy === column) {
      setSortOrder(prevOrder => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Go to first page on sort change
  };

  const handleDeleteSelectedCodes = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedCodes.size} selected code(s)?`)) {
      const res = await fetch(`/api/admin/events/${event.id}/codes`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeIds: Array.from(selectedCodes) })
      });
      const data = await res.json();
      setMessage({ text: data.message, type: res.ok ? 'success' : 'error' });
      if (res.ok) {
        const deletedCount = data.deletedCount || 0;
        if (deletedCount > 0) {
            setOverallTotalCodes(prev => prev - deletedCount);
        }
        // If the last item(s) on a page are deleted, go to the previous page.
        if (codes.length === selectedCodes.size && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        } else {
          fetchCodes(currentPage, debouncedFilterText, sortBy, sortOrder, showUsedOnly);
        }
      }
    }
  };

  const areAllVisibleSelected = codes.length > 0 && codes.every(c => selectedCodes.has(c.id));
  const totalPages = Math.ceil(totalCodes / codesPerPage);

  return (
    <div className="card manage-event-panel">
      <header>
        <div>
          <h2>{event.name}</h2>
          <p className="event-id">ID: {event.id}</p>
          <p>{event.description}</p>
        </div>
        <button onClick={handleDeleteEvent} className="button is-danger">
          Delete Event
        </button>
      </header>

      <hr />

      <h4>Manage Codes</h4>
      <form onSubmit={handleAddCodes} className="add-codes-form">
        <label htmlFor="code-batch">Add Codes (one per line)</label>
        <textarea
          id="code-batch"
          rows="5"
          value={newCodes}
          onChange={e => setNewCodes(e.target.value)}
        ></textarea>
        <button type="submit" className="button is-primary full-width">
          Add Codes
        </button>
        {message.text && (
          <p className={`panel-message ${message.type === 'error' ? 'text-danger' : 'text-success'}`}>
            {message.text}
          </p>
        )}
      </form>

      <div className="codes-header">
        <h4>
          Existing Codes (
          {debouncedFilterText
            ? `${totalCodes} / ${overallTotalCodes}`
            : totalCodes}
          )
        </h4>
        <label htmlFor="filter-codes-input" className="sr-only">Filter Codes</label>
        <input
          id="filter-codes-input"
          type="text"
          placeholder="Filter by code, username, or user ID..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          className="filter-input"
        />
      </div>

      <div className="filter-controls">
        <div className="page-size-selector">
            <label htmlFor="codes-per-page">Show:</label>
            <select
                id="codes-per-page"
                value={codesPerPage}
                onChange={e => {
                    setCodesPerPage(Number(e.target.value));
                    setCurrentPage(1); // Reset to first page when page size changes
                }}
            >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="1000">1000</option>
            </select>
        </div>
        <div className="select-all-container">
          <input
            type="checkbox"
            id="select-all-checkbox"
            checked={areAllVisibleSelected}
            onChange={handleSelectAll}
            disabled={codes.length === 0}
          />
          <label htmlFor="select-all-checkbox">Select All Visible</label>
        </div>
        <div className="used-only-filter">
          <input
            type="checkbox"
            id="used-only-checkbox"
            checked={showUsedOnly}
            onChange={e => {
              setShowUsedOnly(e.target.checked);
              setCurrentPage(1); // Reset to first page on filter change
            }}
          />
          <label htmlFor="used-only-checkbox">Show Used Codes Only</label>
        </div>
      </div>

      {status === 'loading' && <p>Loading codes...</p>}
      {status === 'loaded' && codes.length === 0 && <p>No codes found.</p>}
      {status === 'loaded' && codes.length > 0 && (
        <div className="codes-table-container">
          <table className="codes-table">
            <thead>
              <tr>
                <th className="col-select">
                  {/* The select-all checkbox is rendered above the table */}
                </th>
                <th>
                  <button onClick={() => handleSort('code')}>
                    Code {sortBy === 'code' && (sortOrder === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('username')}>
                    Username {sortBy === 'username' && (sortOrder === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('used_by')}>
                    User ID {sortBy === 'used_by' && (sortOrder === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('used_at')}>
                    Used At {sortBy === 'used_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className={c.used_by ? 'is-used' : 'is-unused'}>
                  <td className="col-select"><input type="checkbox" checked={selectedCodes.has(c.id)} onChange={() => handleSelectCode(c.id)} /></td>
                  <td className="col-code">{c.code}</td>
                  <td className="col-username">{c.username || (c.used_by ? 'N/A' : '')}</td>
                  <td className="col-userid">{c.used_by}</td>
                  <td className="col-usedat">{c.used_at ? new Date(c.used_at).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCodes.size > 0 && (
        <div className="list-actions">
          <button onClick={handleDeleteSelectedCodes} className="button is-danger"> Delete Selected ({selectedCodes.size}) </button>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination-controls">
          <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}