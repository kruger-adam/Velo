import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Zap, BookOpen, Eye, ArrowRight, List, Type, Moon } from 'lucide-react'
import { useBooks } from '../contexts/BookContext'
import AuthModal from './AuthModal'

interface LandingProps {
  onStartReading: () => void
}

export default function Landing({ onStartReading }: LandingProps) {
  const { uploadBook, loading, error, hasTrialBook } = useBooks()
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      if (hasTrialBook) {
        // Already has a trial book, prompt to sign up
        setAuthMode('signup')
        setShowAuth(true)
        return
      }
      const book = await uploadBook(file)
      if (book) {
        onStartReading()
      }
    }
  }, [uploadBook, onStartReading, hasTrialBook])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/epub+zip': ['.epub'],
      'application/zip': ['.zip'],
    },
    maxFiles: 1,
  })

  const handleSignUp = () => {
    setAuthMode('signup')
    setShowAuth(true)
  }

  const handleSignIn = () => {
    setAuthMode('signin')
    setShowAuth(true)
  }

  const handleTrySample = async () => {
    if (hasTrialBook) {
      setAuthMode('signup')
      setShowAuth(true)
      return
    }
    try {
      // Fetch the sample book from public folder
      const response = await fetch('/sample-books/alice-in-wonderland.epub')
      if (!response.ok) throw new Error('Sample book not found')
      const blob = await response.blob()
      const file = new File([blob], 'Alice in Wonderland.epub', { type: 'application/epub+zip' })
      const book = await uploadBook(file)
      if (book) {
        onStartReading()
      }
    } catch (err) {
      console.error('Failed to load sample book:', err)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Header */}
      <header className="px-6 pb-4 flex items-center justify-between border-b safe-top" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent)' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Velo</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSignIn}
            className="px-4 py-2 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Sign in
          </button>
          <button
            onClick={handleSignUp}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
            style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
          >
            Sign up
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 
            className="text-5xl md:text-6xl font-bold mb-6 tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
          >
            Read faster with
            <span style={{ color: 'var(--color-accent)' }}> RSVP</span>
          </h1>
          <p 
            className="text-xl md:text-2xl mb-8 leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Rapid Serial Visual Presentation displays one word at a time at your 
            chosen speed, eliminating eye movement and dramatically increasing 
            reading speed.
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-16">
          <FeatureCard
            icon={<Upload className="w-5 h-5" />}
            title="Upload"
            description="Drop any ePub or zip file"
          />
          <FeatureCard
            icon={<Eye className="w-5 h-5" />}
            title="Focus"
            description="One word at a time, ORP highlighted"
          />
          <FeatureCard
            icon={<Zap className="w-5 h-5" />}
            title="Speed"
            description="100 to 1000 words per minute"
          />
          <FeatureCard
            icon={<List className="w-5 h-5" />}
            title="Chapters"
            description="Jump to any chapter instantly"
          />
          <FeatureCard
            icon={<Type className="w-5 h-5" />}
            title="Font Size"
            description="Adjust text size to your preference"
          />
          <FeatureCard
            icon={<Moon className="w-5 h-5" />}
            title="Dark Mode"
            description="Easy on the eyes, day or night"
          />
        </div>

        {/* Demo Word Display */}
        <div 
          className="mb-12 py-8 px-16 rounded-2xl"
          style={{ backgroundColor: 'var(--color-surface-elevated)' }}
        >
          <div className="flex items-center justify-center" style={{ fontFamily: 'var(--font-mono)' }}>
            <span className="text-4xl md:text-5xl" style={{ color: 'var(--color-text)' }}>re</span>
            <span className="text-4xl md:text-5xl font-bold" style={{ color: 'var(--color-orp)' }}>a</span>
            <span className="text-4xl md:text-5xl" style={{ color: 'var(--color-text)' }}>ding</span>
          </div>
          <p className="text-center mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            The highlighted letter is the optimal recognition point
          </p>
        </div>

        {/* Upload Zone */}
        <div className="w-full max-w-xl">
          <div
            {...getRootProps()}
            className={`
              relative p-12 rounded-2xl border-2 border-dashed cursor-pointer
              transition-all duration-200 ease-out
              ${isDragActive ? 'scale-[1.02]' : 'hover:scale-[1.01]'}
            `}
            style={{
              borderColor: isDragActive ? 'var(--color-accent)' : 'var(--color-border)',
              backgroundColor: isDragActive ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
            }}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center text-center">
              {loading ? (
                <>
                  <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mb-4" 
                    style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                  <p style={{ color: 'var(--color-text)' }}>Processing your book...</p>
                </>
              ) : (
                <>
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                    style={{ backgroundColor: 'var(--color-surface-elevated)' }}
                  >
                    <Upload className="w-8 h-8" style={{ color: 'var(--color-accent)' }} />
                  </div>
                  <p className="text-lg font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                    {isDragActive ? 'Drop your ePub here' : 'Try it free — drop an ePub'}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    or click to browse
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>

          {/* Try sample book button */}
          <button
            onClick={handleTrySample}
            disabled={loading}
            className="w-full py-4 px-6 rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
            style={{ 
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          >
            <BookOpen className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
            <span>Try with "Alice in Wonderland"</span>
            <ArrowRight className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>

          {/* Error message */}
          {error && (
            <div 
              className="mt-4 px-4 py-3 rounded-lg flex items-center gap-3"
              style={{ 
                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                borderColor: 'rgba(239, 68, 68, 0.3)',
                border: '1px solid',
              }}
            >
              <span className="text-red-500">⚠️</span>
              <p className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{error}</p>
            </div>
          )}

          {/* Trial notice */}
          <p className="text-center mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Trial mode: Your book stays in memory only. Sign up to save your progress.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleSignUp}
            className="group px-8 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
            style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
          >
            Create free account
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 text-center border-t" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Velo — Read at the speed of thought
        </p>
      </footer>

      {/* Auth Modal */}
      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onSwitchMode={(mode) => setAuthMode(mode)}
        />
      )}
    </div>
  )
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode
  title: string
  description: string 
}) {
  return (
    <div 
      className="p-4 rounded-xl"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <div 
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
        style={{ backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-accent)' }}
      >
        {icon}
      </div>
      <h3 className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {description}
      </p>
    </div>
  )
}

