export type ApiErrorCode =
  'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const validationError = (message: string, field?: string) =>
  new ApiError(422, 'VALIDATION_ERROR', message, field);
export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Não encontrado.');
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);
