import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Bot,
  Building2,
  ChevronDown,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import '../BusinessSearch.css';
import { API_BASE_URL, authHeaders } from '../auth';

const SEARCH_SOURCES = [
  { id: 'all',         label: 'All Sources',    icon: '🌐', color: '#3b82f6', desc: 'Search across all platforms' },
  { id: 'zomato',      label: 'Zomato',         icon: '🍽️', color: '#ef4444', desc: 'Restaurant listings and pages' },
  { id: 'swiggy',      label: 'Swiggy',         icon: '🍴', color: '#f97316', desc: 'Food and restaurant listings' },
  { id: 'exportersindia', label: 'ExportersIndia', icon: '🚢', color: '#0891b2', desc: 'Exporter and supplier listings' },
  { id: 'mouthshut',   label: 'MouthShut',      icon: '💬', color: '#64748b', desc: 'Reviews and business mentions' },
  { id: 'indiacom',    label: 'Indiacom',       icon: '📇', color: '#0ea5e9', desc: 'Indian business directory' },
  { id: 'clickindia',  label: 'ClickIndia',     icon: '📌', color: '#84cc16', desc: 'Classified and business listings' },
  { id: 'linkedin',    label: 'LinkedIn',       icon: '💼', color: '#0077b5', desc: 'Professional network' },
  { id: 'tofler',      label: 'Tofler',         icon: '🏛️', color: '#475569', desc: 'Company intelligence' },
  { id: 'zaubacorp',   label: 'Zauba Corp',     icon: '🏢', color: '#6366f1', desc: 'Company & director data' },
  { id: 'instagram',   label: 'Instagram',      icon: '📸', color: '#db2777', desc: 'Social business profiles' },
  { id: 'facebook',    label: 'Facebook',       icon: '👍', color: '#2563eb', desc: 'Social business pages' },
  { id: 'justdial',    label: 'JustDial',       icon: '📞', color: '#0ea5e9', desc: 'Local business directory' },
  { id: 'indiamart',   label: 'IndiaMart',      icon: '🏭', color: '#f59e0b', desc: 'B2B marketplace' },
  { id: 'tradeindia',  label: 'TradeIndia',     icon: '📦', color: '#10b981', desc: 'Import & export portal' },
  { id: 'sulekha',     label: 'Sulekha',        icon: '🔧', color: '#8b5cf6', desc: 'Local services platform' },
  { id: 'google_maps', label: 'Google Maps',    icon: '📍', color: '#ef4444', desc: 'Map-based business search' },
  { id: 'google_business', label: 'Google Business', icon: '🏪', color: '#16a34a', desc: 'Google business pages' },
  { id: 'startupindia', label: 'Startup India', icon: '🚀', color: '#9333ea', desc: 'Startup India profiles' },
  { id: 'mca',         label: 'MCA',            icon: '📜', color: '#334155', desc: 'Government company records' },
];

const POPULAR_SEARCHES = [
  'Software Companies in Bangalore',
  'Restaurant Suppliers in Delhi',
  'Textile Manufacturers in Surat',
  'IT Services near Kolkata',
  'Pharma Distributors in Mumbai',
  'Steel Dealers in Jamshedpur',
];

const BUSINESS_AI_WELCOME = {
  id: 'business-ai-welcome',
  role: 'assistant',
  content: 'Select a business result, then ask me for a summary, contacts, products, services, or source insights.',
};

const BusinessSearch = () => {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [radiusKm, setRadiusKm] = useState('25');
  const [selectedSource, setSelectedSource] = useState(SEARCH_SOURCES[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedResultIds, setSelectedResultIds] = useState(new Set());
  const [csvError, setCsvError] = useState('');
  const [aiMessages, setAiMessages] = useState([BUSINESS_AI_WELCOME]);
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const aiChatEndRef = useRef(null);
  const checkedResults = useMemo(
    () => results.filter((result) => selectedResultIds.has(result.id)),
    [results, selectedResultIds],
  );
  const allResultsChecked = results.length > 0 && checkedResults.length === results.length;
  const exportCount = checkedResults.length || results.length;

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSourceSelect = (source) => {
    setSelectedSource(source);
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [aiMessages, isAiThinking]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError('');
    setResults([]);
    setSources([]);
    setSelectedResult(null);
    setSelectedResultIds(new Set());
    setCsvError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/business-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          query: query.trim(),
          location: location.trim(),
          radius_km: Number(radiusKm),
          source: selectedSource.id,
          max_results: selectedSource.id === 'all' ? 60 : 24,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Business search failed.');
      }

      setResults(data.results || []);
      setSources(data.sources || []);
      setSelectedResult((data.results || [])[0] || null);
      setAiMessages([BUSINESS_AI_WELCOME]);
      setAiError('');
    } catch (err) {
      setError(err.message || 'Business search failed.');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePopularClick = (term) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  const toggleResultChecked = (resultId) => {
    setSelectedResultIds((current) => {
      const next = new Set(current);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  const toggleAllResultsChecked = () => {
    setSelectedResultIds(() => {
      if (allResultsChecked) return new Set();
      return new Set(results.map((result) => result.id));
    });
  };

  const exportBusinessCsv = async () => {
    if (!results.length) return;

    const resultsToExport = checkedResults.length ? checkedResults : results;
    const exportName = checkedResults.length ? 'Selected business search export' : 'All visible business search export';
    setCsvError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/csv-exports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          export_name: exportName,
          source: 'business_search',
          leads: resultsToExport,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save CSV export.');
    } catch (saveError) {
      setCsvError(saveError.message || 'Could not save CSV export.');
      return;
    }

    const headers = [
      'Name',
      'Phone',
      'Email',
      'Address',
      'Business Type',
      'Website',
      'Source',
      'Source URL',
      'Snippet',
    ];
    const rows = resultsToExport.map((result) => [
      result.name,
      result.phone,
      result.email,
      result.address,
      result.business_type,
      result.website,
      result.source_label || result.source,
      result.url,
      result.snippet || result.detail_description || '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = checkedResults.length ? 'nextgtools-selected-business-results.csv' : 'nextgtools-all-business-results.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const askBusinessAi = async (questionText = aiQuestion) => {
    const question = questionText.trim();
    if (!question || isAiThinking) return;

    const userMessage = {
      id: `business-user-${Date.now()}`,
      role: 'user',
      content: question,
      status: 'Seen',
    };
    setAiMessages((current) => [...current, userMessage]);
    setAiQuestion('');
    setAiError('');
    setIsAiThinking(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/business-ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          business: selectedResult,
          search_context: {
            query,
            location,
            radius_km: radiusKm,
            selected_source: selectedSource,
            sources,
            result_count: results.length,
          },
          history: aiMessages.filter((message) => message.role === 'user' || message.role === 'assistant'),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Business AI request failed.');
      setAiMessages((current) => [
        ...current,
        {
          id: `business-assistant-${Date.now()}`,
          role: 'assistant',
          content: data.answer,
        },
      ]);
    } catch (chatError) {
      setAiError(chatError.message || 'Something went wrong while asking Business AI.');
      setAiMessages((current) => [
        ...current,
        {
          id: `business-error-${Date.now()}`,
          role: 'assistant',
          content: 'I could not answer that yet. Check the error below and try again.',
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleBusinessAiSubmit = (event) => {
    event.preventDefault();
    askBusinessAi();
  };

  return (
    <div className="bs-page">

      {/* ── Hero Section ──────────────────────────────────── */}
      <div className="bs-hero">
        <div className="bs-hero-bg-orb bs-orb-1"></div>
        <div className="bs-hero-bg-orb bs-orb-2"></div>
        <div className="bs-hero-bg-orb bs-orb-3"></div>

        <div className="bs-hero-content">
          <div className="bs-hero-badge">
            <Sparkles size={14} />
            <span>Powered by AI</span>
          </div>
          <h1 className="bs-hero-title">
            Search <span className="bs-gradient-text">Businesses</span> Across India
          </h1>
          <p className="bs-hero-subtitle">
            Find companies, manufacturers, dealers & service providers from 
            JustDial, IndiaMart, Zauba Corp, Google Maps and more — all in one place.
          </p>
        </div>

        {/* ── Main Search Bar ──────────────────────────────── */}
        <form className="bs-search-container" onSubmit={handleSearch}>
          <div className="bs-source-row">
            <div className="bs-source-selector" ref={dropdownRef}>
              <button
                type="button"
                className="bs-source-trigger"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="bs-source-icon">{selectedSource.icon}</span>
                <span className="bs-source-label">{selectedSource.label}</span>
                <ChevronDown
                  size={14}
                  className={`bs-chevron ${dropdownOpen ? 'bs-chevron-open' : ''}`}
                />
              </button>

              {dropdownOpen && (
                <div className="bs-dropdown">
                  <div className="bs-dropdown-header">
                    <Filter size={14} />
                    <span>Select Search Source</span>
                  </div>
                  {SEARCH_SOURCES.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      className={`bs-dropdown-item ${selectedSource.id === source.id ? 'bs-dropdown-item-active' : ''}`}
                      onClick={() => handleSourceSelect(source)}
                    >
                      <span className="bs-dropdown-icon">{source.icon}</span>
                      <div className="bs-dropdown-text">
                        <span className="bs-dropdown-label">{source.label}</span>
                        <span className="bs-dropdown-desc">{source.desc}</span>
                      </div>
                      {selectedSource.id === source.id && (
                        <span className="bs-dropdown-check">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bs-search-bar bs-three-field-bar">

            {/* Query Input */}
            <div className="bs-input-wrap">
              <Search size={18} className="bs-input-icon" />
              <input
                ref={inputRef}
                type="text"
                className="bs-input"
                placeholder="Search businesses, products, services"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                id="business-search-input"
              />
              {query && (
                <button
                  type="button"
                  className="bs-clear-btn"
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="bs-divider"></div>

            {/* Location Input */}
            <div className="bs-location-wrap">
              <MapPin size={16} className="bs-location-icon" />
              <input
                type="text"
                className="bs-location-input"
                placeholder="Area or pincode"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                id="business-location-input"
              />
            </div>

            <div className="bs-divider"></div>

            <div className="bs-radius-wrap">
              <select
                value={radiusKm}
                onChange={(event) => setRadiusKm(event.target.value)}
                aria-label="Search radius"
              >
                <option value="5">5 km radius</option>
                <option value="10">10 km radius</option>
                <option value="25">25 km radius</option>
                <option value="50">50 km radius</option>
              </select>
            </div>

            {/* Search Button */}
            <button
              type="submit"
              className={`bs-search-btn ${isSearching ? 'bs-searching' : ''}`}
              disabled={isSearching}
              id="business-search-submit"
            >
              {isSearching ? (
                <span className="bs-spinner"></span>
              ) : (
                <Search size={18} />
              )}
              <span>{isSearching ? 'Searching...' : 'Search'}</span>
            </button>
          </div>
        </form>

        {/* ── Popular Searches ─────────────────────────────── */}
        <div className="bs-popular">
          <span className="bs-popular-label">Popular:</span>
          <div className="bs-popular-tags">
            {POPULAR_SEARCHES.map((term) => (
              <button
                key={term}
                className="bs-popular-tag"
                onClick={() => handlePopularClick(term)}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty State / Results ─────────────────────────── */}
      <div className="bs-results-section">
        <div className="bs-results-header">
          <div>
            <h2>
              <Building2 size={20} />
              Business Results
            </h2>
            <p>
              {results.length
                ? `${results.length} scraped result${results.length === 1 ? '' : 's'} found`
                : 'Search results from selected business sources will appear here.'}
            </p>
          </div>
          {sources.length > 0 && (
            <div className="bs-source-status-row">
              {sources.map((source) => (
                <a
                  key={source.source}
                  className={`bs-source-status ${source.error ? 'bs-source-status-warn' : ''}`}
                  href={source.search_url || undefined}
                  target="_blank"
                  rel="noreferrer"
                  title={source.error || `${source.count} results`}
                >
                  <span>{source.label}</span>
                  <strong>{source.count}</strong>
                </a>
              ))}
            </div>
          )}
          {results.length > 0 && (
            <div className="bs-export-actions">
              <label className="bs-select-all">
                <input
                  type="checkbox"
                  checked={allResultsChecked}
                  onChange={toggleAllResultsChecked}
                />
                <span>{allResultsChecked ? 'Unselect all' : 'Select all'}</span>
              </label>
              <button type="button" className="bs-export-btn" onClick={exportBusinessCsv}>
                <Download size={15} />
                Export CSV ({exportCount})
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bs-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {csvError && (
          <div className="bs-error">
            <AlertCircle size={18} />
            <span>{csvError}</span>
          </div>
        )}

        {isSearching && (
          <div className="bs-loading-state">
            <span className="bs-spinner bs-spinner-blue"></span>
            <p>Searching selected sources and scraping available result pages...</p>
          </div>
        )}

        {!isSearching && !results.length && !error && (
          <div className="bs-empty-state">
            <div className="bs-empty-icon-wrap">
              <Building2 size={48} className="bs-empty-icon" />
            </div>
            <h3>Start your business search</h3>
            <p>
              Enter a business name, product, or service above and select a source to begin.
              Results will appear here with scraped company information.
            </p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="bs-results-layout">
            <div className="bs-results-list">
              {results.map((result) => (
                <div
                  key={result.id}
                  role="button"
                  tabIndex={0}
                  className={`bs-result-card ${selectedResult?.id === result.id ? 'bs-result-card-active' : ''} ${selectedResultIds.has(result.id) ? 'bs-result-card-checked' : ''}`}
                  onClick={() => setSelectedResult(result)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedResult(result);
                  }}
                >
                  <input
                    type="checkbox"
                    className="bs-result-checkbox"
                    checked={selectedResultIds.has(result.id)}
                    onChange={() => toggleResultChecked(result.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select ${result.name} for CSV export`}
                  />
                  <div className="bs-result-top">
                    <span className="bs-result-source">{result.source_label}</span>
                    {result.rating && <span className="bs-result-rating">{result.rating}</span>}
                  </div>
                  <h3>{result.name}</h3>
                  <p>{result.snippet || result.address || result.business_type || 'Scraped business listing'}</p>
                  <div className="bs-result-meta">
                    {result.phone && (
                      <span>
                        <Phone size={13} />
                        {result.phone}
                      </span>
                    )}
                    {result.email && (
                      <span>
                        <Mail size={13} />
                        {result.email}
                      </span>
                    )}
                    {result.address && (
                      <span>
                        <MapPin size={13} />
                        {result.address}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bs-result-detail">
              {selectedResult ? (
                <>
                  <div className="bs-detail-head">
                    <div>
                      <span>{selectedResult.source_label}</span>
                      <h3>{selectedResult.name}</h3>
                    </div>
                    {selectedResult.url && (
                      <a href={selectedResult.url} target="_blank" rel="noreferrer" className="bs-open-link">
                        <ExternalLink size={16} />
                        Open
                      </a>
                    )}
                  </div>

                  <div className="bs-detail-grid">
                    <div>
                      <span>Business Type</span>
                      <strong>{selectedResult.business_type || 'Not found'}</strong>
                    </div>
                    <div>
                      <span>Phone</span>
                      <strong>{selectedResult.phone || 'Not found'}</strong>
                    </div>
                    <div>
                      <span>Email</span>
                      <strong>{selectedResult.email || 'Not found'}</strong>
                    </div>
                    <div>
                      <span>Website</span>
                      <strong>{selectedResult.website || 'Not found'}</strong>
                    </div>
                  </div>

                  {selectedResult.address && (
                    <div className="bs-detail-block">
                      <span>Address</span>
                      <p>{selectedResult.address}</p>
                    </div>
                  )}

                  <div className="bs-detail-block">
                    <span>Scraped Information</span>
                    <p>
                      {selectedResult.detail_text ||
                        selectedResult.detail_description ||
                        selectedResult.snippet ||
                        'No extra page text was available from this source.'}
                    </p>
                  </div>

                  {selectedResult.external_links?.length > 0 && (
                    <div className="bs-detail-block">
                      <span>External Links Found</span>
                      <div className="bs-link-list">
                        {selectedResult.external_links.slice(0, 5).map((link) => (
                          <a key={link} href={link} target="_blank" rel="noreferrer">
                            {link}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bs-ai-panel">
                    <div className="bs-ai-head">
                      <div className="bs-ai-title">
                        <div className="bs-ai-icon">
                          <Bot size={18} />
                        </div>
                        <div>
                          <h4>Business AI</h4>
                          <p>Ask about this selected source result.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="bs-ai-clear"
                        onClick={() => {
                          setAiMessages([BUSINESS_AI_WELCOME]);
                          setAiError('');
                        }}
                      >
                        Clear
                      </button>
                    </div>

                    <div className="bs-ai-chat">
                      {aiMessages.map((message, index) => (
                        <div
                          key={message.id || `${message.role}-${index}`}
                          className={`bs-ai-message ${message.role === 'user' ? 'bs-ai-message-user' : ''}`}
                        >
                          {message.role === 'assistant' && (
                            <div className="bs-ai-avatar">
                              <Bot size={16} />
                            </div>
                          )}
                          <div className="bs-ai-bubble">
                            <p>{message.content}</p>
                            <span>{message.role === 'user' ? message.status || 'Seen' : 'Business AI'}</span>
                          </div>
                        </div>
                      ))}
                      {isAiThinking && (
                        <div className="bs-ai-message">
                          <div className="bs-ai-avatar">
                            <Bot size={16} />
                          </div>
                          <div className="bs-ai-bubble bs-ai-typing">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                      )}
                      <div ref={aiChatEndRef} />
                    </div>

                    <div className="bs-ai-bottom">
                      {aiError && (
                        <div className="bs-ai-error">
                          <AlertCircle size={14} />
                          {aiError}
                        </div>
                      )}
                      <div className="bs-ai-suggestions">
                        {['Business summary', 'Show contacts only', 'What services do they offer?', 'Is this a good lead?'].map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion}
                            onClick={() => askBusinessAi(suggestion)}
                            disabled={isAiThinking}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                      <form className="bs-ai-form" onSubmit={handleBusinessAiSubmit}>
                        <input
                          type="text"
                          value={aiQuestion}
                          onChange={(event) => setAiQuestion(event.target.value)}
                          placeholder="Ask Business AI anything..."
                        />
                        <button type="submit" disabled={isAiThinking || !aiQuestion.trim()}>
                          {isAiThinking ? <Loader2 size={16} className="bs-spin" /> : <Send size={16} />}
                          Send
                        </button>
                      </form>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bs-detail-empty">Select a result to view scraped details.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessSearch;
