-- Supabase Schema for Velo RSVP Reader
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Books table
create table if not exists public.books (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  author text,
  cover_url text,
  file_path text not null,
  total_words integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Reading progress table
create table if not exists public.reading_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  book_id uuid references public.books(id) on delete cascade not null,
  current_word_index integer default 0 not null,
  wpm integer default 300 not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, book_id)
);

-- User preferences table
create table if not exists public.user_preferences (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  dark_mode boolean default false not null,
  default_wpm integer default 300 not null,
  font_size numeric(3,1) default 2.0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Migration: Add font_size column if table already exists
-- Run this if you already have the user_preferences table:
-- ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS font_size numeric(3,1) default 2.0 not null;

-- Row Level Security Policies

-- Books: Users can only access their own books
alter table public.books enable row level security;

create policy "Users can view own books"
  on public.books for select
  using (auth.uid() = user_id);

create policy "Users can insert own books"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "Users can update own books"
  on public.books for update
  using (auth.uid() = user_id);

create policy "Users can delete own books"
  on public.books for delete
  using (auth.uid() = user_id);

-- Reading Progress: Users can only access their own progress
alter table public.reading_progress enable row level security;

create policy "Users can view own progress"
  on public.reading_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on public.reading_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.reading_progress for update
  using (auth.uid() = user_id);

create policy "Users can delete own progress"
  on public.reading_progress for delete
  using (auth.uid() = user_id);

-- User Preferences: Users can only access their own preferences
alter table public.user_preferences enable row level security;

create policy "Users can view own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id);

-- Storage bucket for ePub files
insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

-- Storage policies
create policy "Users can upload own books"
  on storage.objects for insert
  with check (
    bucket_id = 'books' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own books"
  on storage.objects for select
  using (
    bucket_id = 'books' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own books"
  on storage.objects for delete
  using (
    bucket_id = 'books' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Functions

-- Auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger handle_books_updated_at
  before update on public.books
  for each row execute function public.handle_updated_at();

create trigger handle_reading_progress_updated_at
  before update on public.reading_progress
  for each row execute function public.handle_updated_at();

create trigger handle_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.handle_updated_at();

-- Create preferences on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_preferences (user_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

