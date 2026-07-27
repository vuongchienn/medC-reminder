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

## Database options
### Local development (default)
- Use SQLite automatically with DB_TYPE=sqlite.

### Render deployment (MySQL)
Set these variables in Render:
```env
DB_TYPE=mysql
MYSQL_HOST=...
MYSQL_PORT=3306
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...
```

### Supabase deployment (PostgreSQL)
Set these variables in your hosting environment:
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://user:password@host:5432/db
```

## API overview
- GET /api/medicines
- POST /api/medicines
- PUT /api/medicines/:id
- DELETE /api/medicines/:id
- GET /api/reminders
- POST /api/reminders/:id/taken
- POST /api/reminders/:id/snooze
- GET /api/stats

## Telegram notifications
To receive reminders in Telegram, set these variables:
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

How to set it up:
1. Create a bot with BotFather.
2. Send `/start` to the bot and get the chat id via a bot like @userinfobot.
3. Put the values into your environment variables.

## Notes
- The SQLite database is created automatically in data/medremind.db.
- The scheduler checks reminders every minute.
- The app is intentionally lightweight and can be extended into a full PWA later.
