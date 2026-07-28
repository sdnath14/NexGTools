import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applySavedFontPreference } from './fontPreference.js'
import './index.css'
import App from './App.jsx'

applySavedFontPreference()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
