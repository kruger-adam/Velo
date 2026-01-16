import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useBooks, type Book } from './contexts/BookContext'
import Landing from './components/Landing'
import Library from './components/Library'
import Reader from './components/Reader'

type View = 'landing' | 'library' | 'reader'

export default function App() {
  const { user, loading: authLoading } = useAuth()
  const { currentBook, trialBook, selectBook } = useBooks()
  const [view, setView] = useState<View>('landing')

  // Determine initial view based on auth state
  useEffect(() => {
    if (!authLoading) {
      if (user) {
        // Signed in - show library unless reading
        if (currentBook) {
          setView('reader')
        } else {
          setView('library')
        }
      } else {
        // Not signed in - show landing unless in trial reading
        if (trialBook && currentBook) {
          setView('reader')
        } else {
          setView('landing')
        }
      }
    }
  }, [user, authLoading, currentBook, trialBook])

  // Handle opening a book
  const handleOpenBook = async (book: Book) => {
    await selectBook(book)
    setView('reader')
  }

  // Handle going back from reader
  const handleBackFromReader = () => {
    if (user) {
      setView('library')
    } else {
      setView('landing')
    }
  }

  // Handle starting to read (from landing page trial)
  const handleStartReading = () => {
    setView('reader')
  }

  // Loading state
  if (authLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <div 
            className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
          />
          <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  // Render current view
  switch (view) {
    case 'reader':
      if (currentBook) {
        return <Reader book={currentBook} onBack={handleBackFromReader} />
      }
      // Fallback if no book selected
      return user ? (
        <Library onOpenBook={handleOpenBook} />
      ) : (
        <Landing onStartReading={handleStartReading} />
      )

    case 'library':
      return <Library onOpenBook={handleOpenBook} />

    case 'landing':
    default:
      return <Landing onStartReading={handleStartReading} />
  }
}
