export type RoleName = 'CUSTOMER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: RoleName[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details: string[];
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PasswordResetPayload {
  email: string;
}
