/** Errors that are safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Tizimga kiring') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = "Ruxsat yo'q") => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Topilmadi') => new AppError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooManyRequests = (message: string) => new AppError(429, 'too_many_requests', message);
