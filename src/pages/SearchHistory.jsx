import React, { useEffect, useState } from 'react';
import { Clock, Loader2, MapPin, Search } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './SearchHistory.css';

const SearchHistory = () => {
  const [history, setHistory] = useState([]);
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/search-history`, {
          headers: authHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load search history.');
        setHistory(data.history || []);
      } catch (historyError) {
        setError(historyError.message || 'Could not load search history.');
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, []);

  const openSearch = async (searchId) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/search-history/${searchId}`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load search details.');
      setSelectedSearch(data.search);
    } catch (historyError) {
      setError(historyError.message || 'Could not load search details.');
    }
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Search History</h1>
        <p>Review previous lead searches and the leads returned for each search.</p>
      </div>
      {error && <div className="history-error">{error}</div>}
      <div className="history-layout">
        <div className="history-panel">
          <div className="history-panel-title">
            <Clock size={18} />
            Previous Searches
          </div>
          {isLoading ? (
            <div className="history-empty"><Loader2 className="ls-spin" size={22} /> Loading history...</div>
          ) : history.length ? (
            <div className="history-list">
              {history.map((item) => (
                <button
                  key={item.id}
                  className={`history-row ${selectedSearch?.id === item.id ? 'history-row-active' : ''}`}
                  onClick={() => openSearch(item.id)}
                >
                  <span>{item.query_text}</span>
                  <small>
                    {item.city_area || 'Any area'} {item.pincode || ''} • {item.radius_km} km • {item.result_count} leads
                  </small>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="history-empty">No searches saved yet.</div>
          )}
        </div>
        <div className="history-panel history-detail">
          {selectedSearch ? (
            <>
              <div className="history-detail-head">
                <div>
                  <h2>{selectedSearch.query_text}</h2>
                  <p>
                    {selectedSearch.city_area || 'Any area'} {selectedSearch.pincode || ''} • {selectedSearch.radius_km} km • {selectedSearch.result_count} leads
                  </p>
                </div>
              </div>
              <div className="history-leads">
                {(selectedSearch.leads || []).map((lead) => (
                  <div className="history-lead-card" key={lead.id || lead.name}>
                    <div>
                      <h3>{lead.name}</h3>
                      <p><MapPin size={13} /> {lead.address || 'Address not available'}</p>
                    </div>
                    <div className="history-lead-meta">
                      <span>{lead.business_type || 'Business'}</span>
                      {lead.distance_km !== null && lead.distance_km !== undefined && <span>{lead.distance_km} km</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="history-empty">
              <Search size={34} />
              Select a search to view saved leads.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchHistory;
