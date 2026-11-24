export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const err = {
  badRequest: (code: string, msg: string, details?: Record<string, unknown>) => new AppError(400, code, msg, details),
  unauthorized: (code = "UNAUTHORIZED", msg = "Authentication required") => new AppError(401, code, msg),
  forbidden: (code: string, msg: string) => new AppError(403, code, msg),
  notFound: (code: string, msg: string) => new AppError(404, code, msg),
  conflict: (code: string, msg: string) => new AppError(409, code, msg),
  locked: (msg: string, details?: Record<string, unknown>) => new AppError(423, "LOCKED", msg, details),
  tooMany: (msg: string) => new AppError(429, "RATE_LIMITED", msg),
};
