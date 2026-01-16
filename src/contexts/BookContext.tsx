import React, { createContext, useContext, useState, useCallback } from 'react'
import JSZip from 'jszip'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { parseEpub } from '../lib/epubParser'

// Helper to extract .epub from .zip files
async function extractEpubFromZip(file: File): Promise<File> {
  // Check if it's a .zip file (not already an epub)
  const isZip = file.name.toLowerCase().endsWith('.zip')
  
  if (!isZip) {
    return file // Already an epub, return as-is
  }
  
  console.log('[Upload] Detected .zip file, extracting ePub...')
  
  const zip = await JSZip.loadAsync(file)
  
  // Find .epub file inside the zip
  let epubFileName: string | null = null
  let epubFile: JSZip.JSZipObject | null = null
  
  zip.forEach((relativePath, zipEntry) => {
    if (relativePath.toLowerCase().endsWith('.epub') && !zipEntry.dir) {
      epubFileName = relativePath
      epubFile = zipEntry
    }
  })
  
  if (!epubFile || !epubFileName) {
    throw new Error('No .epub file found inside the zip archive')
  }
  
  console.log('[Upload] Found ePub in zip:', epubFileName)
  
  // Extract the epub as a blob
  const epubBlob = await epubFile.async('blob')
  
  // Create a new File object with the correct name
  const extractedFile = new File([epubBlob], epubFileName, { type: 'application/epub+zip' })
  
  console.log('[Upload] Extracted ePub:', { name: extractedFile.name, size: `${(extractedFile.size / 1024 / 1024).toFixed(2)} MB` })
  
  return extractedFile
}

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
    const startTime = performance.now()

    try {
      console.log('[Upload] Starting upload:', { fileName: file.name, fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB` })
      
      // Step 0: Extract from zip if needed
      let epubFile = file
      if (file.name.toLowerCase().endsWith('.zip')) {
        const extractStart = performance.now()
        epubFile = await extractEpubFromZip(file)
        console.log('[Upload] Zip extraction complete in', Math.round(performance.now() - extractStart), 'ms')
      }
      
      // Step 1: Parse ePub
      const parseStart = performance.now()
      console.log('[Upload] Step 1/4: Parsing ePub...')
      const parsed = await parseEpub(epubFile)
      console.log('[Upload] Step 1/4: Parsing complete in', Math.round(performance.now() - parseStart), 'ms', {
        title: parsed.title,
        wordsCount: parsed.words.length,
        hasCover: !!parsed.coverUrl,
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
        console.log('[Upload] Trial mode complete in', Math.round(performance.now() - startTime), 'ms')
        return book
      }

      // Signed-in: upload to Supabase
      if (!user) throw new Error('Not authenticated')

      const filePath = `${user.id}/${Date.now()}-${epubFile.name}`
      
      // Step 2: Upload file to storage
      const uploadStart = performance.now()
      console.log('[Upload] Step 2/4: Uploading ePub to storage...')
      const { error: uploadError } = await supabase.storage
        .from('books')
        .upload(filePath, epubFile)
      console.log('[Upload] Step 2/4: File upload complete in', Math.round(performance.now() - uploadStart), 'ms')

      if (uploadError) {
        console.error('[Upload] File upload failed:', uploadError)
        throw uploadError
      }

      // Step 3: Upload cover if exists
      let coverUrl = null
      if (parsed.coverUrl) {
        const coverStart = performance.now()
        console.log('[Upload] Step 3/4: Uploading cover...')
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
        } else {
          console.warn('[Upload] Cover upload failed (non-fatal):', coverError)
        }
        console.log('[Upload] Step 3/4: Cover upload complete in', Math.round(performance.now() - coverStart), 'ms')
      } else {
        console.log('[Upload] Step 3/4: No cover to upload, skipping')
      }

      // Step 4: Insert book metadata
      const dbStart = performance.now()
      console.log('[Upload] Step 4/4: Saving to database...')
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
      console.log('[Upload] Step 4/4: Database save complete in', Math.round(performance.now() - dbStart), 'ms')

      if (dbError) {
        console.error('[Upload] Database insert failed:', dbError)
        throw dbError
      }

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
      console.log('[Upload] ✓ Upload complete! Total time:', Math.round(performance.now() - startTime), 'ms')
      return book
    } catch (err) {
      console.error('[Upload] ✗ Upload failed after', Math.round(performance.now() - startTime), 'ms:', err)
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

