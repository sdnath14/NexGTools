import React, { useState } from 'react';
import {
  Building2,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
  Search,
  User,
  UserPlus,
} from 'lucide-react';
import { API_BASE_URL, AUTH_TOKEN_KEY } from '../auth';
import './AuthPage.css';

const AuthPage = ({ onAuthenticated }) => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : form;
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed.');
      }
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      onAuthenticated(data.user);
    } catch (authError) {
      setError(authError.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-brand-panel">
          <div className="auth-brand">
            <div className="auth-brand-mark">N</div>
            <span>NexG <strong>Tools</strong></span>
          </div>
          <div className="auth-brand-copy">
            <span className="auth-eyebrow">Business intelligence workspace</span>
            <h1>Search, qualify, and understand businesses faster.</h1>
            <p>One focused workspace for lead discovery, source scraping, exports, and AI-powered research.</p>
          </div>
          <div className="auth-feature-list">
            <div><Search size={18} /><span><strong>Find leads</strong><small>Search live business sources</small></span><Check size={15} /></div>
            <div><Building2 size={18} /><span><strong>Scrape sources</strong><small>Extract useful company information</small></span><Check size={15} /></div>
            <div><LockKeyhole size={18} /><span><strong>Keep history</strong><small>Return to searches and CSV exports</small></span><Check size={15} /></div>
          </div>
          <p className="auth-brand-footer">NexG Tools · Internal workspace</p>
        </aside>

        <main className="auth-form-panel">
          <form className="auth-card" onSubmit={submit}>
            <div className="auth-mobile-brand">
              <div className="auth-brand-mark">N</div>
              <span>NexG <strong>Tools</strong></span>
            </div>

            <div className="auth-form-heading">
              <span>{mode === 'login' ? 'Welcome back' : 'Get started'}</span>
              <h2>{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</h2>
              <p>
                {mode === 'login'
                  ? 'Enter your account details to continue.'
                  : 'Create an account to save searches, scrapes, and exports.'}
              </p>
            </div>

            <div className="auth-mode-switch" aria-label="Authentication mode">
              <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
              <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
                Create account
              </button>
            </div>

            <div className="auth-fields">
              {mode === 'register' && (
                <label>
                  <span>Full name</span>
                  <div className="auth-input-wrap">
                    <User size={17} />
                    <input
                      value={form.name}
                      onChange={(event) => updateForm('name', event.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      required
                    />
                  </div>
                </label>
              )}
              <label>
                <span>Email address</span>
                <div className="auth-input-wrap">
                  <Mail size={17} />
                  <input
                    value={form.email}
                    onChange={(event) => updateForm('email', event.target.value)}
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>
              <label>
                <span>Password</span>
                <div className="auth-input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    value={form.password}
                    onChange={(event) => updateForm('password', event.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 6 characters"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" disabled={isSubmitting}>
              {mode === 'login' ? <LogIn size={17} /> : <UserPlus size={17} />}
              {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            <p className="auth-privacy">Your account securely separates your search and CSV history.</p>
          </form>
        </main>
      </div>
    </div>
  );
};

export default AuthPage;
