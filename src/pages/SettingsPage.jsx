import React from 'react';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import './SettingsPage.css';

const THEMES = [
  { id: 'light', label: 'Light', description: 'Bright and clean', icon: Sun },
  { id: 'dark', label: 'Dark', description: 'Easy on the eyes', icon: Moon },
  { id: 'system', label: 'System', description: 'Match your device', icon: Monitor },
];

const ACCENTS = [
  { id: 'orange', label: 'Orange', color: '#f97316' },
];

const SettingsPage = ({ appearance, onAppearanceChange }) => {
  const update = (key, value) => {
    onAppearanceChange({ ...appearance, [key]: value });
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-icon"><Palette size={22} /></div>
        <div>
          <h1>Appearance</h1>
          <p>Personalize how NexG Tools looks across every page.</p>
        </div>
      </header>

      <section className="settings-card">
        <div className="settings-section-head">
          <h2>Theme</h2>
          <p>Choose your preferred application color scheme.</p>
        </div>
        <div className="settings-theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`settings-choice ${appearance.theme === theme.id ? 'settings-choice-active' : ''}`}
              onClick={() => update('theme', theme.id)}
            >
              <theme.icon size={20} />
              <span><strong>{theme.label}</strong><small>{theme.description}</small></span>
              {appearance.theme === theme.id && <Check size={17} />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-section-head">
          <h2>Accent color</h2>
          <p>Used for active navigation, focus states, and primary controls.</p>
        </div>
        <div className="settings-accent-row">
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              type="button"
              className={`settings-accent ${appearance.accent === accent.id ? 'settings-accent-active' : ''}`}
              onClick={() => update('accent', accent.id)}
            >
              <span style={{ background: accent.color }} />
              {accent.label}
              {appearance.accent === accent.id && <Check size={16} />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card settings-density">
        <div className="settings-section-head">
          <h2>Layout density</h2>
          <p>Compact mode reduces application spacing to fit more information.</p>
        </div>
        <div className="settings-segmented">
          {['comfortable', 'compact'].map((density) => (
            <button
              key={density}
              type="button"
              className={appearance.density === density ? 'active' : ''}
              onClick={() => update('density', density)}
            >
              {density[0].toUpperCase() + density.slice(1)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
