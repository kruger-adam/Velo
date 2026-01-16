import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { BookProvider } from './contexts/BookContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <BookProvider>
          <App />
        </BookProvider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
