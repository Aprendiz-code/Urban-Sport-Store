# Security

- JWT access tokens are issued for authenticated requests.
- Passwords are hashed with bcrypt before storage.
- Helmet, CORS, and rate limiting are enabled globally.
- The API never stores raw secrets, cards, CVV, or passwords in logs or database records.
- Admin-only operations are protected by role-based middleware.
