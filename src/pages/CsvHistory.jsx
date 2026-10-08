import React, { useEffect, useRef, useState } from 'react';
import { Clock, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './CsvHistory.css';
import { useSearchParams } from 'react-router-dom';

const LEAD_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Company Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'business_type', label: 'Business Type' },
  { key: 'website', label: 'Website' },
  { key: 'google_maps_url', label: 'Google Maps URL' },
  { key: 'rating', label: 'Rating' },
  { key: 'distance_km', label: 'Distance KM' },
  { key: 'status', label: 'Status' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'id', label: 'Place ID' },
];

const BUSINESS_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'business_type', label: 'Business Type' },
  { key: 'website', label: 'Website' },
  { key: 'source_label', fallbackKey: 'source', label: 'Source' },
  { key: 'url', label: 'Source URL' },
  { key: 'snippet', fallbackKey: 'detail_description', label: 'Snippet' },
];

const formatCell = (lead, key, fallbackKey) => {
  const value = lead[key];
  if (value === null || value === undefined || value === '') {
    return fallbackKey ? lead[fallbackKey] || '' : '';
  }
  return value;
};

const csvFromLeads = (leads, columns) => {
  const headers = columns.map((column) => column.label);
  const rows = leads.map((lead) => columns.map(
    (column) => formatCell(lead, column.key, column.fallbackKey),
  ));
  return [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');
};

const downloadCsv = (name, leads, columns) => {
  const blob = new Blob([csvFromLeads(leads, columns)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name || 'nexgtools-leads'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const CsvHistory = ({ type = 'lead_search', canViewExports = true, canViewSearchHistory = false }) => {
  const isBusiness = type === 'business_search';
  const [params, setParams] = useSearchParams();
  const filter = params.get('view') || 'all';
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const detailRequest = useRef(0);
  const columns = selectedRecord?.source === 'business_search' ? BUSINESS_COLUMNS : LEAD_COLUMNS;

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    setSelectedRecord(null);
    detailRequest.current += 1;
    setDetailLoading(false);
    const requests = [
      ...(canViewExports ? [{ kind: 'csv', endpoint: `/api/csv-exports${isBusiness ? '?source=business_search' : ''}`, field: 'exports' }] : []),
      ...(!isBusiness && canViewSearchHistory ? [{ kind: 'search', endpoint: '/api/search-history', field: 'history' }] : []),
    ];
    Promise.allSettled(requests.map(async ({ kind, endpoint, field }) => {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: authHeaders(), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load history.');
      return (data[field] || []).map((item) => ({ ...item, kind, key: `${kind}-${item.id}`, name: kind === 'csv' ? item.export_name : item.query_text, count: kind === 'csv' ? item.row_count : item.result_count }));
    })).then((results) => {
      if (controller.signal.aborted) return;
      setRecords(results.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setError(results.filter((result) => result.status === 'rejected').map((result) => result.reason.message).join(' '));
      setIsLoading(false);
    });
    return () => { controller.abort(); detailRequest.current += 1; };
  }, [isBusiness, canViewExports, canViewSearchHistory]);

  const openRecord = async (record) => {
    const request = ++detailRequest.current;
    setSelectedRecord(null);
    setDetailLoading(true);
    setError('');
    try {
      const endpoint = record.kind === 'csv' ? 'csv-exports' : 'search-history';
      const response = await fetch(`${API_BASE_URL}/api/${endpoint}/${record.id}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not open saved records.');
      if (request === detailRequest.current) setSelectedRecord({ ...record, ...(record.kind === 'csv' ? data.export : data.search) });
    } catch (historyError) {
      if (request === detailRequest.current) setError(historyError.message || 'Could not open saved records.');
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  };
  const filteredRecords = records.filter((record) => filter === 'all' || (filter === 'csvs' ? record.kind === 'csv' : filter === 'searches' ? record.kind === 'search' : true));
  const setFilter = (view) => { const next = new URLSearchParams(params); next.set('view', view); setParams(next, { replace: true }); };

  return <div className="csv-page">
    <div className="csv-header"><h1>{isBusiness ? 'Business CSV History' : 'Lead CSV History'}</h1><p>{isBusiness ? 'Review and download your saved Business Search CSVs.' : 'All saved CSV records and previous lead searches, together in one place.'}</p></div>
    {error && <div className="csv-error" role="alert">{error}</div>}
    {!isBusiness && <div className="csv-history-filters" aria-label="History filters">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All records ({records.length})</button>
      {canViewExports && <button type="button" aria-pressed={filter === 'csvs'} onClick={() => setFilter('csvs')}><FileSpreadsheet size={15} /> Saved CSVs ({records.filter((item) => item.kind === 'csv').length})</button>}
      {canViewSearchHistory && <button type="button" aria-pressed={filter === 'searches'} onClick={() => setFilter('searches')}><Clock size={15} /> Lead searches ({records.filter((item) => item.kind === 'search').length})</button>}
    </div>}
    <div className="csv-layout">
      <div className="csv-panel"><div className="csv-panel-title"><FileSpreadsheet size={18} /> Saved records</div>
        {isLoading ? <div className="csv-empty"><Loader2 className="ls-spin" size={22} /> Loading history...</div> : filteredRecords.length ? <div className="csv-list">{filteredRecords.map((item) => <button type="button" key={item.key} className={`csv-row ${selectedRecord?.key === item.key ? 'csv-row-active' : ''}`} onClick={() => openRecord(item)}>
          <span>{item.name}</span><small>{item.kind === 'search' ? 'Lead search' : item.source === 'business_search' ? 'Business CSV' : 'Lead CSV'} &bull; {item.count} leads</small>
          {item.kind === 'search' && <small>{item.city_area || 'Any area'} {item.pincode || ''} &bull; {item.radius_km} km</small>}
          <small>{new Date(item.created_at).toLocaleString()}</small>
        </button>)}</div> : <div className="csv-empty">No saved records in this view yet.</div>}
      </div>
      <div className="csv-panel csv-detail">{detailLoading ? <div className="csv-empty"><Loader2 className="ls-spin" size={22} /> Loading records...</div> : selectedRecord ? <>
        <div className="csv-detail-head"><div><h2>{selectedRecord.name}</h2><p>{selectedRecord.count} saved leads{selectedRecord.kind === 'search' ? ` in ${selectedRecord.city_area || 'any area'}` : ''}</p></div><button type="button" onClick={() => downloadCsv(selectedRecord.name, selectedRecord.leads || [], columns)}><Download size={16} /> Download CSV</button></div>
        <div className="csv-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{(selectedRecord.leads || []).map((lead, index) => <tr key={`${lead.id || lead.name}-${index}`}>{columns.map((column) => <td key={column.key}>{formatCell(lead, column.key, column.fallbackKey)}</td>)}</tr>)}</tbody></table>{!selectedRecord.leads?.length && <div className="csv-empty">This record has no saved leads.</div>}</div>
      </> : <div className="csv-empty">Select a saved CSV or lead search to view and download its records.</div>}</div>
    </div>
  </div>;
};

export default CsvHistory;
