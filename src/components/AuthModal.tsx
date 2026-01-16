import React, { useState } from 'react'
import { X, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface AuthModalProps {
  mode: 'signin' | 'signup'
  onClose: () => void
  onSwitchMode: (mode: 'signin' | 'signup') => void
}

export default function AuthModal({ mode, onClose, onSwitchMode }: AuthModalProps) {
  const { signIn, signUp, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (showResetPassword) {
      const { error } = await resetPassword(email)
      if (error) {
        setError(error.message)
      } else {
        setResetSent(true)
      }
      setLoading(false)
      return
    }

    const { error } = mode === 'signup' 
      ? await signUp(email, password)
      : await signIn(email, password)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (mode === 'signup') {
      // Show success message for signup
      setSignupSuccess(true)
      setLoading(false)
    } else {
      // Sign in successful - close modal
      onClose()
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-2xl p-8 relative"
        style={{ backgroundColor: 'var(--color-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg transition-colors hover:opacity-70"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X className="w-5 h-5" />
        </button>

        {signupSuccess ? (
          <>
            <div className="text-center py-4">
              <div 
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
              >
                <span className="text-3xl">✉️</span>
              </div>
              <h2 
                className="text-2xl font-bold mb-2"
                style={{ color: 'var(--color-text)' }}
              >
                Check your email
              </h2>
              <p 
                className="mb-6"
                style={{ color: 'var(--color-text-muted)' }}
              >
                We sent a confirmation link to <strong style={{ color: 'var(--color-text)' }}>{email}</strong>. 
                Click the link to activate your account.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-lg font-medium transition-all"
              style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
            >
              Got it
            </button>
          </>
        ) : (
          <>
            <h2 
              className="text-2xl font-bold mb-2"
              style={{ color: 'var(--color-text)' }}
            >
              {showResetPassword 
                ? 'Reset password' 
                : mode === 'signup' 
                  ? 'Create your account' 
                  : 'Welcome back'}
            </h2>
            <p 
              className="mb-6"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {showResetPassword
                ? "Enter your email and we'll send you a reset link"
                : mode === 'signup' 
                  ? 'Sign up to save your books and reading progress'
                  : 'Sign in to access your library'
              }
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="email" 
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--color-text)' }}
            >
              Email
            </label>
            <div className="relative">
              <Mail 
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: 'var(--color-text-muted)' }}
              />
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full pl-11 pr-4 py-3 rounded-lg border transition-colors"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          </div>

          {!showResetPassword && (
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--color-text)' }}
              >
                Password
              </label>
              <div className="relative">
                <Lock 
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                  style={{ color: 'var(--color-text-muted)' }}
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full pl-11 pr-11 py-3 rounded-lg border transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--color-text-muted)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'signin' && !showResetPassword && (
            <button
              type="button"
              onClick={() => setShowResetPassword(true)}
              className="text-sm hover:underline"
              style={{ color: 'var(--color-accent)' }}
            >
              Forgot password?
            </button>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {resetSent ? (
            <div 
              className="py-3 px-4 rounded-lg text-center"
              style={{ backgroundColor: 'var(--color-surface-elevated)' }}
            >
              <p style={{ color: 'var(--color-text)' }}>
                ✓ Reset link sent! Check your email.
              </p>
            </div>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : showResetPassword ? (
                'Send reset link'
              ) : (
                mode === 'signup' ? 'Create account' : 'Sign in'
              )}
            </button>
          )}
        </form>

        <p 
          className="mt-6 text-center text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {showResetPassword ? (
            <button
              onClick={() => { setShowResetPassword(false); setResetSent(false); setError(null); }}
              className="font-medium hover:underline"
              style={{ color: 'var(--color-accent)' }}
            >
              ← Back to sign in
            </button>
          ) : (
            <>
              {mode === 'signup' ? "Already have an account? " : "Don't have an account? "}
              <button
                onClick={() => onSwitchMode(mode === 'signup' ? 'signin' : 'signup')}
                className="font-medium hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                {mode === 'signup' ? 'Sign in' : 'Sign up'}
              </button>
            </>
          )}
        </p>
          </>
        )}
      </div>
    </div>
  )
}

