import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import JSZip from 'jszip'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { parseEpub } from '../lib/epubParser'
import { SAMPLE_BOOKS, isSampleBook, getSampleBookPath, getSampleBookCoverUrl } from '../lib/sampleBooks'

// Helper to extract .epub from .zip files
async function extractEpubFromZip(file: File): Promise<File> {
  // Check if it's a .zip file (not already an epub)
  const isZip = file.name.toLowerCase().endsWith('.zip')
  
  if (!isZip) {
    return file // Already an epub, return as-is
  }
  
  console.log('[Upload] Detected .zip file, extracting ePub...')
  
  const zip = await JSZip.loadAsync(file)
  
  // Find .epub file inside the zip using Object.keys instead of forEach
  const fileNames = Object.keys(zip.files)
  console.log('[Upload] Files in zip:', fileNames.length, 'files')
  
  // Case 1: Look for an actual .epub file inside the zip
  let epubFileName = fileNames.find(name => 
    name.toLowerCase().endsWith('.epub') && !zip.files[name].dir
  )
  
  if (epubFileName) {
    console.log('[Upload] Found ePub file in zip:', epubFileName)
    const epubBlob = await zip.files[epubFileName].async('blob')
    return new File([epubBlob], epubFileName, { type: 'application/epub+zip' })
  }
  
  // Case 2: Check if the zip contains an EXTRACTED epub folder (folder ending in .epub/)
  const epubFolder = fileNames.find(name => 
    name.toLowerCase().endsWith('.epub/') && zip.files[name].dir
  )
  
  if (epubFolder) {
    console.log('[Upload] Found extracted ePub folder:', epubFolder, '- repackaging...')
    
    // Create a new zip with the contents of the epub folder
    const newZip = new JSZip()
    const folderPrefix = epubFolder
    
    for (const fileName of fileNames) {
      if (fileName.startsWith(folderPrefix) && fileName !== folderPrefix) {
        const relativePath = fileName.slice(folderPrefix.length)
        if (relativePath && !zip.files[fileName].dir) {
          const content = await zip.files[fileName].async('blob')
          newZip.file(relativePath, content)
        }
      }
    }
    
    // Generate the epub as a blob
    const epubBlob = await newZip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
    const epubName = epubFolder.slice(0, -1) // Remove trailing slash
    console.log('[Upload] Repackaged ePub:', epubName)
    return new File([epubBlob], epubName, { type: 'application/epub+zip' })
  }
  
  // Case 3: The zip might BE an epub (epub files are zip files internally)
  const hasEpubStructure = fileNames.some(name => 
    name === 'mimetype' || name.startsWith('META-INF/') || name.startsWith('OEBPS/')
  )
  
  if (hasEpubStructure) {
    console.log('[Upload] Zip appears to be an ePub file directly (has epub internal structure)')
    const epubName = file.name.replace(/\.zip$/i, '')
    return new File([file], epubName, { type: 'application/epub+zip' })
  }
  
  throw new Error('No .epub file found inside the zip archive. Files found: ' + fileNames.slice(0, 5).join(', '))
}

export interface Chapter {
  title: string
  wordIndex: number
}

export interface Book {
  id: string
  title: string
  author: string | null
  coverUrl: string | null
  totalWords: number
  words: string[]
  chapters: Chapter[]
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
  deleteBook: (bookId: string) => Promise<boolean>
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
  const addingSampleBookRef = useRef(false)

  // Helper to add sample books for new users (no file copying, just DB entries)
  const addSampleBooks = useCallback(async (): Promise<Book[]> => {
    if (!user) return []
    
    // Synchronous check first (prevents race conditions)
    if (addingSampleBookRef.current) {
      console.log('[BookContext] Already adding sample books, skipping')
      return []
    }
    
    // Prevent duplicate additions using localStorage flag
    const sampleBookKey = `velo-sample-added-${user.id}`
    if (localStorage.getItem(sampleBookKey)) {
      console.log('[BookContext] Sample books already added for this user')
      return []
    }
    
    // Mark as adding immediately (synchronous)
    addingSampleBookRef.current = true
    localStorage.setItem(sampleBookKey, 'true')
    
    try {
      console.log('[BookContext] Adding sample books for new user...')
      
      const addedBooks: Book[] = []
      
      for (const sampleBook of SAMPLE_BOOKS) {
        // Fetch and parse to get word count (we need this for progress tracking)
        const response = await fetch(`/sample-books/${sampleBook.fileName}`)
        if (!response.ok) continue
        
        const blob = await response.blob()
        const file = new File([blob], sampleBook.fileName, { type: 'application/epub+zip' })
        const parsed = await parseEpub(file)
        
        // Create DB entry pointing to shared file (no upload needed!)
        const { data: bookData, error: dbError } = await supabase
          .from('books')
          .insert({
            user_id: user.id,
            title: sampleBook.title,
            author: sampleBook.author,
            file_path: `sample://${sampleBook.fileName}`, // Special prefix for sample books
            cover_url: getSampleBookCoverUrl(sampleBook.id), // Local static cover
            total_words: parsed.words.length,
          })
          .select()
          .single()
        
        if (dbError) {
          console.error('[BookContext] Failed to add sample book:', sampleBook.title, dbError)
          continue
        }
        
        addedBooks.push({
          id: bookData.id,
          title: bookData.title,
          author: bookData.author,
          coverUrl: bookData.cover_url,
          totalWords: bookData.total_words,
          words: [],
          chapters: [],
          filePath: bookData.file_path,
        })
      }
      
      console.log('[BookContext] Sample books added:', addedBooks.length)
      return addedBooks
    } catch (err) {
      console.error('[BookContext] Failed to add sample books:', err)
      // Clear the flags so it can be retried
      addingSampleBookRef.current = false
      localStorage.removeItem(`velo-sample-added-${user.id}`)
      return []
    }
  }, [user])

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
      let loadedBooks: Book[] = (data || []).map(book => {
        console.log('[BookContext] Loaded book:', { title: book.title, cover_url: book.cover_url })
        return {
          id: book.id,
          title: book.title,
          author: book.author,
          coverUrl: book.cover_url,
          totalWords: book.total_words,
          words: [], // Words loaded on demand when opening the book
          chapters: [], // Chapters loaded on demand when opening the book
          filePath: book.file_path,
        }
      })

      // If new user with no books, add sample books as starters
      if (loadedBooks.length === 0) {
        const sampleBooks = await addSampleBooks()
        if (sampleBooks.length > 0) {
          loadedBooks = sampleBooks
        }
      }

      setBooks(loadedBooks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books')
    } finally {
      setLoading(false)
    }
  }, [user, addSampleBooks])

  const uploadBook = useCallback(async (file: File): Promise<Book | null> => {
    setLoading(true)
    setError(null)
    const startTime = performance.now()

    // Limits
    const MAX_FILE_SIZE_MB = 10
    const MAX_BOOKS_PER_USER = 5

    try {
      console.log('[Upload] Starting upload:', { fileName: file.name, fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB` })
      
      // Check file size limit
      const fileSizeMB = file.size / 1024 / 1024
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        throw new Error(`File too large (${fileSizeMB.toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`)
      }

      // Check book count limit (only for signed-in users, sample books don't count)
      const userUploadedBooks = books.filter(b => !isSampleBook(b.filePath))
      if (user && userUploadedBooks.length >= MAX_BOOKS_PER_USER) {
        throw new Error(`Library full. You can upload up to ${MAX_BOOKS_PER_USER} books. Delete a book to add more.`)
      }
      
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
          chapters: parsed.chapters,
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
        console.log('[Upload] Step 3/4: Uploading cover...', { sourceCoverUrl: parsed.coverUrl.substring(0, 100) })
        try {
          const coverResponse = await fetch(parsed.coverUrl)
          console.log('[Upload] Cover fetch response:', { ok: coverResponse.ok, status: coverResponse.status, type: coverResponse.type })
          const coverBlob = await coverResponse.blob()
          console.log('[Upload] Cover blob:', { size: coverBlob.size, type: coverBlob.type })
          
          // Determine correct extension based on blob type
          const ext = coverBlob.type.includes('png') ? 'png' : coverBlob.type.includes('gif') ? 'gif' : 'jpg'
          const coverPath = `${user.id}/${Date.now()}-cover.${ext}`
          
          const { error: coverError } = await supabase.storage
            .from('books')
            .upload(coverPath, coverBlob, { contentType: coverBlob.type })
          
          if (!coverError) {
            const { data: urlData } = supabase.storage
              .from('books')
              .getPublicUrl(coverPath)
            coverUrl = urlData.publicUrl
            console.log('[Upload] Cover public URL:', coverUrl)
          } else {
            console.warn('[Upload] Cover upload failed (non-fatal):', coverError)
          }
        } catch (coverFetchErr) {
          console.warn('[Upload] Cover fetch failed:', coverFetchErr)
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
        chapters: parsed.chapters,
        filePath: bookData.file_path,
      }

      setBooks(prev => [book, ...prev])
      console.log('[Upload] ✓ Upload complete! Total time:', Math.round(performance.now() - startTime), 'ms')
      return book
    } catch (err) {
      console.error('[Upload] ✗ Upload failed after', Math.round(performance.now() - startTime), 'ms:', err)
      
      // Provide user-friendly error messages
      let errorMessage = 'Failed to upload book'
      if (err instanceof Error) {
        if (err.message.includes('No .epub file found')) {
          errorMessage = 'No ePub file found in the zip. Please upload a valid ePub file.'
        } else if (err.message.includes('Failed to parse')) {
          errorMessage = 'Unable to read this ePub file. It may be corrupted or in an unsupported format.'
        } else if (err.message.includes('Not authenticated')) {
          errorMessage = 'Please sign in to upload books.'
        } else if (err.message.includes('storage') || err.message.includes('upload')) {
          errorMessage = 'Failed to save the book. Please try again.'
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.'
        } else {
          errorMessage = err.message
        }
      }
      
      setError(errorMessage)
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
      if (book.words.length === 0 && book.filePath) {
        console.log('[BookContext] Loading words from storage...')
        
        let file: File
        
        // Check if this is a sample book (stored in public folder)
        if (isSampleBook(book.filePath)) {
          const publicPath = getSampleBookPath(book.filePath)
          console.log('[BookContext] Loading sample book from:', publicPath)
          const response = await fetch(publicPath)
          if (!response.ok) throw new Error('Failed to load sample book')
          const blob = await response.blob()
          file = new File([blob], 'book.epub')
        } else if (user) {
          // Regular book from Supabase storage
          const { data, error } = await supabase.storage
            .from('books')
            .download(book.filePath)
          
          if (error) throw error
          file = new File([data], 'book.epub')
        } else {
          throw new Error('Not authenticated')
        }
        
        const parsed = await parseEpub(file)
        console.log('[BookContext] Loaded words from storage:', parsed.words.length, 'chapters:', parsed.chapters.length)
        book = { ...book, words: parsed.words, totalWords: parsed.words.length, chapters: parsed.chapters }
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

  const deleteBook = useCallback(async (bookId: string): Promise<boolean> => {
    if (!user) return false

    try {
      // Find the book to get its file path
      const bookToDelete = books.find(b => b.id === bookId)
      if (!bookToDelete) return false

      // Delete from storage first (if file path exists)
      if (bookToDelete.filePath) {
        const { error: storageError } = await supabase.storage
          .from('books')
          .remove([bookToDelete.filePath])
        
        if (storageError) {
          console.warn('[BookContext] Error deleting file from storage:', storageError)
        }
      }

      // Delete reading progress
      await supabase
        .from('reading_progress')
        .delete()
        .eq('book_id', bookId)
        .eq('user_id', user.id)

      // Delete book record from database
      const { error: dbError } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId)
        .eq('user_id', user.id)

      if (dbError) {
        console.error('[BookContext] Error deleting book:', dbError)
        return false
      }

      // Update local state
      setBooks(prev => prev.filter(b => b.id !== bookId))
      
      // Clear current book if it was deleted
      if (currentBook?.id === bookId) {
        setCurrentBook(null)
        setCurrentProgress(null)
      }

      console.log('[BookContext] Book deleted successfully:', bookId)
      return true
    } catch (err) {
      console.error('[BookContext] Failed to delete book:', err)
      return false
    }
  }, [user, books, currentBook])

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
        deleteBook,
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

