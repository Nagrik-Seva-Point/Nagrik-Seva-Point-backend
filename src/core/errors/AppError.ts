export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_SERVER_ERROR",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, code = "BAD_REQUEST", details?: unknown) {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message: string, code = "UNAUTHORIZED") {
    return new AppError(message, 401, code);
  }

  static forbidden(message: string, code = "FORBIDDEN") {
    return new AppError(message, 403, code);
  }

  static notFound(message: string, code = "NOT_FOUND") {
    return new AppError(message, 404, code);
  }

  static conflict(message: string, code = "CONFLICT") {
    return new AppError(message, 409, code);
  }

  static internal(message: string, code = "INTERNAL_SERVER_ERROR") {
    return new AppError(message, 500, code);
  }

  static badGateway(message: string, code = "BAD_GATEWAY", details?: unknown) {
    return new AppError(message, 502, code, details);
  }
}
