import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
} from 'lucide-react';
import { API_BASE_URL, AUTH_TOKEN_KEY } from '../auth';
import nexgToolLogo from '../assets/nexgtool-removebg-preview.png';
import './AuthPage.css';

const AuthPage = ({ onAuthenticated }) => {
  const [form, setForm] = useState({ email: '', password: '' });
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
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed.');
      }
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      window.history.replaceState(null, '', '/');
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
        <main className="auth-form-panel">
          <form className="auth-card" onSubmit={submit}>
            <div className="auth-login-brand">
              <img className="auth-logo" src={nexgToolLogo} alt="NexG Tools" />
            </div>

            <div className="auth-form-heading">
              <span>Welcome back</span>
              <h2>Sign in to your workspace</h2>
              <p>Enter your authorized account details to continue.</p>
            </div>

            <div className="auth-fields auth-login-fields">
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
                    autoComplete="current-password"
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
              <LogIn size={17} />
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
            <p className="auth-privacy">Private internal workspace. Registration is disabled.</p>
          </form>
        </main>
      </div>
    </div>
  );
};

export default AuthPage;
