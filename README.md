# CodeVault — Student Productivity Dashboard

A portfolio project built with **HTML, CSS, JavaScript, and C**. It demonstrates responsive UI design, DOM manipulation, form validation, browser storage, HTTP fundamentals, and a small C socket server.

## Features

- Responsive dashboard with task statistics and completion chart
- Create, edit, delete, complete, search, and filter tasks
- Priority and due-date labels, including overdue tasks
- Client-side validation and accessible labels/status messages
- C-based HTTP server serving frontend files
- JSON API: `GET /api/tasks` and `POST /api/tasks`
- Browser `localStorage` fallback when the C API is unavailable
- No external JavaScript libraries or build tools required

## Project structure

```text
CodeVault/
├── index.html
├── style.css
├── app.js
├── server.c
├── tasks.json       # created by server after first save
├── README.md
└── .gitignore
```

## Run locally

### Linux

```bash
gcc -std=c11 -Wall -Wextra -O2 server.c -o codevault-server
./codevault-server
```

Open `http://localhost:8080`.

### macOS

```bash
clang -std=c11 -Wall -Wextra -O2 server.c -o codevault-server
./codevault-server
```

Open `http://localhost:8080`.

> The server uses POSIX sockets. Native Windows builds need WSL or a port to Winsock. Keep the server running while using the dashboard. The C server writes task data to `tasks.json`.

## How it works

1. `index.html` defines the dashboard and task form.
2. `style.css` creates the responsive layout, cards, modal, and chart.
3. `app.js` validates input, renders tasks, updates statistics, and calls the API.
4. `server.c` handles basic HTTP requests, serves static files, and stores the task list as JSON.
5. If the API cannot be reached, tasks fall back to browser `localStorage`.

## API quick reference

- `GET /api/tasks` — returns the stored task array, or `[]` if no file exists.
- `POST /api/tasks` — accepts a JSON task array and replaces the stored list.

Example request:

```bash
curl http://localhost:8080/api/tasks
curl -X POST http://localhost:8080/api/tasks \
  -H 'Content-Type: application/json' \
  -d '[]'
```

## Test checklist

- [ ] Add a task with a title shorter than 3 characters; validation should block it.
- [ ] Add, edit, complete, and delete a task.
- [ ] Search by task title and description.
- [ ] Filter active and completed tasks.
- [ ] Set a past due date and verify the overdue label.
- [ ] Refresh the page and verify persistence.
- [ ] Test the layout on mobile and desktop widths.
- [ ] Stop the C server and verify the localStorage fallback.

## Limitations and next improvements

This is a learning/demo server, not production infrastructure. It handles one request per connection, uses a small fixed request buffer, and has no authentication, authorization, TLS, robust JSON validation, or multi-user isolation. Do not expose it to the public internet.

Good next steps: add unit tests, split API and storage modules, validate JSON on the server, add user accounts with password hashing, and deploy behind a production-grade web server.
