import { ApiErrorPayload, ApiResponse } from '../types/index.js';

export const successResponse = <T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> => ({
  success: true,
  data,
  meta,
});

export const errorResponse = (code: string, message: string, details: string[] = []): ApiErrorPayload => ({
  success: false,
  error: {
    code,
    message,
    details,
  },
});
