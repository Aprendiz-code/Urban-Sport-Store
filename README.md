
# Urban Sport Store

Modern ecommerce platform for sports equipment, apparel, and lifestyle products.

## Quick Start

### Frontend

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Opens at http://localhost:5173
```

### Backend

```bash
cd api

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your database and Supabase credentials

# Set up database
npm run db:migrate
npm run db:seed

# Start API server
npm run dev
# Runs at http://localhost:4000
# API docs at http://localhost:4000/api/docs
```

## Architecture

### Frontend (Vite + React + TypeScript)
- Storefront with product catalog
- Shopping cart and checkout flow
- User authentication (login/register)
- Admin dashboard for product management
- Image uploads to Supabase Storage

**See**: [src/](src/) and [Frontend Guide](README.md)

### Backend (Node.js + Express + Prisma)
- REST API with JWT authentication
- Product CRUD operations
- Order management
- Inventory tracking
- Audit logging
- Swagger API documentation

**See**: [api/](api/) and [Backend Guide](api/README_BACKEND.md)

### Database (PostgreSQL + Prisma)
- Product catalog
- User accounts and roles
- Orders and payments
- Inventory movements
- Audit trail

**Schema**: [api/prisma/schema.prisma](api/prisma/schema.prisma)

### Authentication (Supabase)
- User sign-up/login with email confirmation
- JWT tokens for API access
- Admin role-based access control
- Row-level security (RLS) on database

**Setup**: [docs/supabase-admin-setup.md](docs/supabase-admin-setup.md)

## Features

### Storefront
- ✅ Product browse and search
- ✅ Shopping cart
- ✅ Checkout flow
- ✅ User registration and login
- ✅ Address management
- ✅ Order history

### Admin Panel
- ✅ Product create/edit/delete
- ✅ Image upload to cloud storage
- ✅ Inventory management
- ✅ Order status tracking
- ✅ Sales reports
- ✅ Audit logs

### Security
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Email confirmation for registration
- ✅ Row-level security in database

## Environment Variables

### Frontend (.env.local)

```env
VITE_SUPABASE_URL=https://project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_STORAGE_BUCKET=products
VITE_ADMIN_EMAIL=admin@urbansportstore.dev
VITE_ADMIN_PASSWORD=your-password
```

### Backend (api/.env.local)

```env
DATABASE_URL=postgresql://user:password@localhost/urbansportstore
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
CORS_ORIGINS=http://localhost:5173
```

**See**: [api/.env.example](api/.env.example)

## Documentation

- [Backend API Documentation](api/README_BACKEND.md)
- [Supabase Admin Setup](docs/supabase-admin-setup.md)
- [Production Deployment Checklist](PRODUCTION.md)
- [Database Schema](docs/database.md)
- [Architecture Overview](docs/architecture.md)

## Development

### Scripts

**Frontend**:
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
npm run e2e        # Playwright tests
```

**Backend**:
```bash
npm run dev           # Start dev server
npm run build         # TypeScript compilation
npm test              # Run tests (vitest)
npm run db:migrate    # Apply migrations
npm run db:seed       # Seed database
npm run lint          # ESLint
```

### Project Structure

```
/
├── src/                    # Frontend source
│   ├── app/
│   │   ├── App.tsx
│   │   └── components/
│   ├── lib/
│   │   ├── supabase-client.ts
│   │   ├── supabase-auth.ts
│   │   ├── supabase-store.ts
│   │   └── admin-api.ts
│   └── styles/
├── api/                    # Backend source
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middlewares/
│   │   └── config/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── package.json
├── docs/                   # Documentation
├── e2e/                    # End-to-end tests
└── package.json
```

## Production Deployment

See [PRODUCTION.md](PRODUCTION.md) for:
- Security hardening checklist
- Environment variables setup
- Database migration strategy
- Deployment to Vercel / Railway
- Monitoring and rollback procedures

## Troubleshooting

### "Email not confirmed" error
- Check Supabase Auth settings → Email confirmation enabled
- User must click confirmation link in their email
- For testing, disable email confirmation in development

### 401 Unauthorized on admin API calls
- Verify user has `role: ADMIN` custom claim in Supabase
- Check backend `SUPABASE_SERVICE_ROLE_KEY` is set
- Ensure RLS policies are applied

### Database connection errors
- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Check PostgreSQL service is running
- Run migrations: `npm run db:migrate`

## Contributing

1. Create a feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open a Pull Request

## License

MIT - See LICENSE file for details

## Support

- [GitHub Issues](https://github.com/Aprendiz-code/Urban-Sport-Store/issues)
- [Supabase Documentation](https://supabase.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
  