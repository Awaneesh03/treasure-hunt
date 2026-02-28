# Treasure Hunt

A web-based treasure hunt game where teams scan QR codes, solve clues, and race to the finish. Built with vanilla HTML/CSS/JavaScript and powered by [Supabase](https://supabase.com) as the backend.

## Features

- **Team Registration** — Teams enter a name to begin; stored in `localStorage` for session persistence.
- **QR-Code-Driven Progression** — Each clue is accessed via a URL parameter (`?clue=1`, `?clue=2`, …). Teams must solve clues in order.
- **Answer Validation** — Case-insensitive exact match. Correct answers reveal the next clue; wrong answers trigger a shake animation.
- **Progress Tracking** — All progress is saved to Supabase (`teams_progress` table), ensuring it survives page reloads and device switches.
- **Admin Panel** — Password-protected dashboard to manage questions, view a live leaderboard, and reset team progress.

## Project Structure

| File | Description |
|------|-------------|
| `index.html` | Participant-facing page — team registration, question display, answer input, and clue reveal |
| `script.js` | Core game logic — init, team submission, question fetching, answer checking, progress saving |
| `style.css` | Styles for the participant page (card layout, feedback colors, shake animation) |
| `admin.html` | Self-contained admin panel with inline styles and scripts — add/edit/delete questions, leaderboard, progress reset |
| `config.js` | Supabase URL, anon key, and admin password (must be configured before use) |

## Getting Started

### Prerequisites

- A [Supabase](https://supabase.com) project with the following tables:

  **`questions`**
  | Column | Type |
  |--------|------|
  | `id` | `uuid` (primary key) |
  | `order_number` | `int` |
  | `question` | `text` |
  | `answer` | `text` |
  | `clue` | `text` (optional) |

  **`teams_progress`**
  | Column | Type |
  |--------|------|
  | `id` | `uuid` (primary key) |
  | `team_name` | `text` |
  | `clue_number` | `int` |
  | `solved_at` | `timestamptz` |

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Awaneesh03/treasure-hunt.git
   cd treasure-hunt
   ```

2. **Configure Supabase credentials**
   Open `config.js` and fill in your project URL, anon key, and admin password:
   ```js
   const SUPABASE_URL      = 'https://your-project.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   const ADMIN_PASSWORD    = 'your-admin-password';
   ```

3. **Serve the files**
   Use any static file server. For example:
   ```bash
   npx serve .
   ```

4. **Open in browser**
   - Participant page: `http://localhost:3000/?clue=1`
   - Admin panel: `http://localhost:3000/admin.html`

## How It Works

1. **Admin** adds questions (with answers and optional clues) via `admin.html`.
2. **Organizer** generates QR codes pointing to `/?clue=1`, `/?clue=2`, etc., and places them at physical locations.
3. **Teams** scan the first QR code, enter a team name, and answer the question.
4. A correct answer reveals a **clue** leading to the next QR code location.
5. Progress is enforced server-side — teams cannot skip ahead.
6. The admin **leaderboard** shows real-time standings.

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL + REST API)
- **CDN:** Supabase JS client loaded via jsDelivr

## License

This project is open source.
