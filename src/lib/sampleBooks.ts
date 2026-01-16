// Sample books that are pre-loaded for new users
// These files should be placed in /public/sample-books/
// The ePub files are shared (not copied per user), only DB entries are created

export interface SampleBookConfig {
  id: string // Unique ID for this sample book
  fileName: string // File name in /public/sample-books/
  title: string
  author: string
}

export const SAMPLE_BOOKS: SampleBookConfig[] = [
  {
    id: 'alice-in-wonderland',
    fileName: 'alice-in-wonderland.epub',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
  },
  // Add more sample books here:
  // {
  //   id: 'pride-and-prejudice',
  //   fileName: 'pride-and-prejudice.epub',
  //   title: 'Pride and Prejudice',
  //   author: 'Jane Austen',
  // },
]

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

