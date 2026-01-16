// Sample books that are pre-loaded for new users
// These files should be placed in /public/sample-books/
// The ePub files are shared (not copied per user), only DB entries are created

export interface SampleBookConfig {
  id: string // Unique ID for this sample book
  fileName: string // File name in /public/sample-books/
  title: string
  author: string
  openLibraryCoverId?: string // Open Library cover ID for free cover images
}

export const SAMPLE_BOOKS: SampleBookConfig[] = [
  {
    id: 'alice-in-wonderland',
    fileName: 'alice-in-wonderland.epub',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    openLibraryCoverId: '8479576', // https://covers.openlibrary.org/b/id/8479576-M.jpg
  },
  {
    id: 'pride-and-prejudice',
    fileName: 'pride-and-prejudice.epub',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    openLibraryCoverId: '8235582',
  },
  {
    id: 'romeo-and-juliet',
    fileName: 'romeo-and-juliet.epub',
    title: 'Romeo and Juliet',
    author: 'William Shakespeare',
    openLibraryCoverId: '8509879',
  },
  {
    id: 'crime-and-punishment',
    fileName: 'crime-and-punishment.epub',
    title: 'Crime and Punishment',
    author: 'Fyodor Dostoevsky',
    openLibraryCoverId: '8406786',
  },
  {
    id: 'moby-dick',
    fileName: 'moby-dick.epub',
    title: 'Moby Dick',
    author: 'Herman Melville',
    openLibraryCoverId: '8228664',
  },
  {
    id: 'the-great-gatsby',
    fileName: 'the-great-gatsby.epub',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    openLibraryCoverId: '8225138',
  },
  {
    id: 'frankenstein',
    fileName: 'frankenstein.epub',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    openLibraryCoverId: '6788256',
  },
]

// Get Open Library cover URL for a sample book
export function getOpenLibraryCoverUrl(coverId: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
}

// Helper to get the public URL for a sample book
export function getSampleBookUrl(fileName: string): string {
  return `/sample-books/${fileName}`
}

// Check if a book is a sample book (stored in public folder, not Supabase)
export function isSampleBook(filePath: string | undefined): boolean {
  return filePath?.startsWith('sample://') ?? false
}

// Get the actual URL for a sample book from its file path
export function getSampleBookPath(filePath: string): string {
  // filePath format: "sample://alice-in-wonderland.epub"
  const fileName = filePath.replace('sample://', '')
  return `/sample-books/${fileName}`
}
