import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bot, Building2, Download, ExternalLink, FileJson, Globe, Loader2, Mail, MapPin, Phone, Search, Send, Share2, Star, X } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import '../LeadSearch.css';

const AI_WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content: 'Search or select a lead, scrape its website, then ask me about the company here.',
};

const SPELLING_WORDS = [
  'accountant', 'agency', 'architect', 'automobile', 'bakery', 'bank', 'beauty', 'boutique', 'builder', 'cafe',
  'caterer', 'chemist', 'clinic', 'coaching', 'college', 'consultant', 'contractor', 'courier', 'dentist',
  'developer', 'diagnostic', 'distributor', 'doctor', 'electrician', 'electronics', 'engineer', 'exporter',
  'factory', 'finance', 'furniture', 'garage', 'grocery', 'gym', 'hardware', 'hospital', 'hotel', 'importer',
  'institute', 'insurance', 'interior', 'jewellery', 'laboratory', 'laundry', 'lawyer', 'logistics', 'manufacturer',
  'marketing', 'medical', 'mobile', 'pharmacy', 'printing', 'real', 'repair', 'restaurant', 'retail', 'salon',
  'school', 'security', 'service', 'software', 'stationery', 'supplier', 'textile', 'tour', 'training', 'transport',
  'travel', 'wholesale', 'agency', 'services', 'solutions', 'technologies', 'enterprise', 'company', 'business',
  'kolkata', 'salt', 'lake', 'delhi', 'mumbai', 'pune', 'chennai', 'bengaluru', 'bangalore', 'hyderabad', 'ahmedabad',
  'jaipur', 'lucknow', 'noida', 'gurgaon', 'gurugram', 'surat', 'indore', 'patna', 'bhubaneswar', 'guwahati',
];

const BUSINESS_SUGGESTIONS = [
  'restaurant', 'garage', 'car repair', 'automobile service', 'petrol pump', 'software company', 'clinic', 'hospital',
  'pharmacy', 'hotel', 'bakery', 'cafe', 'salon', 'gym', 'hardware shop', 'electronics shop', 'furniture store',
  'real estate agency', 'travel agency', 'courier service', 'logistics company', 'manufacturer', 'distributor',
  'wholesale supplier', 'school', 'coaching institute', 'printing service', 'diagnostic center', 'insurance agency',
];

const LOCATION_SUGGESTIONS = [
  'Kolkata', 'Salt Lake', 'Madhyamgram', 'Dum Dum', 'Howrah', 'New Town', 'Park Street', 'Ballygunge', 'Behala',
  'Barasat', 'Siliguri', 'Durgapur', 'Delhi', 'Noida', 'Gurugram', 'Mumbai', 'Pune', 'Bengaluru', 'Hyderabad',
  'Chennai', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow', 'Patna', 'Bhubaneswar', 'Guwahati',
];

const AI_PROMPT_SUGGESTIONS = [
  'Show only phone numbers',
  'Show email addresses',
  'What products do they offer?',
  'Company summary',
  'Write a short outreach message',
  'Find decision maker details',
];

const EMAIL_MESSAGE_SUGGESTIONS = [
  'Please share a convenient time for a quick call.',
  'We would like to discuss a potential business opportunity.',
  'Can we schedule a 10-minute discovery call this week?',
  'Please let us know who handles vendor partnerships.',
];

const COMMON_SPELLING_FIXES = {
  restorant: 'restaurant',
  restarant: 'restaurant',
  resturant: 'restaurant',
  restarunt: 'restaurant',
  restraunt: 'restaurant',
  restaurent: 'restaurant',
  sofware: 'software',
  softwere: 'software',
  softwar: 'software',
  clinik: 'clinic',
  farmacy: 'pharmacy',
  pharmcy: 'pharmacy',
  hospial: 'hospital',
  hospitle: 'hospital',
  hotal: 'hotel',
  jewellary: 'jewellery',
  jwellery: 'jewellery',
  manufacter: 'manufacturer',
  manufactur: 'manufacturer',
  supllier: 'supplier',
  suplier: 'supplier',
  wholsale: 'wholesale',
  kolkota: 'kolkata',
  calcutta: 'kolkata',
  banglore: 'bangalore',
  gurgaon: 'gurugram',
};

const editDistance = (left, right) => {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = left[row - 1] === right[column - 1]
        ? rows[row - 1][column - 1]
        : Math.min(rows[row - 1][column - 1], rows[row][column - 1], rows[row - 1][column]) + 1;
    }
  }
  return rows[left.length][right.length];
};

const correctionForWord = (word) => {
  const normalized = word.toLowerCase();
  if (normalized.length < 4 || /^\d+$/.test(normalized)) return word;
  if (COMMON_SPELLING_FIXES[normalized]) return COMMON_SPELLING_FIXES[normalized];
  if (SPELLING_WORDS.includes(normalized)) return word;
  let best = null;
  for (const candidate of SPELLING_WORDS) {
    if (Math.abs(candidate.length - normalized.length) > 2) continue;
    const distance = editDistance(normalized, candidate);
    const limit = normalized.length <= 5 ? 1 : 2;
    if (distance <= limit && (!best || distance < best.distance)) best = { candidate, distance };
  }
  return best?.candidate || word;
};

const correctSearchPhrase = (value) => value.replace(/[A-Za-z]+/g, correctionForWord);
const spellingSuggestionFor = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const corrected = correctSearchPhrase(trimmed);
  return corrected.toLowerCase() === trimmed.toLowerCase() ? null : corrected;
};

const textSuggestionsFor = (value, options, limit = 5) => {
  const normalized = value.trim().toLowerCase();
  const matches = options.filter((option) => {
    const optionText = option.toLowerCase();
    if (!normalized) return true;
    if (optionText === normalized) return false;
    return optionText.startsWith(normalized) || optionText.includes(normalized);
  });
  return [...new Set(matches)].slice(0, limit);
};

const LeadSearch = () => {
  const [form, setForm] = useState({
    companyName: '',
    pincode: '',
    cityArea: '',
    radiusKm: '10',
    businessType: '',
  });
  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [minimumRating, setMinimumRating] = useState('all');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [csvError, setCsvError] = useState('');
  const [lastSearchCriteria, setLastSearchCriteria] = useState(null);
  const [scraperUrl, setScraperUrl] = useState('');
  const [scraperMaxPages, setScraperMaxPages] = useState('10');
  const [scrapeResult, setScrapeResult] = useState(null);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  const [aiMessages, setAiMessages] = useState([AI_WELCOME_MESSAGE]);
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const [socialProfiles, setSocialProfiles] = useState([]);
  const [socialSearchResults, setSocialSearchResults] = useState([]);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState('');
  const [hasSearchedSocials, setHasSearchedSocials] = useState(false);
  const [socialSearchQuery, setSocialSearchQuery] = useState('');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [activeSuggestionField, setActiveSuggestionField] = useState('');
  const aiChatEndRef = useRef(null);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );
  const visibleLeads = useMemo(() => {
    if (minimumRating === 'all') return leads;
    const threshold = Number.parseFloat(minimumRating);
    return leads.filter((lead) => {
      const rating = Number.parseFloat(lead.rating);
      return Number.isFinite(rating) && rating >= threshold;
    });
  }, [leads, minimumRating]);
  const checkedLeads = useMemo(
    () => visibleLeads.filter((lead) => selectedLeadIds.has(lead.id)),
    [visibleLeads, selectedLeadIds]
  );
  const allLeadsChecked = visibleLeads.length > 0 && checkedLeads.length === visibleLeads.length;
  const exportCount = checkedLeads.length || visibleLeads.length;
  const spellingSuggestion = useMemo(() => {
    const businessType = spellingSuggestionFor(form.businessType);
    const cityArea = form.cityArea ? spellingSuggestionFor(form.cityArea) : '';
    const hasBusinessFix = Boolean(businessType);
    const hasLocationFix = Boolean(cityArea);
    if (!hasBusinessFix && !hasLocationFix) return null;
    return {
      businessType: hasBusinessFix ? businessType : form.businessType,
      cityArea: hasLocationFix ? cityArea : form.cityArea,
    };
  }, [form.businessType, form.cityArea]);
  const socialSpellingSuggestion = useMemo(() => spellingSuggestionFor(socialSearchQuery), [socialSearchQuery]);
  const aiSpellingSuggestion = useMemo(() => spellingSuggestionFor(aiQuestion), [aiQuestion]);
  const emailMessageSpellingSuggestion = useMemo(() => spellingSuggestionFor(emailMessage), [emailMessage]);
  const businessTypeSuggestions = useMemo(() => form.businessType.trim() ? textSuggestionsFor(form.businessType, BUSINESS_SUGGESTIONS) : [], [form.businessType]);
  const locationSuggestions = useMemo(() => !form.pincode && form.cityArea.trim() ? textSuggestionsFor(form.cityArea, LOCATION_SUGGESTIONS) : [], [form.cityArea, form.pincode]);
  const socialQuerySuggestions = useMemo(() => {
    const leadNames = leads.map((lead) => lead.name).filter(Boolean);
    const options = [selectedLead?.name, ...leadNames].filter(Boolean);
    return socialSearchQuery.trim() ? textSuggestionsFor(socialSearchQuery, options, 4) : [];
  }, [leads, selectedLead, socialSearchQuery]);
  const aiQuestionSuggestions = useMemo(() => aiQuestion.trim() ? textSuggestionsFor(aiQuestion, AI_PROMPT_SUGGESTIONS, 4) : [], [aiQuestion]);
  const emailMessageSuggestions = useMemo(() => emailMessage.trim() ? textSuggestionsFor(emailMessage, EMAIL_MESSAGE_SUGGESTIONS, 3) : [], [emailMessage]);

  useEffect(() => {
    setScraperUrl(selectedLead?.website || '');
    setScrapeResult(null);
    setScrapeError('');
    setEmailModalOpen(false);
  }, [selectedLead]);

  useEffect(() => {
    if (!visibleLeads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(visibleLeads[0]?.id || '');
    }
  }, [visibleLeads, selectedLeadId]);

  useEffect(() => {
    setSocialProfiles([]);
    setSocialSearchResults([]);
    setSocialError('');
    setHasSearchedSocials(false);
    setSocialSearchQuery(selectedLead?.name || '');
  }, [selectedLead]);

  const searchSocialProfiles = async (event) => {
    event?.preventDefault();
    const query = socialSearchQuery.trim();
    if (!query || isSocialLoading) return;

    setIsSocialLoading(true);
    setSocialError('');
    setHasSearchedSocials(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/social-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: query,
          address: selectedLead.address,
          website: selectedLead.website,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Social media search failed.');
      setSocialProfiles(data.profiles || []);
      setSocialSearchResults(data.fallback_searches || []);
      setSocialError(data.error || '');
    } catch (profileError) {
      setSocialProfiles([]);
      setSocialSearchResults([]);
      setSocialError(profileError.message || 'Social media search failed. Please try again.');
    } finally {
      setIsSocialLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedLead) return;

    setAiMessages((current) => {
      const contextId = `lead-${selectedLead.id}`;
      if (current.some((message) => message.id === contextId)) return current;

      return [
        ...current,
        {
          id: contextId,
          role: 'system',
          content: `${selectedLead.name} selected. Lead AI will use its Google lead data in answers.`,
        },
      ];
    });
  }, [selectedLead]);

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [aiMessages, isAiThinking]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateLocationField = (value) => {
    const isPincode = /^\d{4,8}$/.test(value.trim());
    setForm((current) => ({
      ...current,
      pincode: isPincode ? value : '',
      cityArea: isPincode ? '' : value,
    }));
  };

  const applySpellingSuggestion = () => {
    if (!spellingSuggestion) return;
    setForm((current) => ({
      ...current,
      businessType: spellingSuggestion.businessType,
      cityArea: current.pincode ? current.cityArea : spellingSuggestion.cityArea,
      pincode: current.pincode,
    }));
  };

  const applyTextSuggestion = (setter, suggestion) => {
    if (suggestion) setter(suggestion);
  };

  const suggestionBox = (field, items, onPick) => activeSuggestionField === field && items.length ? (
    <div className="ls-suggestion-box">
      {items.map((item) => (
        <button type="button" key={item} onMouseDown={(event) => event.preventDefault()} onClick={() => { onPick(item); setActiveSuggestionField(''); }}>
          <Search size={14} />
          {item}
        </button>
      ))}
    </div>
  ) : null;

  const handleSearch = async (event) => {
    event.preventDefault();
    setIsSearching(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/leads/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          company_name: form.companyName,
          pincode: form.pincode,
          city_area: form.cityArea,
          radius_km: Number(form.radiusKm),
          business_type: form.businessType,
          max_pages: 5,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Lead search failed.');
      }

      const uniqueLeads = [...new Map((data.leads || []).map((lead) => [
        lead.id || `${lead.name}|${lead.website}|${lead.phone}`.toLowerCase(), lead,
      ])).values()];
      setLeads(uniqueLeads);
      setSelectedLeadId(uniqueLeads[0]?.id || '');
      setSelectedLeadIds(new Set());
      setLastSearchCriteria({
        companyName: form.companyName.trim(),
        businessType: form.businessType.trim(),
        location: (form.pincode || form.cityArea).trim(),
        radiusKm: Number(form.radiusKm),
        query: data.query || '',
        databaseSearchId: data.database_search_id || null,
      });
    } catch (searchError) {
      setLeads([]);
      setSelectedLeadId('');
      setSelectedLeadIds(new Set());
      setLastSearchCriteria(null);
      setError(searchError.message || 'Something went wrong while searching.');
    } finally {
      setIsSearching(false);
    }
  };

  const exportCsv = async () => {
    if (!visibleLeads.length) return;

    const selectedForExport = checkedLeads.length ? checkedLeads : visibleLeads;
    const leadsToExport = [...new Map(selectedForExport.map((lead) => [
      lead.id || `${lead.name}|${lead.website}|${lead.phone}`.toLowerCase(), lead,
    ])).values()];
    const searchedFor = [
      lastSearchCriteria?.companyName,
      lastSearchCriteria?.businessType,
    ].filter(Boolean).join(' · ') || lastSearchCriteria?.query || 'Lead search';
    const searchedNear = lastSearchCriteria?.location
      ? ` in ${lastSearchCriteria.location}`
      : '';
    const searchedRadius = lastSearchCriteria?.radiusKm
      ? ` (${lastSearchCriteria.radiusKm} km)`
      : '';
    const selectionLabel = checkedLeads.length ? ' — Selected leads' : '';
    const exportName = `${searchedFor}${searchedNear}${searchedRadius}${selectionLabel}`;
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
          leads: leadsToExport,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Could not save CSV export.');
      }
    } catch (saveError) {
      setCsvError(saveError.message || 'Could not save CSV export.');
      return;
    }

    const headers = [
      'Name',
      'Company Email',
      'Phone',
      'Address',
      'Business Type',
      'Website',
      'Google Maps URL',
      'Rating',
      'Distance KM',
      'Status',
      'Latitude',
      'Longitude',
      'Place ID',
    ];
    const rows = leadsToExport.map((lead) => [
      lead.name,
      lead.email || lead.emails?.[0] || '',
      lead.phone,
      lead.address,
      lead.business_type,
      lead.website,
      lead.google_maps_url,
      lead.rating ?? '',
      lead.distance_km ?? '',
      lead.status,
      lead.latitude ?? '',
      lead.longitude ?? '',
      lead.id,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = checkedLeads.length ? 'nexgtools-selected-leads.csv' : 'nexgtools-all-leads.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleLeadChecked = (leadId) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const changeMinimumRating = (event) => {
    setMinimumRating(event.target.value);
    // A rating change creates a new visible result set; stale checked rows
    // should not remain selected for export after they disappear.
    setSelectedLeadIds(new Set());
  };

  const toggleAllLeadsChecked = () => {
    setSelectedLeadIds(() => {
      if (allLeadsChecked) return new Set();
      return new Set(visibleLeads.map((lead) => lead.id));
    });
  };

  const openEmailModal = () => {
    const recipient = selectedLead?.email || scrapeResult?.emails?.[0] || '';
    setEmailRecipient(recipient);
    setEmailMessage(`Hello ${selectedLead?.name || 'there'},\n\nWe came across your company and would like to discuss a potential business opportunity with you. Please let us know a convenient time to connect.\n\nBest regards,\nOur Team`);
    setEmailModalOpen(true);
  };

  const sendEmail = (event) => {
    event.preventDefault();
    if (!emailRecipient.trim()) return;
    const subject = `Business enquiry for ${selectedLead?.name || 'your company'}`;
    window.location.href = `mailto:${encodeURIComponent(emailRecipient.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailMessage)}`;
    setEmailModalOpen(false);
  };

  const downloadJson = () => {
    if (!scrapeResult) return;

    const blob = new Blob([JSON.stringify(scrapeResult, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nexgtools-website-scrape.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleScrape = async () => {
    setIsScraping(true);
    setScrapeError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          url: scraperUrl,
          max_pages: Number(scraperMaxPages),
          lead: selectedLead,
          search_name: lastSearchCriteria?.query || lastSearchCriteria?.businessType || lastSearchCriteria?.companyName || '',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Website scraping failed.');
      }

      setScrapeResult(data);
      setAiMessages((current) => [
        ...current,
        {
          id: `scrape-${Date.now()}`,
          role: 'system',
          content: `Website scrape loaded: ${data.pages_scraped} pages, ${data.emails?.length || 0} emails, ${data.phones?.length || 0} phones.`,
        },
      ]);
    } catch (scraperError) {
      setScrapeResult(null);
      setScrapeError(scraperError.message || 'Something went wrong while scraping.');
    } finally {
      setIsScraping(false);
    }
  };

  const clearScrape = () => {
    setScrapeResult(null);
    setScrapeError('');
  };

  const askLeadAi = async (questionText = aiQuestion) => {
    const question = questionText.trim();
    if (!question || isAiThinking) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      status: 'Seen',
    };
    const nextMessages = [...aiMessages, userMessage];
    setAiMessages(nextMessages);
    setAiQuestion('');
    setAiError('');
    setIsAiThinking(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/lead-ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          lead: selectedLead,
          scrape: scrapeResult,
          history: aiMessages.filter((message) => message.role === 'user' || message.role === 'assistant'),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Lead AI request failed.');
      }

      setAiMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.answer,
        },
      ]);
    } catch (chatError) {
      setAiError(chatError.message || 'Something went wrong while asking Lead AI.');
      setAiMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'I could not answer that yet. Check the error below and try again.',
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleAiSubmit = (event) => {
    event.preventDefault();
    askLeadAi();
  };

  const clearLeadAi = () => {
    setAiMessages([AI_WELCOME_MESSAGE]);
    setAiQuestion('');
    setAiError('');
  };

  return (
    <div className="ls-page">

      {/* ── Search Form ────────────────────────────────────────── */}
      <form className="ls-form-card" onSubmit={handleSearch}>
        <div className="ls-form-grid">
          <div className="ls-field">
            <label>Area / Pincode</label>
            <input
              type="text"
              spellCheck="true"
              placeholder="e.g. Kolkata, Salt Lake or 700001"
              value={form.pincode || form.cityArea}
              onFocus={() => setActiveSuggestionField('location')}
              onBlur={() => setActiveSuggestionField('')}
              onChange={(event) => updateLocationField(event.target.value)}
            />
            {suggestionBox('location', locationSuggestions, updateLocationField)}
          </div>
          <div className="ls-field">
            <label>Search Radius</label>
            <select
              value={form.radiusKm}
              onChange={(event) => updateField('radiusKm', event.target.value)}
            >
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
            </select>
          </div>
        </div>
        <div className="ls-form-bottom">
          <div className="ls-field ls-field-type">
            <label>Business Type</label>
            <input
              type="text"
              spellCheck="true"
              placeholder="e.g. software, restaurant, clinic"
              value={form.businessType}
              onFocus={() => setActiveSuggestionField('businessType')}
              onBlur={() => setActiveSuggestionField('')}
              onChange={(event) => updateField('businessType', event.target.value)}
            />
            {suggestionBox('businessType', businessTypeSuggestions, (value) => updateField('businessType', value))}
          </div>
          <button className="ls-search-btn" disabled={isSearching}>
            {isSearching ? <Loader2 size={18} className="ls-spin" /> : <Search size={18} />}
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {spellingSuggestion ? (
          <div className="ls-spelling-suggestion">
            <span>Did you mean</span>
            <button type="button" onClick={applySpellingSuggestion}>
              {[spellingSuggestion.businessType, spellingSuggestion.cityArea].filter(Boolean).join(' in ')}
            </button>
            <span>?</span>
          </div>
        ) : null}
        <p className="ls-form-hint">
          Radius filters around the pincode or city. Company name is optional and helps narrow the search.
        </p>
      </form>

      {/* ── Split View ─────────────────────────────────────────── */}
      <div className="ls-split">
        {/* Left: Results List */}
        <div className="ls-panel ls-results-panel">
          <div className="ls-panel-header">
            <div>
              <h3>Leads Found <span className="ls-count">({visibleLeads.length})</span></h3>
              <p className="ls-panel-sub">
                {minimumRating === 'all' ? 'Current search results only' : `${minimumRating}+ star leads only`}
              </p>
            </div>
            <div className="ls-panel-actions">
              <label className="ls-check-label">
                <input
                  type="checkbox"
                  checked={allLeadsChecked}
                  disabled={!leads.length}
                  onChange={toggleAllLeadsChecked}
                />
                Check all
              </label>
              <label className="ls-rating-filter">
                <Star size={14} />
                <select value={minimumRating} onChange={changeMinimumRating} aria-label="Minimum rating">
                  <option value="all">All ratings</option>
                  <option value="1">1+ stars</option>
                  <option value="2">2+ stars</option>
                  <option value="3">3+ stars</option>
                  <option value="4">4+ stars</option>
                  <option value="5">5 stars</option>
                </select>
              </label>
              <button className="ls-csv-btn" onClick={exportCsv} disabled={!visibleLeads.length}>
                <Download size={14} /> Export CSV {exportCount ? `(${exportCount})` : ''}
              </button>
            </div>
          </div>
          {error ? (
            <div className="ls-inline-error">
              <AlertCircle size={14} />
              {error}
            </div>
          ) : null}
          {csvError ? (
            <div className="ls-inline-error">
              <AlertCircle size={14} />
              {csvError}
            </div>
          ) : null}
          {visibleLeads.length ? (
            <div className="ls-results-list" key={minimumRating}>
              {visibleLeads.map((lead) => (
                <button
                  className={`ls-lead-row ${selectedLead?.id === lead.id ? 'ls-lead-row-active' : ''} ${selectedLeadIds.has(lead.id) ? 'ls-lead-row-checked' : ''}`}
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  <span className="ls-lead-check" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={() => toggleLeadChecked(lead.id)}
                      aria-label={`Select ${lead.name} for CSV export`}
                    />
                  </span>
                  <div className="ls-lead-main">
                    <span className="ls-lead-name">{lead.name}</span>
                    <span className="ls-lead-address">
                      <MapPin size={13} />
                      {lead.address || 'Address not available'}
                    </span>
                  </div>
                  <div className="ls-lead-meta">
                    <span>{lead.business_type || 'Business'}</span>
                    {lead.distance_km !== null && lead.distance_km !== undefined ? (
                      <span>{lead.distance_km} km</span>
                    ) : null}
                    {lead.rating ? (
                      <span className="ls-rating"><Star size={13} /> {lead.rating}</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="ls-empty-state">
              <Search size={40} className="ls-empty-icon" />
              <p>{isSearching ? 'Searching Google Places...' : leads.length ? 'No leads match this rating.' : 'Fresh list. Run a search to show current leads here.'}</p>
              <span>{isSearching ? 'This usually takes a few seconds.' : leads.length ? 'Choose a lower minimum rating to see more results.' : 'Saved leads stay in history.'}</span>
            </div>
          )}
          <div className="ls-panel-footer">
            Showing {visibleLeads.length} of {leads.length} leads inside the selected radius. CSV exports {checkedLeads.length ? `${checkedLeads.length} selected` : 'all visible'} leads.
          </div>
        </div>

        {/* Right: Company Details */}
        <div className="ls-panel ls-detail-panel">
          {selectedLead ? (
            <div className="ls-detail-content">
              <span className="ls-detail-badge">Company About</span>
              <h2>{selectedLead.name}</h2>
              <p className="ls-detail-type">{selectedLead.business_type || 'Business'}</p>
              <div className="ls-detail-list">
                <div>
                  <MapPin size={16} />
                  <span>{selectedLead.address || 'Address not available'}</span>
                </div>
                <div>
                  <Phone size={16} />
                  <span>{selectedLead.phone || 'Phone not available from Google Places'}</span>
                </div>
                <div>
                  <Star size={16} />
                  <span>{selectedLead.rating ? `${selectedLead.rating} rating` : 'Rating not available'}</span>
                </div>
                <div>
                  <Globe size={16} />
                  {selectedLead.website ? (
                    <a href={selectedLead.website} target="_blank" rel="noreferrer">{selectedLead.website}</a>
                  ) : (
                    <span>Website not available</span>
                  )}
                </div>
              </div>
              {selectedLead.google_maps_url ? (
                <a className="ls-map-link" href={selectedLead.google_maps_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  Open in Google Maps
                </a>
              ) : null}
              <div className="ls-social-section">
                <div className="ls-social-title">
                  <Share2 size={16} />
                  Social Search
                </div>
                <form className="ls-social-search-form" onSubmit={searchSocialProfiles}>
                  <Search size={16} />
                  <input
                    type="search"
                    spellCheck="true"
                    value={socialSearchQuery}
                    onFocus={() => setActiveSuggestionField('social')}
                    onBlur={() => setActiveSuggestionField('')}
                    onChange={(event) => setSocialSearchQuery(event.target.value)}
                    placeholder="Search company or brand name..."
                    aria-label="Company or brand name for social media search"
                  />
                  <button type="submit" disabled={isSocialLoading || !socialSearchQuery.trim()}>
                    {isSocialLoading ? 'Searching...' : 'Search'}
                  </button>
                </form>
                {socialSpellingSuggestion ? (
                  <div className="ls-spelling-suggestion">
                    <span>Did you mean</span>
                    <button type="button" onClick={() => applyTextSuggestion(setSocialSearchQuery, socialSpellingSuggestion)}>
                      {socialSpellingSuggestion}
                    </button>
                    <span>?</span>
                  </div>
                ) : null}
                {suggestionBox('social', socialQuerySuggestions, setSocialSearchQuery)}
                {isSocialLoading ? (
                  <div className="ls-social-search-state">
                    <span className="ls-social-search-icon">
                      <Loader2 size={22} className="ls-spin" />
                    </span>
                    <div>
                      <strong>Searching social media</strong>
                      <p>Checking available profiles for {selectedLead.name}...</p>
                    </div>
                  </div>
                ) : socialProfiles.length || socialSearchResults.length ? (
                  <>
                    {socialProfiles.length ? (
                      <>
                        <div className="ls-social-result-heading">Official profiles found</div>
                        <div className="ls-social-links">
                          {socialProfiles.map((profile) => (
                            <a
                              key={`${profile.platform}-${profile.url}`}
                              href={profile.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`ls-social-link ls-social-${profile.platform}`}
                            >
                              <span>{profile.label[0]}</span>
                              {profile.label}
                              <ExternalLink size={13} />
                            </a>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {socialSearchResults.some((result) => !socialProfiles.some((profile) => profile.platform === result.platform)) ? (
                      <>
                        <div className="ls-social-result-heading ls-social-more-heading">
                          Search this company on
                        </div>
                        <div className="ls-social-links">
                          {socialSearchResults
                            .filter((result) => !socialProfiles.some((profile) => profile.platform === result.platform))
                            .map((result) => (
                              <a
                                key={`search-${result.platform}`}
                                href={result.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`ls-social-link ls-social-${result.platform}`}
                                title={`Search ${result.label} results for ${socialSearchQuery.trim()}`}
                              >
                                <span>{result.label[0]}</span>
                                {result.label} results
                                <ExternalLink size={13} />
                              </a>
                            ))}
                        </div>
                      </>
                    ) : null}
                    {socialError && !socialProfiles.length ? (
                      <p className="ls-social-result-note">Official profiles could not be verified, so company-specific search links are shown instead.</p>
                    ) : null}
                  </>
                ) : (
                  <div className="ls-social-search-state">
                    <span className="ls-social-search-icon"><Search size={22} /></span>
                    <div className="ls-social-search-copy">
                      <strong>{hasSearchedSocials ? 'No social profiles found' : 'Social Media Search'}</strong>
                      <p>
                        {socialError
                          ? socialError
                          : hasSearchedSocials
                            ? `We couldn't find a verified social media profile for ${selectedLead.name}.`
                            : `Search for available social media profiles connected to ${selectedLead.name}.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="ls-detail-empty">
              <Building2 size={48} className="ls-detail-icon" />
              <span className="ls-detail-badge">Company About</span>
              <h2>Company details will appear here</h2>
              <p>Search for leads, then select a company to view phone, address, business type, website, and Google Maps link.</p>
            </div>
          )}
        </div>
      </div>

      <div className="ls-workspace-grid">
        {/* ── Website Scraper ────────────────────────────────────── */}
        <div className="ls-card ls-scraper-card">
          <div className="ls-card-header ls-card-header-green">
            <div className="ls-card-icon-wrap green">
              <Globe size={20} />
            </div>
            <div>
              <h3>Website Scraper</h3>
              <p>Paste a website or use the selected lead website, then save the scrape as JSON.</p>
            </div>
          </div>
          <div className="ls-card-body">
            <div className="ls-scraper-grid">
              <div className="ls-field">
                <label>Website URL</label>
                <input
                  type="text"
                  spellCheck="false"
                  placeholder="https://example.com"
                  value={scraperUrl}
                  onChange={(event) => setScraperUrl(event.target.value)}
                />
              </div>
              <div className="ls-field">
                <label>Inner Pages</label>
                <select
                  value={scraperMaxPages}
                  onChange={(event) => setScraperMaxPages(event.target.value)}
                >
                  <option value="5">5 pages</option>
                  <option value="10">10 pages</option>
                  <option value="15">15 pages</option>
                  <option value="25">25 pages</option>
                </select>
              </div>
            </div>
            <div className="ls-card-actions">
              <button className="ls-btn ls-btn-primary" onClick={handleScrape} disabled={isScraping || !scraperUrl.trim()}>
                {isScraping ? <Loader2 size={16} className="ls-spin" /> : <Globe size={16} />}
                {isScraping ? 'Scraping...' : 'Start Scraping'}
              </button>
              <button className="ls-btn ls-btn-ghost" onClick={clearScrape}>Clear Result</button>
              <button className="ls-btn ls-btn-ghost" onClick={downloadJson} disabled={!scrapeResult}>
                <FileJson size={16} />
                Download JSON
              </button>
            </div>
            {scrapeError ? (
              <div className="ls-scrape-error">
                <AlertCircle size={15} />
                {scrapeError}
              </div>
            ) : null}
            {scrapeResult ? (
              <div className="ls-scrape-result">
                <div className="ls-scrape-stats">
                  <span><strong>{scrapeResult.pages_scraped}</strong> pages scraped</span>
                  <span><strong>{scrapeResult.internal_links?.length || 0}</strong> inner links</span>
                  <span><strong>{scrapeResult.emails?.length || 0}</strong> emails</span>
                  <span><strong>{scrapeResult.phones?.length || 0}</strong> phones</span>
                </div>
                <div className="ls-scrape-columns">
                  <div>
                    <h4>Pages</h4>
                    <div className="ls-scrape-list">
                      {scrapeResult.pages?.map((page) => (
                        <a key={page.url} href={page.url} target="_blank" rel="noreferrer">
                          <span>{page.title || page.url}</span>
                          <small>{page.url}</small>
                        </a>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4>Extracted Contacts</h4>
                    <div className="ls-scrape-contact-box">
                      <strong>Emails</strong>
                      <p>{scrapeResult.emails?.join(', ') || 'No emails found'}</p>
                      {scrapeResult.emails?.length ? (
                        <button type="button" className="ls-email-company-btn ls-email-scrape-btn" onClick={openEmailModal}>
                          <Mail size={15} />
                          Send email
                        </button>
                      ) : null}
                      <strong>Phones</strong>
                      <p>{scrapeResult.phones?.join(', ') || 'No phones found'}</p>
                    </div>
                  </div>
                </div>
                <details className="ls-scrape-json-wrap">
                  <summary>Raw JSON Preview</summary>
                  <pre className="ls-scrape-json">{JSON.stringify(scrapeResult, null, 2)}</pre>
                </details>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Lead AI Chat ───────────────────────────────────────── */}
        <div className="ls-card ls-ai-card">
          <div className="ls-card-header ls-card-header-purple">
            <div className="ls-card-icon-wrap purple">
              <Bot size={20} />
            </div>
            <div>
              <h3>Lead AI</h3>
              <p>Ask a general question, or select a lead for company answers.</p>
            </div>
            <button className="ls-btn ls-btn-ghost ls-btn-sm" style={{ marginLeft: 'auto' }} onClick={clearLeadAi}>Clear</button>
          </div>

          <div className="ls-ai-chat-area">
            {aiMessages.map((message, index) => (
              message.role === 'system' ? (
                <div className="ls-ai-system-note" key={message.id || `${message.role}-${index}`}>
                  {message.content}
                </div>
              ) : (
                <div className={`ls-ai-bubble ${message.role === 'user' ? 'ls-ai-bubble-user' : ''}`} key={message.id || `${message.role}-${index}`}>
                  {message.role === 'assistant' ? (
                    <div className="ls-ai-avatar">
                      <Bot size={18} />
                    </div>
                  ) : null}
                  <div className="ls-ai-bubble-content">
                    <p className="ls-ai-bubble-text">{message.content}</p>
                    <span className="ls-ai-bubble-status">{message.role === 'user' ? message.status || 'Seen' : 'Lead AI'}</span>
                  </div>
                </div>
              )
            ))}
            {isAiThinking ? (
              <div className="ls-ai-bubble">
                <div className="ls-ai-avatar">
                  <Bot size={18} />
                </div>
                <div className="ls-ai-bubble-content ls-ai-typing-content">
                  <div className="ls-typing-dots" aria-label="Lead AI is typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="ls-ai-bubble-status">typing...</span>
                </div>
              </div>
            ) : null}
            <div ref={aiChatEndRef} />
          </div>

          <div className="ls-ai-bottom">
            {aiError ? (
              <div className="ls-scrape-error ls-ai-error">
                <AlertCircle size={15} />
                {aiError}
              </div>
            ) : null}
            <div className="ls-ai-suggestions">
              {['Show only phone numbers', 'Show email addresses', 'What products do they offer?', 'Company summary'].map((suggestion) => (
                <button
                  className="ls-suggestion"
                  key={suggestion}
                  onClick={() => askLeadAi(suggestion)}
                  disabled={isAiThinking}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form className="ls-ai-input-row" onSubmit={handleAiSubmit}>
              <input
                type="text"
                spellCheck="true"
                placeholder="Ask Lead AI anything..."
                value={aiQuestion}
                onFocus={() => setActiveSuggestionField('ai')}
                onBlur={() => setActiveSuggestionField('')}
                onChange={(event) => setAiQuestion(event.target.value)}
              />
              <button className="ls-btn ls-btn-primary ls-btn-send" disabled={isAiThinking || !aiQuestion.trim()}>
                {isAiThinking ? <Loader2 size={16} className="ls-spin" /> : <Send size={16} />}
                Send
              </button>
            </form>
            {aiSpellingSuggestion ? (
              <div className="ls-spelling-suggestion">
                <span>Did you mean</span>
                <button type="button" onClick={() => applyTextSuggestion(setAiQuestion, aiSpellingSuggestion)}>
                  {aiSpellingSuggestion}
                </button>
                <span>?</span>
              </div>
            ) : null}
            {suggestionBox('ai', aiQuestionSuggestions, setAiQuestion)}
          </div>
        </div>
      </div>

      {emailModalOpen ? (
        <div className="ls-modal-backdrop" role="presentation" onMouseDown={() => setEmailModalOpen(false)}>
          <form className="ls-email-modal" role="dialog" aria-modal="true" aria-labelledby="ls-email-title" onSubmit={sendEmail} onMouseDown={(event) => event.stopPropagation()}>
            <div className="ls-email-modal-header">
              <div>
                <h3 id="ls-email-title">Email {selectedLead?.name}</h3>
                <p>Edit the message before opening it in your email app.</p>
              </div>
              <button type="button" className="ls-modal-close" onClick={() => setEmailModalOpen(false)} aria-label="Close email modal"><X size={18} /></button>
            </div>
            <div className="ls-field">
              <label>To</label>
              <input type="email" spellCheck="false" placeholder="company@example.com" value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} required autoFocus />
              {!emailRecipient ? <small className="ls-email-help">No company email was found yet. Enter one here or scrape the company website first.</small> : null}
            </div>
            <div className="ls-field">
              <label>Message</label>
              <textarea rows="9" spellCheck="true" value={emailMessage} onFocus={() => setActiveSuggestionField('emailMessage')} onBlur={() => setActiveSuggestionField('')} onChange={(event) => setEmailMessage(event.target.value)} required />
              {emailMessageSpellingSuggestion ? (
                <div className="ls-spelling-suggestion">
                  <span>Did you mean</span>
                  <button type="button" onClick={() => applyTextSuggestion(setEmailMessage, emailMessageSpellingSuggestion)}>
                    {emailMessageSpellingSuggestion}
                  </button>
                  <span>?</span>
                </div>
              ) : null}
              {suggestionBox('emailMessage', emailMessageSuggestions, setEmailMessage)}
            </div>
            <div className="ls-email-modal-actions">
              <button type="button" className="ls-btn ls-btn-ghost" onClick={() => setEmailModalOpen(false)}>Cancel</button>
              <button type="submit" className="ls-btn ls-btn-primary" disabled={!emailRecipient.trim() || !emailMessage.trim()}><Send size={16} /> Open email app</button>
            </div>
          </form>
        </div>
      ) : null}

    </div>
  );
};

export default LeadSearch;
