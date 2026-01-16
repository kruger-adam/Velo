import React, { useEffect, useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { BookOpen, Upload, LogOut, Moon, Sun, Plus, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useBooks, type Book } from '../contexts/BookContext'

interface LibraryProps {
  onOpenBook: (book: Book) => void
}

export default function Library({ onOpenBook }: LibraryProps) {
  const { user, signOut } = useAuth()
  const { isDarkMode, toggleDarkMode } = useTheme()
  const { books, loadBooks, uploadBook, loading, getProgress } = useBooks()
  const [bookProgress, setBookProgress] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  // Load progress for all books
  useEffect(() => {
    const loadAllProgress = async () => {
      const progress: Record<string, number> = {}
      for (const book of books) {
        const p = await getProgress(book.id)
        if (p && book.totalWords > 0) {
          progress[book.id] = Math.round((p.currentWordIndex / book.totalWords) * 100)
        } else {
          progress[book.id] = 0
        }
      }
      setBookProgress(progress)
    }
    if (books.length > 0) {
      loadAllProgress()
    }
  }, [books, getProgress])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setUploading(true)
      const book = await uploadBook(file)
      setUploading(false)
      if (book) {
        onOpenBook(book)
      }
    }
  }, [uploadBook, onOpenBook])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/epub+zip': ['.epub'],
      'application/zip': ['.zip'],
    },
    maxFiles: 1,
    noClick: true,
  })

  return (
    <div 
      {...getRootProps()}
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <input {...getInputProps()} />
      
      {/* Drag overlay */}
      {isDragActive && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
        >
          <div className="text-center">
            <Upload className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--color-accent)' }} />
            <p className="text-2xl font-medium text-white">Drop your ePub here</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header 
        className="px-6 pt-6 pb-4 flex items-center justify-between border-b sticky top-0 z-40 safe-top"
        style={{ 
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent)' }}>
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Velo</span>
        </div>
        
        <div className="flex items-center gap-2">
          <UploadButton onDrop={onDrop} uploading={uploading} />
          
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg transition-colors hover:opacity-70"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          
          <button
            onClick={signOut}
            className="p-2 rounded-lg transition-colors hover:opacity-70"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
            }}
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 
            className="text-3xl font-bold mb-2"
            style={{ color: 'var(--color-text)' }}
          >
            Your Library
          </h1>
          <p style={{ color: 'var(--color-text-muted)' }}>
            Welcome back{user?.email ? `, ${user.email}` : ''}
          </p>
        </div>

        {loading && books.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        ) : books.length === 0 ? (
          <EmptyLibrary onDrop={onDrop} uploading={uploading} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {books.map(book => (
              <BookCard
                key={book.id}
                book={book}
                progress={bookProgress[book.id] || 0}
                onClick={() => onOpenBook(book)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function UploadButton({ 
  onDrop, 
  uploading 
}: { 
  onDrop: (files: File[]) => void
  uploading: boolean 
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onDrop(Array.from(files))
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".epub,.zip"
        onChange={handleChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
        style={{ 
          backgroundColor: 'var(--color-accent)',
          color: 'white',
        }}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        Add book
      </button>
    </>
  )
}

function EmptyLibrary({ 
  onDrop, 
  uploading 
}: { 
  onDrop: (files: File[]) => void
  uploading: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onDrop(Array.from(files))
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,.zip"
        onChange={handleChange}
        className="hidden"
      />
      <div 
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ backgroundColor: 'var(--color-surface-elevated)' }}
      >
        <BookOpen className="w-10 h-10" style={{ color: 'var(--color-text-muted)' }} />
      </div>
      <h2 
        className="text-xl font-semibold mb-2"
        style={{ color: 'var(--color-text)' }}
      >
        Your library is empty
      </h2>
      <p 
        className="mb-6 text-center max-w-md"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Upload your first ePub to start speed reading. Drag and drop anywhere or click below.
      </p>
      <button
        onClick={handleClick}
        disabled={uploading}
        className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50"
        style={{ 
          backgroundColor: 'var(--color-accent)',
          color: 'white',
        }}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Upload className="w-5 h-5" />
        )}
        Upload ePub
      </button>
    </div>
  )
}

function BookCard({ 
  book, 
  progress, 
  onClick 
}: { 
  book: Book
  progress: number
  onClick: () => void 
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
    >
      {/* Cover */}
      <div 
        className="aspect-[2/3] rounded-lg mb-3 overflow-hidden relative"
        style={{ backgroundColor: 'var(--color-surface-elevated)' }}
      >
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.warn('[Library] Cover image failed to load:', book.coverUrl)
              // Hide the broken image and show fallback
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            <span 
              className="text-center font-medium text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {book.title}
            </span>
          </div>
        )}
        
        {/* Progress bar */}
        {progress > 0 && (
          <div 
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          >
            <div 
              className="h-full transition-all"
              style={{ 
                width: `${progress}%`,
                backgroundColor: 'var(--color-accent)',
              }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <h3 
        className="font-medium text-sm line-clamp-2 mb-1"
        style={{ color: 'var(--color-text)' }}
      >
        {book.title}
      </h3>
      {book.author && (
        <p 
          className="text-xs line-clamp-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {book.author}
        </p>
      )}
      {progress > 0 && (
        <p 
          className="text-xs mt-1"
          style={{ color: 'var(--color-accent)' }}
        >
          {progress}% complete
        </p>
      )}
    </button>
  )
}

