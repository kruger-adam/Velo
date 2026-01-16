import React, { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  ArrowLeft, 
  Moon, 
  Sun,
  Minus,
  Plus,
  RotateCcw
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useBooks, type Book } from '../contexts/BookContext'
import { useAuth } from '../contexts/AuthContext'
import { splitWordByORP, estimateReadingTime } from '../lib/epubParser'
import AuthModal from './AuthModal'

interface ReaderProps {
  book: Book
  onBack: () => void
}

export default function Reader({ book, onBack }: ReaderProps) {
  const { isDarkMode, toggleDarkMode } = useTheme()
  const { currentProgress, updateProgress } = useBooks()
  const { isTrialMode } = useAuth()
  
  const [wordIndex, setWordIndex] = useState(currentProgress?.currentWordIndex || 0)
  const [wpm, setWpm] = useState(currentProgress?.wpm || 300)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')
  
  const timerRef = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<number | null>(null)
  const lastSaveRef = useRef<number>(0)

  const currentWord = book.words[wordIndex] || ''
  const { before, orp, after } = splitWordByORP(currentWord)
  const progress = book.totalWords > 0 ? (wordIndex / book.totalWords) * 100 : 0
  const wordsRemaining = book.totalWords - wordIndex
  const timeRemaining = estimateReadingTime(wordsRemaining, wpm)
  const isComplete = wordIndex >= book.totalWords - 1

  // Debug logging
  console.log('[Reader] State:', {
    wordIndex,
    totalWords: book.totalWords,
    wordsArrayLength: book.words.length,
    currentWord,
    isComplete,
    isPlaying,
  })

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    setShowControls(true)
    if (isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
  }, [isPlaying])

  // Handle mouse movement to show controls
  useEffect(() => {
    const handleMouseMove = () => resetControlsTimeout()
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [resetControlsTimeout])

  // Playback loop
  useEffect(() => {
    console.log('[Reader] Playback effect triggered:', { isPlaying, isComplete, wpm, totalWords: book.totalWords })
    if (isPlaying && !isComplete) {
      const interval = 60000 / wpm // ms per word
      console.log('[Reader] Starting timer with interval:', interval, 'ms')
      timerRef.current = window.setTimeout(() => {
        console.log('[Reader] Timer fired, advancing word')
        setWordIndex(prev => Math.min(prev + 1, book.totalWords - 1))
      }, interval)
    } else {
      console.log('[Reader] Not starting timer because:', { isPlaying, isComplete })
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isPlaying, wordIndex, wpm, book.totalWords, isComplete])

  // Auto-pause at end
  useEffect(() => {
    if (isComplete && isPlaying) {
      setIsPlaying(false)
      if (isTrialMode) {
        setShowAuthPrompt(true)
      }
    }
  }, [isComplete, isPlaying, isTrialMode])

  // Save progress periodically (debounced)
  useEffect(() => {
    const now = Date.now()
    if (now - lastSaveRef.current > 2000) {
      lastSaveRef.current = now
      updateProgress(wordIndex, wpm)
    }
  }, [wordIndex, wpm, updateProgress])

  // Save on pause
  useEffect(() => {
    if (!isPlaying) {
      updateProgress(wordIndex, wpm)
    }
  }, [isPlaying, wordIndex, wpm, updateProgress])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          setIsPlaying(prev => !prev)
          break
        case 'ArrowLeft':
          setWordIndex(prev => Math.max(0, prev - 10))
          break
        case 'ArrowRight':
          setWordIndex(prev => Math.min(book.totalWords - 1, prev + 10))
          break
        case 'ArrowUp':
          setWpm(prev => Math.min(1000, prev + 50))
          break
        case 'ArrowDown':
          setWpm(prev => Math.max(100, prev - 50))
          break
        case 'Escape':
          handleBack()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [book.totalWords])

  const handleBack = () => {
    if (isTrialMode && wordIndex > 0) {
      setShowAuthPrompt(true)
    } else {
      onBack()
    }
  }

  const handlePlayPause = () => {
    console.log('[Reader] handlePlayPause called, current isPlaying:', isPlaying)
    setIsPlaying(prev => {
      console.log('[Reader] Toggling isPlaying from', prev, 'to', !prev)
      return !prev
    })
    resetControlsTimeout()
  }

  const handleSkipBack = () => {
    setWordIndex(prev => Math.max(0, prev - 50))
    resetControlsTimeout()
  }

  const handleSkipForward = () => {
    setWordIndex(prev => Math.min(book.totalWords - 1, prev + 50))
    resetControlsTimeout()
  }

  const handleRestart = () => {
    setWordIndex(0)
    setIsPlaying(false)
    resetControlsTimeout()
  }

  const handleSpeedChange = (delta: number) => {
    setWpm(prev => Math.max(100, Math.min(1000, prev + delta)))
    resetControlsTimeout()
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = x / rect.width
    setWordIndex(Math.floor(percent * book.totalWords))
    resetControlsTimeout()
  }

  return (
    <div 
      className="min-h-screen flex flex-col cursor-none"
      style={{ backgroundColor: 'var(--color-bg)' }}
      onMouseMove={resetControlsTimeout}
    >
      {/* Header - hidden during playback */}
      <header 
        className={`
          px-6 py-4 flex items-center justify-between border-b
          transition-opacity duration-300
          ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        style={{ borderColor: 'var(--color-border)' }}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:opacity-70"
          style={{ 
            backgroundColor: 'var(--color-surface-elevated)',
            color: 'var(--color-text)',
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="flex-1 text-center px-4">
          <h1 
            className="font-medium truncate text-sm sm:text-base"
            style={{ color: 'var(--color-text)' }}
          >
            {book.title}
          </h1>
        </div>

        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg transition-colors hover:opacity-70"
          style={{ 
            backgroundColor: 'var(--color-surface-elevated)',
            color: 'var(--color-text)',
          }}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Trial mode notice */}
      {isTrialMode && (
        <div 
          className={`
            px-4 py-2 text-center text-sm
            transition-opacity duration-300
            ${showControls ? 'opacity-100' : 'opacity-0'}
          `}
          style={{ 
            backgroundColor: 'var(--color-surface-elevated)',
            color: 'var(--color-text-muted)',
          }}
        >
          Trial mode — your progress won't be saved. 
          <button 
            onClick={() => { setAuthMode('signup'); setShowAuthPrompt(true) }}
            className="ml-1 underline hover:no-underline"
            style={{ color: 'var(--color-accent)' }}
          >
            Sign up to save
          </button>
        </div>
      )}

      {/* Word display area */}
      <main 
        className="flex-1 flex items-center justify-center cursor-default"
        onClick={handlePlayPause}
      >
        <div className="relative">
          {/* ORP guide line */}
          <div 
            className="absolute left-1/2 -translate-x-1/2 -top-8 w-px h-6"
            style={{ backgroundColor: 'var(--color-orp)', opacity: 0.5 }}
          />
          <div 
            className="absolute left-1/2 -translate-x-1/2 -bottom-8 w-px h-6"
            style={{ backgroundColor: 'var(--color-orp)', opacity: 0.5 }}
          />
          
          {/* Word with ORP highlight - ORP character is always at center */}
          <div 
            className="relative select-none h-24 sm:h-28 md:h-32 lg:h-36 flex items-center"
            style={{ fontFamily: 'var(--font-mono)', minWidth: '80vw' }}
          >
            {/* Before ORP - positioned to end at center */}
            <span 
              className="absolute text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-right"
              style={{ 
                color: 'var(--color-text)',
                right: '50%',
                marginRight: '0.5ch', // Half of ORP width
              }}
            >
              {before}
            </span>
            
            {/* ORP character - always at center */}
            <span 
              className="absolute left-1/2 -translate-x-1/2 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-center"
              style={{ 
                color: 'var(--color-orp)',
              }}
            >
              {orp}
            </span>
            
            {/* After ORP - positioned to start after center */}
            <span 
              className="absolute text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-left"
              style={{ 
                color: 'var(--color-text)',
                left: '50%',
                marginLeft: '0.5ch', // Half of ORP width
              }}
            >
              {after}
            </span>
          </div>

          {/* Play indicator when paused */}
          {!isPlaying && (
            <div 
              className={`
                absolute inset-0 flex items-center justify-center
                transition-opacity duration-200
                ${showControls ? 'opacity-100' : 'opacity-0'}
              `}
            >
              <div 
                className="absolute inset-0 rounded-2xl"
                style={{ backgroundColor: 'var(--color-bg)', opacity: 0.8 }}
              />
              <div 
                className="relative flex flex-col items-center gap-4"
              >
                <div 
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  <Play className="w-10 h-10 text-white ml-1" />
                </div>
                <p 
                  className="text-sm"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Click or press Space to play
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Controls footer */}
      <footer 
        className={`
          px-6 py-6 transition-opacity duration-300
          ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        {/* Progress bar */}
        <div 
          className="h-2 rounded-full mb-6 cursor-pointer overflow-hidden"
          style={{ backgroundColor: 'var(--color-surface-elevated)' }}
          onClick={handleProgressClick}
        >
          <div 
            className="h-full rounded-full transition-all duration-100"
            style={{ 
              width: `${progress}%`,
              backgroundColor: 'var(--color-accent)',
            }}
          />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mb-6 text-sm">
          <span style={{ color: 'var(--color-text-muted)' }}>
            {Math.round(progress)}% complete
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {timeRemaining} remaining
          </span>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={handleRestart}
            className="p-3 rounded-lg transition-colors hover:opacity-70"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
            title="Restart"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          
          <button
            onClick={handleSkipBack}
            className="p-3 rounded-lg transition-colors hover:opacity-70"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
            title="Skip back 50 words"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          
          <button
            onClick={handlePlayPause}
            className="p-4 rounded-full transition-all hover:scale-105 active:scale-95"
            style={{ 
              backgroundColor: 'var(--color-accent)',
              color: 'white',
            }}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </button>
          
          <button
            onClick={handleSkipForward}
            className="p-3 rounded-lg transition-colors hover:opacity-70"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
            title="Skip forward 50 words"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <div className="w-12" /> {/* Spacer for symmetry */}
        </div>

        {/* Speed control */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handleSpeedChange(-50)}
            disabled={wpm <= 100}
            className="p-2 rounded-lg transition-colors hover:opacity-70 disabled:opacity-30"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
          >
            <Minus className="w-4 h-4" />
          </button>
          
          <div 
            className="flex items-center gap-2 px-4 py-2 rounded-lg min-w-[140px] justify-center"
            style={{ backgroundColor: 'var(--color-surface-elevated)' }}
          >
            <span 
              className="font-mono font-medium text-lg"
              style={{ color: 'var(--color-text)' }}
            >
              {wpm}
            </span>
            <span 
              className="text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              WPM
            </span>
          </div>
          
          <button
            onClick={() => handleSpeedChange(50)}
            disabled={wpm >= 1000}
            className="p-2 rounded-lg transition-colors hover:opacity-70 disabled:opacity-30"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <p 
          className="text-center mt-4 text-xs hidden sm:block"
          style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}
        >
          Space: play/pause • ←→: skip • ↑↓: speed
        </p>
      </footer>

      {/* Auth prompt modal */}
      {showAuthPrompt && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthPrompt(false)}
          onSwitchMode={setAuthMode}
        />
      )}
    </div>
  )
}

