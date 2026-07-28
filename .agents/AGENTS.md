# Customizations

## Rules
- After successfully making code changes or fulfilling a user request, always perform a `git add .`, `git commit` with a descriptive message, and `git push` to GitHub automatically, providing version control without the user having to ask for it.
- Every time code modifications are completed, automatically restart `docker compose` (e.g., `docker compose restart` or `docker compose up -d --build`) to ensure the application is running with the latest code.
