import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Bot,
  Building2,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  X,
} from 'lucide-react';
import '../BusinessSearch.css';
import { API_BASE_URL, authHeaders } from '../auth';

const SEARCH_SOURCES = [
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
  { id: 'facebook',    label: 'Facebook',       icon: '👍', color: '#f97316', desc: 'Social business pages' },
  { id: 'justdial',    label: 'JustDial',       icon: '📞', color: '#0ea5e9', desc: 'Local business directory' },
  { id: 'indiamart',   label: 'IndiaMart',      icon: '🏭', color: '#f59e0b', desc: 'B2B marketplace' },
  { id: 'tradeindia',  label: 'TradeIndia',     icon: '📦', color: '#10b981', desc: 'Import & export portal' },
  { id: 'sulekha',     label: 'Sulekha',        icon: '🔧', color: '#8b5cf6', desc: 'Local services platform' },
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
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState(new Set(['justdial']));
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedResultIds, setSelectedResultIds] = useState(new Set());
  const [csvError, setCsvError] = useState('');
  const [isSourceScraping, setIsSourceScraping] = useState(false);
  const [sourceScrapeError, setSourceScrapeError] = useState('');
  const [aiMessages, setAiMessages] = useState([BUSINESS_AI_WELCOME]);
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const inputRef = useRef(null);
  const sourcePickerRef = useRef(null);
  const aiChatEndRef = useRef(null);
  const checkedResults = useMemo(
    () => results.filter((result) => selectedResultIds.has(result.id)),
    [results, selectedResultIds],
  );
  const allResultsChecked = results.length > 0 && checkedResults.length === results.length;
  const exportCount = checkedResults.length || results.length;
  const selectedSources = SEARCH_SOURCES.filter((source) => selectedSourceIds.has(source.id));
  const sourceSummary = selectedSources.length === SEARCH_SOURCES.length
    ? 'All sources'
    : selectedSources.length === 1
      ? selectedSources[0].label
      : `${selectedSources.length} sources`;

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [aiMessages, isAiThinking]);

  useEffect(() => {
    const closeSourcePicker = (event) => {
      const picker = sourcePickerRef.current;
      if (!picker?.open) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        picker.open = false;
        return;
      }
      if (event.type === 'pointerdown' && !picker.contains(event.target)) {
        picker.open = false;
      }
    };

    document.addEventListener('pointerdown', closeSourcePicker);
    document.addEventListener('keydown', closeSourcePicker);
    return () => {
      document.removeEventListener('pointerdown', closeSourcePicker);
      document.removeEventListener('keydown', closeSourcePicker);
    };
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!selectedSourceIds.size) {
      setError('Select at least one source to search.');
      return;
    }
    if (sourcePickerRef.current) sourcePickerRef.current.open = false;
    setIsSearching(true);
    setError('');
    setResults([]);
    setSources([]);
    setSelectedResult(null);
    setSelectedResultIds(new Set());
    setCsvError('');
    setSourceScrapeError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/business-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          query: query.trim(),
          sources: [...selectedSourceIds],
          max_results: selectedSourceIds.size > 1 ? 60 : 24,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Business search failed.');
      }

      setResults(data.results || []);
      setSources(data.sources || []);
      setLastSearchQuery(query.trim());
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

  const scrapeSelectedSource = async () => {
    if (!selectedResult?.url || selectedResult.lookup_only || isSourceScraping) return;

    setIsSourceScraping(true);
    setSourceScrapeError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          url: selectedResult.url,
          max_pages: 3,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not scrape this source page.');

      const enrichedResult = {
        ...selectedResult,
        source_scrape: data,
      };
      setSelectedResult(enrichedResult);
      setResults((current) => current.map(
        (result) => result.id === enrichedResult.id ? enrichedResult : result,
      ));
      setAiMessages((current) => [
        ...current,
        {
          id: `source-scrape-${Date.now()}`,
          role: 'assistant',
          content: `${selectedResult.source_label || 'Source'} scrape loaded: ${data.pages_scraped || 0} pages, ${data.emails?.length || 0} emails, and ${data.phones?.length || 0} phone numbers. You can now ask me about this scraped information.`,
        },
      ]);
    } catch (scrapeError) {
      setSourceScrapeError(scrapeError.message || 'Could not scrape this source page.');
    } finally {
      setIsSourceScraping(false);
    }
  };

  const exportBusinessCsv = async () => {
    if (!results.length) return;

    const resultsToExport = checkedResults.length ? checkedResults : results;
    const exportName = lastSearchQuery || query.trim() || 'Business search export';
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
    const safeExportName = exportName.replace(/[\\/:*?"<>|]+/g, '-');
    link.download = `${safeExportName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleSearchSource = (sourceId) => {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const toggleAllSources = () => {
    setSelectedSourceIds((current) => (
      current.size === SEARCH_SOURCES.length
        ? new Set()
        : new Set(SEARCH_SOURCES.map((source) => source.id))
    ));
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
            selected_sources: selectedSources,
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
        <div className="bs-hero-content">
          <h1 className="bs-hero-title">Business Search</h1>
          <p className="bs-hero-subtitle">
            Find companies, products, and services across all connected business sources.
          </p>
        </div>

        {/* ── Main Search Bar ──────────────────────────────── */}
        <form className="bs-search-container" onSubmit={handleSearch}>
          <div className="bs-search-bar bs-query-bar">

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

            <details className="bs-source-picker" ref={sourcePickerRef}>
              <summary>
                <span>{sourceSummary}</span>
                <ChevronDown size={15} />
              </summary>
              <div className="bs-source-menu">
                <label className="bs-source-option bs-source-option-all">
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.size === SEARCH_SOURCES.length}
                    onChange={toggleAllSources}
                  />
                  <span>All sources</span>
                </label>
                {SEARCH_SOURCES.map((source) => (
                  <label className="bs-source-option" key={source.id}>
                    <input
                      type="checkbox"
                      checked={selectedSourceIds.has(source.id)}
                      onChange={() => toggleSearchSource(source.id)}
                    />
                    <span className="bs-source-option-icon">{source.icon}</span>
                    <span>
                      <strong>{source.label}</strong>
                      <small>{source.desc}</small>
                    </span>
                  </label>
                ))}
                <button
                  type="button"
                  className="bs-source-done"
                  onClick={() => { sourcePickerRef.current.open = false; }}
                >
                  Done
                </button>
              </div>
            </details>

            {/* Search Button */}
            <button
              type="submit"
              className={`bs-search-btn ${isSearching ? 'bs-searching' : ''}`}
              disabled={isSearching || !selectedSourceIds.size}
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
                  onClick={() => {
                    setSelectedResult(result);
                    setSourceScrapeError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setSelectedResult(result);
                      setSourceScrapeError('');
                    }
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
                    <div className="bs-detail-actions">
                      {selectedResult.url && !selectedResult.lookup_only && (
                        <button
                          type="button"
                          className="bs-scrape-source-btn"
                          onClick={scrapeSelectedSource}
                          disabled={isSourceScraping}
                        >
                          {isSourceScraping
                            ? <Loader2 size={16} className="bs-spin" />
                            : <Search size={16} />}
                          {isSourceScraping
                            ? 'Scraping...'
                            : `Scrape ${selectedResult.source_label || 'source'}`}
                        </button>
                      )}
                      {selectedResult.url && (
                        <a href={selectedResult.url} target="_blank" rel="noreferrer" className="bs-open-link">
                          <ExternalLink size={16} />
                          Open
                        </a>
                      )}
                    </div>
                  </div>

                  {selectedResult.lookup_only && (
                    <div className="bs-source-scrape-note">
                      This is a source search link, not a specific company page. Open it and select a company result first.
                    </div>
                  )}

                  {sourceScrapeError && (
                    <div className="bs-error bs-source-scrape-error">
                      <AlertCircle size={15} />
                      {sourceScrapeError}
                    </div>
                  )}

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

                  {selectedResult.source_scrape && (
                    <div className="bs-detail-block bs-source-scrape-result">
                      <span>{selectedResult.source_label} Source Scrape</span>
                      <div className="bs-scrape-stats">
                        <strong>{selectedResult.source_scrape.pages_scraped || 0} pages</strong>
                        <strong>{selectedResult.source_scrape.emails?.length || 0} emails</strong>
                        <strong>{selectedResult.source_scrape.phones?.length || 0} phones</strong>
                      </div>
                      <p>
                        {selectedResult.source_scrape.pages?.[0]?.description ||
                          selectedResult.source_scrape.pages?.[0]?.text?.slice(0, 1200) ||
                          'The source page was reached, but no readable text was returned.'}
                      </p>
                      {selectedResult.source_scrape.emails?.length > 0 && (
                        <p><strong>Emails:</strong> {selectedResult.source_scrape.emails.join(', ')}</p>
                      )}
                      {selectedResult.source_scrape.phones?.length > 0 && (
                        <p><strong>Phones:</strong> {selectedResult.source_scrape.phones.join(', ')}</p>
                      )}
                    </div>
                  )}

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
                        {[
                          ...(selectedResult.source_scrape ? ['Summarize scraped source'] : []),
                          'Business summary',
                          'Show contacts only',
                          'What services do they offer?',
                          'Is this a good lead?',
                        ].map((suggestion) => (
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
