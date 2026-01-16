# Velo — RSVP Speed Reader

A modern web-based RSVP (Rapid Serial Visual Presentation) speed reader for ePub files. Read faster by displaying one word at a time at your chosen speed.

![Velo Screenshot](https://via.placeholder.com/800x400?text=Velo+RSVP+Reader)

## Features

- **RSVP Reading** — One word at a time with optimal recognition point (ORP) highlighting
- **Speed Control** — Adjustable from 100 to 1000 words per minute
- **ePub Support** — Upload and read any ePub file
- **Trial Mode** — Try it free with one book (held in memory only)
- **Persistent Library** — Sign up to save books and reading progress across devices
- **Dark Mode** — Toggle between light and dark themes
- **Keyboard Shortcuts** — Space to play/pause, arrows to navigate
- **Progress Tracking** — Resume where you left off

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage)
- **ePub Parsing**: epub.js

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project

### Setup

1. **Clone and install dependencies:**

```bash
cd velo
npm install
```

2. **Set up Supabase:**

   - Create a new project at [supabase.com](https://supabase.com)
   - Run the SQL schema in `supabase-schema.sql` in the SQL Editor
   - Copy your project URL and anon key

3. **Configure environment variables:**

   Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Start the development server:**

```bash
npm run dev
```

5. **Open in browser:**

   Navigate to [http://localhost:5173](http://localhost:5173)

## Usage

### Trial Mode (No Account)

1. Drop an ePub file on the landing page
2. Read at your preferred speed
3. Note: Progress is not saved in trial mode

### Signed-in Mode

1. Create an account or sign in
2. Upload unlimited ePub files
3. Your books and reading progress sync across devices
4. Pick up where you left off

### Reader Controls

| Action | Keyboard | Mouse |
|--------|----------|-------|
| Play/Pause | `Space` | Click word area |
| Skip back 50 words | `←` | Skip back button |
| Skip forward 50 words | `→` | Skip forward button |
| Increase speed | `↑` | + button |
| Decrease speed | `↓` | - button |
| Exit reader | `Escape` | Back button |

## Project Structure

```
src/
├── components/
│   ├── AuthModal.tsx     # Sign in/up modal
│   ├── Landing.tsx       # Landing page for new users
│   ├── Library.tsx       # Book library for signed-in users
│   └── Reader.tsx        # RSVP reader view
├── contexts/
│   ├── AuthContext.tsx   # Authentication state
│   ├── BookContext.tsx   # Book and progress management
│   └── ThemeContext.tsx  # Dark mode state
├── lib/
│   ├── epubParser.ts     # ePub parsing and ORP utilities
│   └── supabase.ts       # Supabase client and types
├── App.tsx               # Main app with view routing
├── main.tsx              # Entry point
└── index.css             # Global styles and CSS variables
```

## License

MIT
