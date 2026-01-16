import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

interface Preferences {
  fontSize: number
  defaultWpm: number
  darkMode: boolean
}

interface PreferencesContextType {
  preferences: Preferences
  updateFontSize: (size: number) => void
  updateDefaultWpm: (wpm: number) => void
  updateDarkMode: (enabled: boolean) => void
  loading: boolean
}

const defaultPreferences: Preferences = {
  fontSize: 2,
  defaultWpm: 300,
  darkMode: false,
}

const PreferencesContext = createContext<PreferencesContextType | null>(null)

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [preferences, setPreferences] = useState<Preferences>(() => {
    // Load from localStorage as initial/fallback
    const savedFontSize = localStorage.getItem('velo-font-size')
    const savedDarkMode = localStorage.getItem('velo-dark-mode')
    return {
      fontSize: savedFontSize ? parseFloat(savedFontSize) : defaultPreferences.fontSize,
      defaultWpm: defaultPreferences.defaultWpm,
      darkMode: savedDarkMode === 'true',
    }
  })
  const [loading, setLoading] = useState(false)

  // Load preferences from database when user logs in
  useEffect(() => {
    if (user) {
      loadPreferences()
    }
  }, [user])

  const loadPreferences = async () => {
    if (!user) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('[Preferences] Error loading:', error)
        return
      }

      if (data) {
        const newPrefs = {
          fontSize: data.font_size ?? defaultPreferences.fontSize,
          defaultWpm: data.default_wpm ?? defaultPreferences.defaultWpm,
          darkMode: data.dark_mode ?? defaultPreferences.darkMode,
        }
        setPreferences(newPrefs)
        // Sync to localStorage
        localStorage.setItem('velo-font-size', newPrefs.fontSize.toString())
        localStorage.setItem('velo-dark-mode', newPrefs.darkMode.toString())
        console.log('[Preferences] Loaded from database:', newPrefs)
      }
    } catch (err) {
      console.error('[Preferences] Failed to load:', err)
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = useCallback(async (updates: Partial<Preferences>) => {
    if (!user) {
      // Not logged in, just save to localStorage
      if (updates.fontSize !== undefined) {
        localStorage.setItem('velo-font-size', updates.fontSize.toString())
      }
      if (updates.darkMode !== undefined) {
        localStorage.setItem('velo-dark-mode', updates.darkMode.toString())
      }
      return
    }

    try {
      const dbUpdates: Record<string, unknown> = {}
      if (updates.fontSize !== undefined) {
        dbUpdates.font_size = updates.fontSize
        localStorage.setItem('velo-font-size', updates.fontSize.toString())
      }
      if (updates.defaultWpm !== undefined) {
        dbUpdates.default_wpm = updates.defaultWpm
      }
      if (updates.darkMode !== undefined) {
        dbUpdates.dark_mode = updates.darkMode
        localStorage.setItem('velo-dark-mode', updates.darkMode.toString())
      }

      const { error } = await supabase
        .from('user_preferences')
        .update(dbUpdates)
        .eq('user_id', user.id)

      if (error) {
        console.error('[Preferences] Error saving:', error)
      } else {
        console.log('[Preferences] Saved to database:', dbUpdates)
      }
    } catch (err) {
      console.error('[Preferences] Failed to save:', err)
    }
  }, [user])

  const updateFontSize = useCallback((size: number) => {
    setPreferences(prev => ({ ...prev, fontSize: size }))
    savePreferences({ fontSize: size })
  }, [savePreferences])

  const updateDefaultWpm = useCallback((wpm: number) => {
    setPreferences(prev => ({ ...prev, defaultWpm: wpm }))
    savePreferences({ defaultWpm: wpm })
  }, [savePreferences])

  const updateDarkMode = useCallback((enabled: boolean) => {
    setPreferences(prev => ({ ...prev, darkMode: enabled }))
    savePreferences({ darkMode: enabled })
  }, [savePreferences])

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        updateFontSize,
        updateDefaultWpm,
        updateDarkMode,
        loading,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  )
}

