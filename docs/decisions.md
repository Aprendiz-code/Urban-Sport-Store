# Technical Decisions

- Prisma ORM was chosen for type-safe database access and migrations.
- Express + TypeScript was selected to match the existing Node.js ecosystem.
- JWT-based authentication with httpOnly cookie preference is used for browser-friendly sessions.
- Simulated payments are implemented through an adapter interface to support future providers such as Stripe or Mercado Pago.
