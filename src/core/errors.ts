export class ServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

export class AuthError extends ServiceError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string = 'Validation failed') {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends ServiceError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class ServerError extends ServiceError {
  constructor(message: string = 'Server error') {
    super(message, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

export function formatError(error: unknown): { error: string; code: string } {
  if (error instanceof ServiceError) {
    return { error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { error: error.message, code: 'UNKNOWN_ERROR' };
  }
  return { error: String(error), code: 'UNKNOWN_ERROR' };
}
