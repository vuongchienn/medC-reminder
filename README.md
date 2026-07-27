# MedReminder

MedReminder is a simple, mobile-first medication reminder web app built with Node.js, SQLite, Express, vanilla HTML/CSS/JavaScript, and a lightweight scheduler.

## Features
- Manage medicines with CRUD
- Add multiple reminder times per medicine
- Scheduler creates reminders each minute
- Mark reminders as taken or snooze them
- History and stats dashboard
- CSV/JSON export and backup export
- Dark mode
- Basic PWA shell with manifest and service worker

## Project structure
- src/api: REST API routes
- src/services: domain services for medicines, reminders, stats, exports
- src/scheduler: reminder polling scheduler
- src/database: SQLite connection and migrations
- src/public: frontend assets and PWA files
- src/pages: HTML pages
- src/seed.js: starter sample data

## Getting started
1. Install dependencies
   ```bash
   npm install
   ```
2. Copy the example environment file
   ```bash
   cp .env.example .env
   ```
3. Start the app
   ```bash
   npm start
   ```
4. Open http://localhost:3000

## API overview
- GET /api/medicines
- POST /api/medicines
- PUT /api/medicines/:id
- DELETE /api/medicines/:id
- GET /api/reminders
- POST /api/reminders/:id/taken
- POST /api/reminders/:id/snooze
- GET /api/stats

## Notes
- The SQLite database is created automatically in data/medremind.db.
- The scheduler checks reminders every minute.
- The app is intentionally lightweight and can be extended into a full PWA later.
