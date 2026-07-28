import React, { useEffect, useState } from 'react';
import { Clock, ExternalLink, Loader2, MapPin, Search } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './SearchHistory.css';

const BusinessSearchHistory = () => {
  const [history, setHistory] = useState([]);
  const [selectedSearch, setSelectedSearch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/business-search/history`, {
          headers: authHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load business search history.');
        setHistory(data.history || []);
      } catch (historyError) {
        setError(historyError.message || 'Could not load business search history.');
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, []);

  const openSearch = async (searchId) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/business-search/history/${searchId}`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load business search details.');
      setSelectedSearch(data.search);
    } catch (historyError) {
      setError(historyError.message || 'Could not load business search details.');
    }
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Business Search History</h1>
        <p>Review saved Business Search queries and every result stored in the database.</p>
      </div>
      {error && <div className="history-error">{error}</div>}
      <div className="history-layout">
        <div className="history-panel">
          <div className="history-panel-title">
            <Clock size={18} />
            Previous Business Searches
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
                    {item.location || 'Any location'} • {item.source} • {item.result_count} results
                  </small>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="history-empty">No business searches saved yet.</div>
          )}
        </div>

        <div className="history-panel history-detail">
          {selectedSearch ? (
            <>
              <div className="history-detail-head">
                <div>
                  <h2>{selectedSearch.query_text}</h2>
                  <p>
                    {selectedSearch.location || 'Any location'} • {selectedSearch.source} • {selectedSearch.result_count} results
                  </p>
                </div>
              </div>
              <div className="history-leads">
                {(selectedSearch.results || []).map((result) => (
                  <div className="history-lead-card" key={result.id || result.url || result.name}>
                    <div>
                      <h3>{result.name}</h3>
                      <p><MapPin size={13} /> {result.address || result.snippet || 'Details not available'}</p>
                      {result.url && (
                        <a href={result.url} target="_blank" rel="noreferrer" className="history-link">
                          <ExternalLink size={13} /> Open source page
                        </a>
                      )}
                    </div>
                    <div className="history-lead-meta">
                      <span>{result.source_label || result.source || 'Source'}</span>
                      {result.phone && <span>{result.phone}</span>}
                      {result.email && <span>{result.email}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="history-empty">
              <Search size={34} />
              Select a business search to view saved results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusinessSearchHistory;
