# Backend API - Urban Sport Store

Production-ready Node.js + Express + Prisma backend for the Urban Sport Store ecommerce platform.

## Features

- ✅ JWT-based authentication with Supabase
- ✅ Role-based access control (ADMIN, CUSTOMER)
- ✅ Product CRUD with Supabase integration
- ✅ Order and payment management
- ✅ Inventory tracking
- ✅ Audit logging
- ✅ Rate limiting & security headers
- ✅ API documentation (Swagger/OpenAPI)

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 4
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT + Supabase
- **Validation**: Zod
- **Testing**: Vitest
- **Docs**: Swagger UI

## Setup

### 1. Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/urbansportstore
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-strong-secret
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

### 4. Development

```bash
npm run dev
# Server runs at http://localhost:4000
# API docs at http://localhost:4000/api/docs
```

## API Routes

### Authentication

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/bridge` - Supabase token exchange
- `GET /api/v1/auth/me` - Current user info

### Admin

- `GET /api/v1/admin/dashboard` - Dashboard stats
- `POST /api/v1/admin/products` - Create product
- `PATCH /api/v1/admin/products/:id` - Update product
- `DELETE /api/v1/admin/products/:id` - Delete product
- `POST /api/v1/admin/inventory/movements` - Track inventory
- `GET /api/v1/admin/reports/sales` - Sales report
- `GET /api/v1/admin/reports/inventory` - Inventory report

### Public

- `GET /api/v1/products` - List products
- `GET /api/v1/products/:id` - Product details
- `GET /api/v1/categories` - List categories

## Architecture

```
src/
├── app.ts                 # Express app setup
├── server.ts              # Entry point
├── config/                # Configuration
│   ├── env.ts
│   └── logger.ts
├── middlewares/           # Express middlewares
│   ├── auth.ts
│   ├── validation.ts
│   ├── error-handler.ts
│   └── security.ts
├── routes/                # API routes
│   ├── auth.routes.ts
│   ├── admin.routes.ts
│   ├── catalog.routes.ts
│   └── ...
├── controllers/           # Request handlers
├── services/              # Business logic
│   ├── auth.service.ts
│   ├── product.service.ts
│   └── supabase-admin.service.ts
├── db/                    # Database
│   └── prisma.ts
├── types/                 # TypeScript types
├── utils/                 # Utilities
└── tests/                 # Tests
```

## Security

### Authentication

1. Users authenticate via Supabase Auth
2. Backend receives JWT token from frontend
3. Backend validates token against Supabase
4. Admin operations require `role: ADMIN` claim

### Authorization

- All mutations require `requireAuth` middleware
- Admin routes require `requireRole('ADMIN')`
- Row-level security (RLS) in Supabase enforces read/write policies

### Rate Limiting

- Global: 120 requests per 15 min
- Auth endpoints: 10 requests per 15 min
- Configurable via environment variables

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test src/tests/auth.test.ts

# Watch mode
npm test -- --watch
```

Note: Tests require a running PostgreSQL database configured in `DATABASE_URL`.

## Deployment

### Production Build

```bash
npm run build
npm start
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

### Environment Variables Required

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=<production-db>
JWT_SECRET=<strong-secret>
SUPABASE_URL=<production-url>
SUPABASE_SERVICE_ROLE_KEY=<production-key>
CORS_ORIGINS=https://yourdomain.com
SECURE_COOKIES=true
```

## Monitoring

- Health check: `GET /health`
- API docs: `GET /api/docs`
- Audit logs: `GET /api/v1/admin/audit` (admin only)

## Support

For issues or questions, check [docs/supabase-admin-setup.md](../docs/supabase-admin-setup.md) or [PRODUCTION.md](../PRODUCTION.md).
