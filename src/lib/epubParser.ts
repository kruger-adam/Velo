import ePub from 'epubjs'

export interface Chapter {
  title: string
  wordIndex: number  // Starting word index for this chapter
}

export interface ParsedBook {
  title: string
  author: string | null
  coverUrl: string | null
  words: string[]
  chapters: Chapter[]
}

export async function parseEpub(file: File): Promise<ParsedBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const book = ePub(arrayBuffer)
        
        await book.ready
        
        // Get metadata
        const metadata = await book.loaded.metadata
        const title = metadata.title || 'Untitled'
        const author = metadata.creator || null
        
        // Get cover
        let coverUrl: string | null = null
        try {
          const cover = await book.coverUrl()
          console.log('[epubParser] Cover URL from epub:', cover ? cover.substring(0, 100) + '...' : 'null')
          if (cover) {
            coverUrl = cover
          }
        } catch (coverErr) {
          console.log('[epubParser] Cover not available:', coverErr)
        }
        
        // Extract all text content using epub.js section API
        const words: string[] = []
        const chapters: Chapter[] = []
        
        // Get spine items - epub.js uses spineItems array
        const spine = book.spine as unknown as { 
          spineItems: Array<{ href: string; index: number }>,
          each: (callback: (section: { load: (book: unknown) => Promise<{ document: Document }> }) => void) => void
        }
        
        console.log('[epubParser] Spine items:', spine?.spineItems?.length)
        
        // Use book.section() to load each section by index
        for (let i = 0; i < (spine?.spineItems?.length || 0); i++) {
          try {
            const section = book.section(i)
            if (!section) {
              console.log('[epubParser] No section at index', i)
              continue
            }
            
            console.log('[epubParser] Loading section', i, section)
            const contents = await section.load(book.load.bind(book))
            console.log('[epubParser] Section contents:', contents)
            
            // contents could be an Element (html element) or have a document property
            // Cast to any to handle epub.js's dynamic return types
            const contentsAny = contents as unknown as Element | { document?: Document }
            let textContent = ''
            let chapterTitle = ''
            
            // Try as Element first (querySelector approach)
            if ('querySelector' in contentsAny && typeof contentsAny.querySelector === 'function') {
              const body = contentsAny.querySelector('body')
              textContent = body?.textContent || (contentsAny as Element).textContent || ''
              
              // Try to extract chapter title from headings
              const h1 = contentsAny.querySelector('h1')
              const h2 = contentsAny.querySelector('h2')
              const h3 = contentsAny.querySelector('h3')
              // Also try common title class patterns
              const titleEl = contentsAny.querySelector('.chapter-title, .title, [class*="chapter"], [class*="heading"]')
              
              // Get the primary heading
              const primaryHeading = (h1?.textContent || h2?.textContent || h3?.textContent || titleEl?.textContent || '').trim()
              chapterTitle = primaryHeading
              
              // If heading is short (like "1", "2", "PART ONE"), look for a subtitle in the next sibling or h2
              if (primaryHeading.length > 0 && primaryHeading.length < 15) {
                // Check if there's a subtitle heading (e.g., h1 = "1", h2 = "Addiction, Straight Up")
                let subtitleEl = null
                if (h1 && h2 && h1.textContent?.trim() === primaryHeading) {
                  subtitleEl = h2
                } else if (h2 && h3 && h2.textContent?.trim() === primaryHeading) {
                  subtitleEl = h3
                }
                
                // Also check for subtitle class patterns
                if (!subtitleEl) {
                  subtitleEl = contentsAny.querySelector('.subtitle, .chapter-subtitle, [class*="subtitle"]')
                }
                
                const subtitle = subtitleEl?.textContent?.trim()
                if (subtitle && subtitle.length > 2 && subtitle.length < 80 && !subtitle.endsWith('.')) {
                  chapterTitle = `${primaryHeading} ${subtitle}`
                }
              }
              
              // If still no title, use the first non-empty text line (often the chapter name)
              if (!chapterTitle && textContent) {
                const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
                if (lines.length > 0) {
                  // Use first line if it looks like a title (short, no periods)
                  const firstLine = lines[0]
                  if (firstLine.length > 0 && firstLine.length < 80 && !firstLine.includes('.')) {
                    chapterTitle = firstLine
                    
                    // If title is very short (like just "1" or "2"), try to get subtitle from next lines
                    if (firstLine.length < 15 && lines.length > 1) {
                      // Look for a subtitle in the next few lines
                      for (let lineIdx = 1; lineIdx < Math.min(lines.length, 4); lineIdx++) {
                        const nextLine = lines[lineIdx]
                        // Good subtitle: reasonably short, no periods at end, not just numbers
                        if (nextLine.length > 2 && nextLine.length < 80 && 
                            !nextLine.endsWith('.') && !/^\d+$/.test(nextLine)) {
                          chapterTitle = `${firstLine} ${nextLine}`
                          break
                        }
                      }
                    }
                  }
                }
              }
              
              console.log('[epubParser] Found body via querySelector:', !!body)
            } else if ('document' in contentsAny && contentsAny.document) {
              // Has document property
              textContent = contentsAny.document.body?.textContent || ''
              const h1 = contentsAny.document.querySelector('h1')
              chapterTitle = (h1?.textContent || '').trim()
              
              // Fallback to first line
              if (!chapterTitle && textContent) {
                const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
                if (lines.length > 0 && lines[0].length < 80 && !lines[0].includes('.')) {
                  chapterTitle = lines[0]
                  
                  // If title is very short, try to get subtitle from next lines
                  if (lines[0].length < 15 && lines.length > 1) {
                    for (let lineIdx = 1; lineIdx < Math.min(lines.length, 4); lineIdx++) {
                      const nextLine = lines[lineIdx]
                      if (nextLine.length > 2 && nextLine.length < 80 && 
                          !nextLine.endsWith('.') && !/^\d+$/.test(nextLine)) {
                        chapterTitle = `${lines[0]} ${nextLine}`
                        break
                      }
                    }
                  }
                }
              }
              console.log('[epubParser] Found body via document property')
            } else if ('body' in contentsAny) {
              // Might be a Document directly
              textContent = (contentsAny as unknown as Document).body?.textContent || ''
              console.log('[epubParser] Found body directly')
            }
            
            console.log('[epubParser] Text content length:', textContent.length)
            console.log('[epubParser] Text preview:', textContent.slice(0, 100))
            
            // Split into words, cleaning up whitespace
            const itemWords = textContent
              .replace(/\s+/g, ' ')
              .trim()
              .split(' ')
              .filter(word => word.length > 0)
            
            // Add chapter if we found a meaningful title and it has content
            if (chapterTitle && itemWords.length > 0) {
              // Clean up the title
              chapterTitle = chapterTitle.replace(/\s+/g, ' ').trim()
              if (chapterTitle.length > 0 && chapterTitle.length < 100) {
                chapters.push({
                  title: chapterTitle,
                  wordIndex: words.length  // Current word count is the starting index
                })
                console.log('[epubParser] Found chapter:', chapterTitle, 'at word index:', words.length)
              }
            }
            
            console.log('[epubParser] Words from section', i, ':', itemWords.length)
            words.push(...itemWords)
          } catch (sectionErr) {
            console.error('[epubParser] Error loading section', i, ':', sectionErr)
          }
        }
        
        console.log('[epubParser] Total words extracted:', words.length)
        console.log('[epubParser] Chapters found:', chapters.length, chapters.map(c => c.title))
        
        resolve({
          title,
          author,
          coverUrl,
          words,
          chapters,
        })
      } catch (err) {
        reject(err)
      }
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Calculate the Optimal Recognition Point (ORP) for a word.
 * The ORP is typically around 30% into the word, on the left side.
 * This is where the eye naturally focuses for fastest recognition.
 */
export function getORP(word: string): number {
  const len = word.length
  if (len <= 1) return 0
  if (len <= 3) return 1
  if (len <= 5) return 1
  if (len <= 9) return 2
  if (len <= 13) return 3
  return Math.floor(len * 0.3)
}

/**
 * Split a word into three parts for ORP highlighting:
 * - before: characters before the ORP
 * - orp: the ORP character (highlighted)
 * - after: characters after the ORP
 */
export function splitWordByORP(word: string): { before: string; orp: string; after: string } {
  const orpIndex = getORP(word)
  return {
    before: word.slice(0, orpIndex),
    orp: word[orpIndex] || '',
    after: word.slice(orpIndex + 1),
  }
}

/**
 * Format time in minutes and seconds
 */
export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
}

/**
 * Calculate estimated reading time
 */
export function estimateReadingTime(wordsRemaining: number, wpm: number): string {
  if (wordsRemaining <= 0) return '0s'
  const seconds = (wordsRemaining / wpm) * 60
  return formatTime(seconds)
}

