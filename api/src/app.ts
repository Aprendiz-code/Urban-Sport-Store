import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import cartRoutes from './routes/cart.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import adminRoutes from './routes/admin.routes.js';
import testRoutes from './routes/test.routes.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middlewares/error-handler.js';
import { globalLimiter, setRequestId } from './middlewares/security.js';
import { successResponse } from './utils/responses.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        roles: Array<'CUSTOMER' | 'ADMIN'>;
      };
      requestId?: string;
    }
  }
}

const app = express();

app.set('trust proxy', 1);
const helmetMiddleware = (helmet as any).default ?? helmet;
app.use(helmetMiddleware());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (env.corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(globalLimiter);
app.use(setRequestId);

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Urban Sport Store API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  },
  apis: ['./src/routes/**/*.ts', './src/controllers/**/*.ts'],
});

app.get('/health', (_req, res) => {
  res.status(200).json(successResponse({ status: 'ok' }));
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1', catalogRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/test', testRoutes);

app.use(errorHandler);

app.locals.logger = logger;

export default app;
