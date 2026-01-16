import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { BookProvider } from './contexts/BookContext'
import { PreferencesProvider } from './contexts/PreferencesContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <PreferencesProvider>
        <ThemeProvider>
          <BookProvider>
            <App />
          </BookProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </AuthProvider>
  </React.StrictMode>,
)
