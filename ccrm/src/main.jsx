import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import { CcrmProvider } from './context/CcrmContext.jsx'
import './index.css'

const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const isGoogleConfigured = rawClientId && rawClientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE'
const GOOGLE_CLIENT_ID = isGoogleConfigured 
  ? rawClientId 
  : '100000000000-dummyclientid1234567890abcdef.apps.googleusercontent.com'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <CcrmProvider>
        <App />
      </CcrmProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
)
