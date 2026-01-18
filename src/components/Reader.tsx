import React, { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Play, 
  Pause, 
  ArrowLeft, 
  Moon, 
  Sun,
  Minus,
  Plus,
  List,
  X,
  RotateCcw,
  RotateCw,
  BookOpen
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { useTheme } from '../contexts/ThemeContext'
import { useBooks, type Book } from '../contexts/BookContext'
import { useAuth } from '../contexts/AuthContext'
import { usePreferences, ORP_COLORS, type OrpColorKey } from '../contexts/PreferencesContext'
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
  const { preferences, updateFontSize, updateOrpColor } = usePreferences()
  
  const [wordIndex, setWordIndex] = useState(currentProgress?.currentWordIndex || 0)
  const [wpm, setWpm] = useState(currentProgress?.wpm || 300)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [showChapters, setShowChapters] = useState(false)
  const [scrubberHover, setScrubberHover] = useState<{ x: number, percent: number } | null>(null)
  const [showSessionStats, setShowSessionStats] = useState(false)
  const [sessionStats, setSessionStats] = useState({ wordsRead: 0, timeSpentMs: 0 })
  const progressBarRef = useRef<HTMLDivElement>(null)
  const sessionStartTimeRef = useRef<number | null>(null)
  const lastChapterIndexRef = useRef<number>(0)
  
  // Font size from preferences context (synced to DB for logged-in users)
  const fontSize = preferences.fontSize
  
  // ORP (focal letter) color from preferences
  const orpColorKey = preferences.orpColor
  const orpColor = isDarkMode ? ORP_COLORS[orpColorKey].dark : ORP_COLORS[orpColorKey].light
  
  const increaseFontSize = () => updateFontSize(Math.min(fontSize + 0.5, 6))
  const decreaseFontSize = () => updateFontSize(Math.max(fontSize - 0.5, 1.5))
  
  const timerRef = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<number | null>(null)
  const lastSaveRef = useRef<number>(0)
  const initialProgressRef = useRef<number | null>(null)
  
  // Sync wordIndex when progress is loaded from database
  useEffect(() => {
    if (currentProgress && currentProgress.bookId === book.id) {
      // Only update if this is the first load or if we haven't started reading yet
      if (!progressLoaded || wordIndex === 0) {
        console.log('[Reader] Syncing progress from database:', currentProgress.currentWordIndex)
        setWordIndex(currentProgress.currentWordIndex)
        setWpm(currentProgress.wpm)
        initialProgressRef.current = currentProgress.currentWordIndex
      }
      setProgressLoaded(true)
    }
  }, [currentProgress, book.id, progressLoaded, wordIndex])

  const currentWord = book.words[wordIndex] || ''
  const { before, orp, after } = splitWordByORP(currentWord)
  const progress = book.totalWords > 0 ? (wordIndex / book.totalWords) * 100 : 0
  const wordsRemaining = book.totalWords - wordIndex
  const timeRemaining = estimateReadingTime(wordsRemaining, wpm)
  const isComplete = wordIndex >= book.totalWords - 1

  // Find current chapter based on word index
  const currentChapterData = book.chapters?.length > 0 
    ? book.chapters.reduce<{ chapter: typeof book.chapters[0], index: number } | null>((current, chapter, index) => {
        if (wordIndex >= chapter.wordIndex) {
          return { chapter, index }
        }
        return current
      }, { chapter: book.chapters[0], index: 0 })
    : null
  
  const currentChapter = currentChapterData?.chapter ?? null
  const currentChapterIndex = currentChapterData?.index ?? 0
  const totalChapters = book.chapters?.length || 0

  // Debug logging
  console.log('[Reader] State:', {
    wordIndex,
    totalWords: book.totalWords,
    wordsArrayLength: book.words.length,
    chaptersCount: book.chapters?.length || 0,
    currentWord,
    isComplete,
    isPlaying,
  })

  // Auto-hide controls during playback
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    setShowControls(true)
    if (isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false)
      }, 2000) // Hide after 2 seconds of inactivity
    }
  }, [isPlaying])

  // Handle mouse movement to show controls (desktop)
  useEffect(() => {
    const handleMouseMove = () => {
      if (isPlaying && !showControls) {
        resetControlsTimeout()
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [resetControlsTimeout, isPlaying, showControls])

  // Start auto-hide timer when playback starts
  useEffect(() => {
    if (isPlaying) {
      resetControlsTimeout()
    } else {
      // Show controls when paused
      setShowControls(true)
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [isPlaying, resetControlsTimeout])

  // Playback loop
  useEffect(() => {
    console.log('[Reader] Playback effect triggered:', { isPlaying, isComplete, wpm, totalWords: book.totalWords })
    if (isPlaying && !isComplete) {
      const interval = 60000 / wpm // ms per word
      console.log('[Reader] Starting timer with interval:', interval, 'ms')
      timerRef.current = window.setTimeout(() => {
        console.log('[Reader] Timer fired, advancing word')
        setWordIndex(prev => Math.min(prev + 1, book.totalWords - 1))
        // Track words read this session (only from actual playback)
        setSessionStats(prev => ({ ...prev, wordsRead: prev.wordsRead + 1 }))
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

  // Track session time and show stats on pause
  useEffect(() => {
    if (isPlaying) {
      // Start timing when playback begins
      sessionStartTimeRef.current = Date.now()
    } else if (sessionStartTimeRef.current !== null) {
      // Accumulate time when pausing
      const elapsed = Date.now() - sessionStartTimeRef.current
      setSessionStats(prev => ({ ...prev, timeSpentMs: prev.timeSpentMs + elapsed }))
      sessionStartTimeRef.current = null
      
      // Show stats modal if user read enough words (threshold: 50)
      if (sessionStats.wordsRead >= 50) {
        // Small delay to let the pause animation settle
        setTimeout(() => {
          setShowSessionStats(true)
          
          // Trigger confetti for milestones
          const isMilestone = sessionStats.wordsRead >= 500 || 
                              currentChapterIndex > lastChapterIndexRef.current
          
          if (isMilestone) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            })
          }
        }, 200)
      }
    }
  }, [isPlaying])
  
  // Track chapter changes for milestone detection
  useEffect(() => {
    if (isPlaying) {
      lastChapterIndexRef.current = currentChapterIndex
    }
  }, [currentChapterIndex, isPlaying])

  // Auto-pause at end
  useEffect(() => {
    if (isComplete && isPlaying) {
      setIsPlaying(false)
      if (isTrialMode) {
        setShowAuthPrompt(true)
      }
    }
  }, [isComplete, isPlaying, isTrialMode])

  // Save progress periodically (debounced) - only after progress has loaded
  useEffect(() => {
    if (!progressLoaded) return // Don't save until we've loaded existing progress
    
    const now = Date.now()
    if (now - lastSaveRef.current > 2000) {
      lastSaveRef.current = now
      updateProgress(wordIndex, wpm)
    }
  }, [wordIndex, wpm, updateProgress, progressLoaded])

  // Save on pause - only after progress has loaded
  useEffect(() => {
    if (!isPlaying && progressLoaded) {
      updateProgress(wordIndex, wpm)
    }
  }, [isPlaying, wordIndex, wpm, updateProgress, progressLoaded])

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
    onBack()
  }

  const handlePlayPause = () => {
    console.log('[Reader] handlePlayPause called, current isPlaying:', isPlaying)
    setIsPlaying(prev => {
      console.log('[Reader] Toggling isPlaying from', prev, 'to', !prev)
      return !prev
    })
    resetControlsTimeout()
  }

  // Handle tap on reading area - show controls if hidden during playback, otherwise toggle play/pause
  const handleReadingAreaTap = () => {
    if (isPlaying && !showControls) {
      // If playing and controls hidden, just show controls (don't pause)
      resetControlsTimeout()
    } else {
      // Otherwise toggle play/pause
      handlePlayPause()
    }
  }

  // Skip based on time (seconds) converted to words using current WPM
  const handleSkipBack = () => {
    const wordsToSkip = Math.round((wpm / 60) * 15) // 15 seconds
    setWordIndex(prev => Math.max(0, prev - wordsToSkip))
    resetControlsTimeout()
  }

  const handleSkipForward = () => {
    const wordsToSkip = Math.round((wpm / 60) * 30) // 30 seconds
    setWordIndex(prev => Math.min(book.totalWords - 1, prev + wordsToSkip))
    resetControlsTimeout()
  }

  const handleJumpToChapter = (chapterWordIndex: number) => {
    setWordIndex(chapterWordIndex)
    setIsPlaying(false)
    setShowChapters(false)
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
    setScrubberHover(null)
  }

  // Find chapter at a given word index
  const getChapterAtWordIndex = (targetWordIndex: number) => {
    if (!book.chapters || book.chapters.length === 0) return null
    
    let result = { chapter: book.chapters[0], index: 0 }
    for (let i = 0; i < book.chapters.length; i++) {
      if (targetWordIndex >= book.chapters[i].wordIndex) {
        result = { chapter: book.chapters[i], index: i }
      } else {
        break
      }
    }
    return result
  }

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    setScrubberHover({ x, percent })
  }

  const handleProgressMouseLeave = () => {
    setScrubberHover(null)
  }

  // Touch event handlers for mobile scrubbing
  const handleProgressTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault() // Prevent scrolling while scrubbing
    const touch = e.touches[0]
    const rect = e.currentTarget.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    setScrubberHover({ x, percent })
  }

  const handleProgressTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    const rect = progressBarRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = touch.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    setScrubberHover({ x: Math.max(0, Math.min(rect.width, x)), percent })
  }

  const handleProgressTouchEnd = () => {
    if (scrubberHover) {
      // Jump to the scrubbed position
      setWordIndex(Math.floor(scrubberHover.percent * book.totalWords))
      resetControlsTimeout()
    }
    setScrubberHover(null)
  }

  // Get chapter info for scrubber tooltip
  const scrubberChapter = scrubberHover 
    ? getChapterAtWordIndex(Math.floor(scrubberHover.percent * book.totalWords))
    : null

  // Format time duration for display
  const formatSessionTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes === 0) {
      return `${seconds} sec`
    }
    return `${minutes} min ${seconds} sec`
  }

  // Handle dismissing session stats
  const handleDismissStats = () => {
    setShowSessionStats(false)
  }

  // Handle continuing reading (dismiss and play)
  const handleContinueReading = () => {
    setShowSessionStats(false)
    setIsPlaying(true)
  }

  // Calculate approx pages (250 words per page is standard)
  const approxPages = Math.round((sessionStats.wordsRead / 250) * 10) / 10

  return (
    <div 
      className={`min-h-screen flex flex-col ${showControls ? '' : 'cursor-none'}`}
      style={{ backgroundColor: 'var(--color-bg)' }}
      onMouseMove={resetControlsTimeout}
    >
      {/* Header - hidden during playback */}
      <header 
        className={`
          px-6 pb-4 flex items-center justify-between border-b safe-top
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

        <div className="flex-1 text-center px-4 min-w-0 overflow-hidden">
          <h1 
            className="font-medium truncate text-sm sm:text-base"
            style={{ color: 'var(--color-text)' }}
          >
            {book.title}
          </h1>
          {currentChapter && totalChapters > 0 && (
            <p 
              className="text-xs truncate mt-0.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {currentChapter.title}
              <span className="opacity-60 ml-1.5">
                ({currentChapterIndex + 1} of {totalChapters})
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {book.chapters && book.chapters.length > 0 && (
            <button
              onClick={() => setShowChapters(true)}
              className="p-2 rounded-lg transition-colors hover:opacity-70"
              style={{ 
                backgroundColor: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
              }}
              title={`Chapters (${book.chapters.length})`}
            >
              <List className="w-5 h-5" />
            </button>
          )}
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
        </div>
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

      {/* Word display area - tap to show controls or toggle play/pause */}
      <main 
        className="flex-1 flex items-center justify-center cursor-default"
        onClick={handleReadingAreaTap}
      >
        <div className="relative">
          {/* ORP guide line - positioned at 25% to give max room for word tail */}
          <div 
            className="absolute -top-8 w-px h-6"
            style={{ backgroundColor: orpColor, opacity: 0.5, left: '25%' }}
          />
          <div 
            className="absolute -bottom-8 w-px h-6"
            style={{ backgroundColor: orpColor, opacity: 0.5, left: '25%' }}
          />
          
          {/* Word with ORP highlight - ORP at 25% to leave max room for longer word tails */}
          <div 
            className="relative select-none h-20 sm:h-24 md:h-28 lg:h-32 flex items-center"
            style={{ fontFamily: 'var(--font-mono)', minWidth: '90vw' }}
          >
            {/* Before ORP - positioned to end at 25% mark */}
            <span 
              className="absolute text-right"
              style={{ 
                color: 'var(--color-text)',
                right: '75%',
                marginRight: '0.5ch',
                fontSize: `${fontSize}rem`,
              }}
            >
              {before}
            </span>
            
            {/* ORP character - at 25% from left */}
            <span 
              className="absolute font-bold text-center"
              style={{ 
                color: orpColor,
                left: '25%',
                transform: 'translateX(-50%)',
                fontSize: `${fontSize}rem`,
              }}
            >
              {orp}
            </span>
            
            {/* After ORP - positioned to start after 25% mark */}
            <span 
              className="absolute text-left"
              style={{ 
                color: 'var(--color-text)',
                left: '25%',
                marginLeft: '0.5ch',
                fontSize: `${fontSize}rem`,
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
                  <span className="sm:hidden">Tap to play</span>
                  <span className="hidden sm:inline">Click or press Space to play</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Controls footer */}
      <footer 
        className={`
          px-6 pt-6 pb-10 sm:pb-6 transition-opacity duration-300
          ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        style={{ paddingBottom: `calc(2.5rem + env(safe-area-inset-bottom, 0))` }}
      >
        {/* Progress bar with chapter markers */}
        <div 
          ref={progressBarRef}
          className="h-8 rounded-full mb-4 cursor-pointer relative flex items-center touch-none"
          onClick={handleProgressClick}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
          onTouchStart={handleProgressTouchStart}
          onTouchMove={handleProgressTouchMove}
          onTouchEnd={handleProgressTouchEnd}
        >
          {/* Scrubber tooltip */}
          {scrubberHover && scrubberChapter && totalChapters > 0 && (() => {
            const barWidth = progressBarRef.current?.offsetWidth || 0
            const edgeThreshold = 80 // pixels from edge to start adjusting
            const isNearLeftEdge = scrubberHover.x < edgeThreshold
            const isNearRightEdge = scrubberHover.x > barWidth - edgeThreshold
            
            // Determine alignment based on position
            let leftPosition: string
            let transform: string
            
            if (isNearLeftEdge) {
              // Left-align tooltip near left edge
              leftPosition = '0px'
              transform = 'translateX(0)'
            } else if (isNearRightEdge) {
              // Right-align tooltip near right edge
              leftPosition = `${barWidth}px`
              transform = 'translateX(-100%)'
            } else {
              // Center tooltip in the middle
              leftPosition = `${scrubberHover.x}px`
              transform = 'translateX(-50%)'
            }
            
            return (
              <div 
                className="absolute bottom-full mb-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap pointer-events-none z-20"
                style={{ 
                  left: leftPosition,
                  transform,
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <div style={{ color: 'var(--color-text)' }} className="font-medium">
                  Ch. {scrubberChapter.index + 1}: {scrubberChapter.chapter.title}
                </div>
                <div style={{ color: 'var(--color-text-muted)' }} className="mt-0.5">
                  {Math.round(scrubberHover.percent * 100)}% • {scrubberChapter.index + 1} of {totalChapters}
                </div>
              </div>
            )
          })()}
          
          {/* Scrubber indicator line */}
          {scrubberHover && (
            <div 
              className="absolute top-0 w-0.5 h-full z-20 pointer-events-none"
              style={{ 
                left: `${scrubberHover.percent * 100}%`,
                backgroundColor: 'var(--color-accent)',
              }}
            />
          )}

          {/* Track background */}
          <div 
            className="absolute left-0 right-0 h-2 rounded-full"
            style={{ backgroundColor: 'var(--color-surface-elevated)' }}
          />
          
          {/* Chapter markers */}
          {book.chapters && book.chapters.length > 1 && book.chapters.map((chapter, index) => {
            // Skip the first chapter (starts at 0%)
            if (index === 0) return null
            const markerPosition = (chapter.wordIndex / book.totalWords) * 100
            return (
              <div
                key={index}
                className="absolute w-0.5 h-3 z-10 rounded-full"
                style={{ 
                  left: `${markerPosition}%`,
                  backgroundColor: 'var(--color-border)',
                  transform: 'translateX(-50%)',
                }}
              />
            )
          })}
          
          {/* Progress fill */}
          <div 
            className="absolute left-0 h-2 rounded-full transition-all duration-100 z-0"
            style={{ 
              width: `${progress}%`,
              backgroundColor: 'var(--color-accent)',
            }}
          />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mb-6 text-sm">
          <span style={{ color: 'var(--color-text-muted)' }}>
            {currentChapter && totalChapters > 0 && (
              <span className="hidden sm:inline">Ch. {currentChapterIndex + 1}/{totalChapters} • </span>
            )}
            {Math.round(progress)}% complete
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {timeRemaining} remaining
          </span>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={handleSkipBack}
            className="p-2 rounded-lg transition-colors hover:opacity-70 relative"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
            title="Skip back 15 seconds"
          >
            <RotateCcw className="w-8 h-8" strokeWidth={1.5} />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">15</span>
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
            className="p-2 rounded-lg transition-colors hover:opacity-70 relative"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
            title="Skip forward 30 seconds"
          >
            <RotateCw className="w-8 h-8" strokeWidth={1.5} />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">30</span>
          </button>
        </div>

        {/* Speed and Font Size controls */}
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {/* Speed control */}
          <div className="flex items-center gap-2">
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
              className="flex items-center gap-2 px-3 py-2 rounded-lg min-w-[100px] justify-center"
              style={{ backgroundColor: 'var(--color-surface-elevated)' }}
            >
              <span 
                className="font-mono font-medium"
                style={{ color: 'var(--color-text)' }}
              >
                {wpm}
              </span>
              <span 
                className="text-xs"
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

          {/* Font size control */}
          <div className="flex items-center gap-2">
            <button
              onClick={decreaseFontSize}
              disabled={fontSize <= 1.5}
              className="p-2 rounded-lg transition-colors hover:opacity-70 disabled:opacity-30"
              style={{ 
                backgroundColor: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
              }}
            >
              <Minus className="w-4 h-4" />
            </button>
            
            <div 
              className="flex items-center gap-2 px-3 py-2 rounded-lg min-w-[90px] justify-center"
              style={{ backgroundColor: 'var(--color-surface-elevated)' }}
            >
              <span 
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Font
              </span>
              <span 
                className="font-mono font-medium"
                style={{ color: 'var(--color-text)' }}
              >
                {fontSize}
              </span>
            </div>
            
            <button
              onClick={increaseFontSize}
              disabled={fontSize >= 6}
              className="p-2 rounded-lg transition-colors hover:opacity-70 disabled:opacity-30"
              style={{ 
                backgroundColor: 'var(--color-surface-elevated)',
                color: 'var(--color-text)',
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Focal letter color picker */}
          <div className="flex items-center gap-2">
            <span 
              className="text-xs mr-1"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Focus
            </span>
            {(Object.keys(ORP_COLORS) as OrpColorKey[]).map((colorKey) => {
              const color = isDarkMode ? ORP_COLORS[colorKey].dark : ORP_COLORS[colorKey].light
              const isSelected = colorKey === orpColorKey
              return (
                <button
                  key={colorKey}
                  onClick={() => updateOrpColor(colorKey)}
                  className="w-6 h-6 rounded-full transition-all hover:scale-110"
                  style={{ 
                    backgroundColor: color,
                    boxShadow: isSelected ? `0 0 0 2px var(--color-bg), 0 0 0 4px ${color}` : 'none',
                  }}
                  title={ORP_COLORS[colorKey].name}
                />
              )
            })}
          </div>
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

      {/* Chapters panel */}
      {showChapters && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowChapters(false)}
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          />
          
          {/* Panel */}
          <div 
            className="relative w-full max-w-md max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div 
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h2 
                className="text-lg font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                Chapters
              </h2>
              <button
                onClick={() => setShowChapters(false)}
                className="p-2 rounded-lg hover:opacity-70"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Chapter list */}
            <div className="overflow-y-auto flex-1 p-2">
              {book.chapters.map((chapter, index) => {
                const isCurrentChapter = wordIndex >= chapter.wordIndex && 
                  (index === book.chapters.length - 1 || wordIndex < book.chapters[index + 1].wordIndex)
                
                return (
                  <button
                    key={index}
                    onClick={() => handleJumpToChapter(chapter.wordIndex)}
                    className="w-full text-left px-4 py-3 rounded-lg mb-1 transition-colors hover:opacity-80"
                    style={{ 
                      backgroundColor: isCurrentChapter ? 'var(--color-accent)' : 'var(--color-surface-elevated)',
                      color: isCurrentChapter ? 'white' : 'var(--color-text)',
                    }}
                  >
                    <div className="font-medium">{chapter.title}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Session stats modal */}
      {showSessionStats && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={handleDismissStats}
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          />
          
          {/* Stats card */}
          <div 
            className="relative w-full max-w-sm rounded-2xl overflow-hidden animate-slide-up"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header with icon */}
            <div className="pt-6 pb-2 text-center">
              <div 
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3"
                style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}
              >
                <BookOpen 
                  className="w-8 h-8" 
                  style={{ color: 'var(--color-accent)' }} 
                />
              </div>
              <h2 
                className="text-lg font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                Great reading session!
              </h2>
            </div>
            
            {/* Stats */}
            <div className="px-6 py-4">
              <div 
                className="flex items-center justify-around py-4 rounded-xl"
                style={{ backgroundColor: 'var(--color-surface-elevated)' }}
              >
                <div className="text-center">
                  <div 
                    className="text-2xl font-bold font-mono"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {sessionStats.wordsRead.toLocaleString()}
                  </div>
                  <div 
                    className="text-xs mt-1"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    words
                  </div>
                </div>
                <div 
                  className="w-px h-10"
                  style={{ backgroundColor: 'var(--color-border)' }}
                />
                <div className="text-center">
                  <div 
                    className="text-2xl font-bold font-mono"
                    style={{ color: 'var(--color-text)' }}
                  >
                    ~{approxPages}
                  </div>
                  <div 
                    className="text-xs mt-1"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    pages
                  </div>
                </div>
                <div 
                  className="w-px h-10"
                  style={{ backgroundColor: 'var(--color-border)' }}
                />
                <div className="text-center">
                  <div 
                    className="text-2xl font-bold font-mono"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {formatSessionTime(sessionStats.timeSpentMs).split(' ')[0]}
                  </div>
                  <div 
                    className="text-xs mt-1"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {formatSessionTime(sessionStats.timeSpentMs).split(' ')[1]}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleDismissStats}
                className="flex-1 py-3 rounded-xl font-medium transition-colors hover:opacity-80"
                style={{ 
                  backgroundColor: 'var(--color-surface-elevated)',
                  color: 'var(--color-text)',
                }}
              >
                Done
              </button>
              <button
                onClick={handleContinueReading}
                className="flex-1 py-3 rounded-xl font-medium transition-colors hover:opacity-90"
                style={{ 
                  backgroundColor: 'var(--color-accent)',
                  color: 'white',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

