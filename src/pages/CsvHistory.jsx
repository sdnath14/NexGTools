import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './CsvHistory.css';

const LEAD_COLUMNS = [
  { key: 'name', label: 'Name' },
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
    .map((row) => row.map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
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

const CsvHistory = ({ type = 'lead_search' }) => {
  const isBusiness = type === 'business_search';
  const columns = isBusiness ? BUSINESS_COLUMNS : LEAD_COLUMNS;
  const recordLabel = isBusiness ? 'results' : 'leads';
  const [exportsList, setExportsList] = useState([]);
  const [selectedExport, setSelectedExport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadExports = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/csv-exports?source=${encodeURIComponent(type)}`, {
          headers: authHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load CSV history.');
        setExportsList(data.exports || []);
      } catch (historyError) {
        setError(historyError.message || 'Could not load CSV history.');
      } finally {
        setIsLoading(false);
      }
    };
    loadExports();
  }, [type]);

  const openExport = async (exportId) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/csv-exports/${exportId}`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load export.');
      setSelectedExport(data.export);
    } catch (historyError) {
      setError(historyError.message || 'Could not load export.');
    }
  };

  return (
    <div className="csv-page">
      <div className="csv-header">
        <div>
          <h1>{isBusiness ? 'Business CSV History' : 'Lead CSV History'}</h1>
          <p>CSV exports from {isBusiness ? 'Business Search' : 'Lead Search'} are stored separately here.</p>
        </div>
      </div>
      {error && <div className="csv-error">{error}</div>}
      <div className="csv-layout">
        <div className="csv-panel">
          <div className="csv-panel-title">
            <FileSpreadsheet size={18} />
            Stored CSV Records
          </div>
          {isLoading ? (
            <div className="csv-empty"><Loader2 className="ls-spin" size={22} /> Loading exports...</div>
          ) : exportsList.length ? (
            <div className="csv-list">
              {exportsList.map((item) => (
                <button
                  key={item.id}
                  className={`csv-row ${selectedExport?.id === item.id ? 'csv-row-active' : ''}`}
                  onClick={() => openExport(item.id)}
                >
                  <span>{item.export_name}</span>
                  <small>{item.row_count} {recordLabel} • {new Date(item.created_at).toLocaleString()}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="csv-empty">No CSV exports saved yet.</div>
          )}
        </div>
        <div className="csv-panel csv-detail">
          {selectedExport ? (
            <>
              <div className="csv-detail-head">
                <div>
                  <h2>{selectedExport.export_name}</h2>
                  <p>{selectedExport.row_count} saved {recordLabel}</p>
                </div>
                <button onClick={() => downloadCsv(selectedExport.export_name, selectedExport.leads || [], columns)}>
                  <Download size={16} />
                  Download
                </button>
              </div>
              <div className="csv-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedExport.leads || []).map((lead, index) => (
                      <tr key={`${lead.id || lead.name}-${index}`}>
                        {columns.map((column) => (
                          <td key={column.key}>{formatCell(lead, column.key, column.fallbackKey)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="csv-empty">Select a saved CSV export to view records.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CsvHistory;
