import React, { createContext, useContext, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { parseEpub } from '../lib/epubParser'

export interface Book {
  id: string
  title: string
  author: string | null
  coverUrl: string | null
  totalWords: number
  words: string[]
  filePath?: string
}

export interface ReadingProgress {
  bookId: string
  currentWordIndex: number
  wpm: number
}

interface BookContextType {
  books: Book[]
  trialBook: Book | null
  currentBook: Book | null
  currentProgress: ReadingProgress | null
  loading: boolean
  error: string | null
  uploadBook: (file: File) => Promise<Book | null>
  loadBooks: () => Promise<void>
  selectBook: (book: Book) => Promise<void>
  updateProgress: (wordIndex: number, wpm: number) => Promise<void>
  getProgress: (bookId: string) => Promise<ReadingProgress | null>
  clearTrialBook: () => void
  hasTrialBook: boolean
}

const BookContext = createContext<BookContextType | undefined>(undefined)

export function BookProvider({ children }: { children: React.ReactNode }) {
  const { user, isTrialMode } = useAuth()
  const [books, setBooks] = useState<Book[]>([])
  const [trialBook, setTrialBook] = useState<Book | null>(null)
  const [currentBook, setCurrentBook] = useState<Book | null>(null)
  const [currentProgress, setCurrentProgress] = useState<ReadingProgress | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBooks = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (fetchError) throw fetchError

      // For each book, we need to load it from storage to get the words
      const loadedBooks: Book[] = (data || []).map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        coverUrl: book.cover_url,
        totalWords: book.total_words,
        words: [], // Words loaded on demand when opening the book
        filePath: book.file_path,
      }))

      setBooks(loadedBooks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books')
    } finally {
      setLoading(false)
    }
  }, [user])

  const uploadBook = useCallback(async (file: File): Promise<Book | null> => {
    setLoading(true)
    setError(null)

    try {
      console.log('[BookContext] Parsing epub file:', file.name)
      const parsed = await parseEpub(file)
      console.log('[BookContext] Parsed result:', {
        title: parsed.title,
        author: parsed.author,
        wordsCount: parsed.words.length,
        firstWords: parsed.words.slice(0, 10),
      })
      
      if (isTrialMode) {
        // Trial mode: keep in memory only
        const book: Book = {
          id: `trial-${Date.now()}`,
          title: parsed.title,
          author: parsed.author,
          coverUrl: parsed.coverUrl,
          totalWords: parsed.words.length,
          words: parsed.words,
        }
        setTrialBook(book)
        setCurrentBook(book)
        setCurrentProgress({ bookId: book.id, currentWordIndex: 0, wpm: 300 })
        return book
      }

      // Signed-in: upload to Supabase
      if (!user) throw new Error('Not authenticated')

      const filePath = `${user.id}/${Date.now()}-${file.name}`
      
      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('books')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Upload cover if exists
      let coverUrl = null
      if (parsed.coverUrl) {
        // Convert base64 to blob and upload
        const coverResponse = await fetch(parsed.coverUrl)
        const coverBlob = await coverResponse.blob()
        const coverPath = `${user.id}/${Date.now()}-cover.jpg`
        
        const { error: coverError } = await supabase.storage
          .from('books')
          .upload(coverPath, coverBlob)
        
        if (!coverError) {
          const { data: urlData } = supabase.storage
            .from('books')
            .getPublicUrl(coverPath)
          coverUrl = urlData.publicUrl
        }
      }

      // Insert book metadata
      console.log('[BookContext] Inserting book with total_words:', parsed.words.length)
      const { data: bookData, error: dbError } = await supabase
        .from('books')
        .insert({
          user_id: user.id,
          title: parsed.title,
          author: parsed.author,
          cover_url: coverUrl,
          file_path: filePath,
          total_words: parsed.words.length,
        })
        .select()
        .single()

      console.log('[BookContext] Insert result:', { bookData, dbError })
      if (dbError) throw dbError

      const book: Book = {
        id: bookData.id,
        title: bookData.title,
        author: bookData.author,
        coverUrl: bookData.cover_url,
        totalWords: bookData.total_words,
        words: parsed.words,
        filePath: bookData.file_path,
      }

      setBooks(prev => [book, ...prev])
      return book
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload book')
      return null
    } finally {
      setLoading(false)
    }
  }, [user, isTrialMode])

  const selectBook = useCallback(async (book: Book) => {
    setLoading(true)
    console.log('[BookContext] selectBook called:', { 
      bookId: book.id, 
      title: book.title,
      totalWords: book.totalWords,
      wordsLength: book.words.length,
      filePath: book.filePath 
    })
    try {
      // If words aren't loaded, load them from storage
      if (book.words.length === 0 && book.filePath && user) {
        console.log('[BookContext] Loading words from storage...')
        const { data, error } = await supabase.storage
          .from('books')
          .download(book.filePath)
        
        if (error) throw error
        
        const file = new File([data], 'book.epub')
        const parsed = await parseEpub(file)
        console.log('[BookContext] Loaded words from storage:', parsed.words.length)
        book = { ...book, words: parsed.words, totalWords: parsed.words.length }
      }

      console.log('[BookContext] Setting currentBook:', { totalWords: book.totalWords, wordsLength: book.words.length })
      setCurrentBook(book)

      // Load progress
      if (user) {
        // Use maybeSingle() instead of single() to avoid 406 error when no row exists
        const { data: progressData, error: progressError } = await supabase
          .from('reading_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('book_id', book.id)
          .maybeSingle()

        if (progressError) {
          console.error('[BookContext] Error loading progress:', progressError)
        }

        if (progressData) {
          console.log('[BookContext] Loaded progress:', progressData)
          setCurrentProgress({
            bookId: book.id,
            currentWordIndex: progressData.current_word_index,
            wpm: progressData.wpm,
          })
        } else {
          console.log('[BookContext] No existing progress, starting fresh')
          setCurrentProgress({ bookId: book.id, currentWordIndex: 0, wpm: 300 })
        }
      } else {
        setCurrentProgress({ bookId: book.id, currentWordIndex: 0, wpm: 300 })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load book')
    } finally {
      setLoading(false)
    }
  }, [user])

  const updateProgress = useCallback(async (wordIndex: number, wpm: number) => {
    if (!currentBook) return

    setCurrentProgress(prev => prev ? { ...prev, currentWordIndex: wordIndex, wpm } : null)

    // Only persist for signed-in users
    if (user && !currentBook.id.startsWith('trial-')) {
      console.log('[BookContext] Saving progress:', { wordIndex, wpm, bookId: currentBook.id })
      const { error } = await supabase
        .from('reading_progress')
        .upsert({
          user_id: user.id,
          book_id: currentBook.id,
          current_word_index: wordIndex,
          wpm,
        }, { onConflict: 'user_id,book_id' })
      
      if (error) {
        console.error('[BookContext] Error saving progress:', error)
      } else {
        console.log('[BookContext] Progress saved successfully')
      }
    }
  }, [user, currentBook])

  const getProgress = useCallback(async (bookId: string): Promise<ReadingProgress | null> => {
    if (!user) return null

    const { data, error } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .maybeSingle()

    if (error) {
      console.error('[BookContext] Error getting progress:', error)
      return null
    }

    if (data) {
      return {
        bookId: data.book_id,
        currentWordIndex: data.current_word_index,
        wpm: data.wpm,
      }
    }
    return null
  }, [user])

  const clearTrialBook = useCallback(() => {
    setTrialBook(null)
    if (currentBook?.id.startsWith('trial-')) {
      setCurrentBook(null)
      setCurrentProgress(null)
    }
  }, [currentBook])

  return (
    <BookContext.Provider
      value={{
        books,
        trialBook,
        currentBook,
        currentProgress,
        loading,
        error,
        uploadBook,
        loadBooks,
        selectBook,
        updateProgress,
        getProgress,
        clearTrialBook,
        hasTrialBook: !!trialBook,
      }}
    >
      {children}
    </BookContext.Provider>
  )
}

export function useBooks() {
  const context = useContext(BookContext)
  if (context === undefined) {
    throw new Error('useBooks must be used within a BookProvider')
  }
  return context
}

