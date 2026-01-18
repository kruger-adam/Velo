import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

interface ThemeContextType {
  isDarkMode: boolean
  toggleDarkMode: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first for immediate load
    const stored = localStorage.getItem('velo-dark-mode')
    if (stored !== null) {
      return stored === 'true'
    }
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Sync with Supabase when user is logged in
  useEffect(() => {
    if (user) {
      supabase
        .from('user_preferences')
        .select('dark_mode')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setIsDarkMode(data.dark_mode)
          }
        })
    }
  }, [user])

  // Apply theme to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('velo-dark-mode', String(isDarkMode))
  }, [isDarkMode])

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode
    setIsDarkMode(newValue)
    
    // Persist to Supabase if logged in
    if (user) {
      await supabase
        .from('user_preferences')
        .upsert({ user_id: user.id, dark_mode: newValue })
    }
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}


