import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      books: {
        Row: {
          id: string
          user_id: string
          title: string
          author: string | null
          cover_url: string | null
          file_path: string
          total_words: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          author?: string | null
          cover_url?: string | null
          file_path: string
          total_words: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          author?: string | null
          cover_url?: string | null
          file_path?: string
          total_words?: number
          created_at?: string
          updated_at?: string
        }
      }
      reading_progress: {
        Row: {
          id: string
          user_id: string
          book_id: string
          current_word_index: number
          wpm: number
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          book_id: string
          current_word_index?: number
          wpm?: number
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          book_id?: string
          current_word_index?: number
          wpm?: number
          updated_at?: string
        }
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          dark_mode: boolean
          default_wpm: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          dark_mode?: boolean
          default_wpm?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          dark_mode?: boolean
          default_wpm?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}


