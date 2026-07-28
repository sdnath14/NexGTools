import React, { useState } from 'react';
import { Lock, LogIn, UserPlus } from 'lucide-react';
import { API_BASE_URL, AUTH_TOKEN_KEY } from '../auth';
import './AuthPage.css';

const AuthPage = ({ onAuthenticated }) => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-icon"><Lock size={24} /></div>
        <h1>NextG Tools</h1>
        <p>Sign in to save lead exports, scrape history, and AI activity.</p>
        {mode === 'register' && (
          <label>
            Name
            <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Your name" />
          </label>
        )}
        <label>
          Email
          <input value={form.email} onChange={(event) => updateForm('email', event.target.value)} type="email" placeholder="you@example.com" />
        </label>
        <label>
          Password
          <input value={form.password} onChange={(event) => updateForm('password', event.target.value)} type="password" placeholder="At least 6 characters" />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-submit" disabled={isSubmitting}>
          {mode === 'login' ? <LogIn size={17} /> : <UserPlus size={17} />}
          {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'Create a new account' : 'I already have an account'}
        </button>
      </form>
    </div>
  );
};

export default AuthPage;
