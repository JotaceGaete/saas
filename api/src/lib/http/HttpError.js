export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function isHttpError(err) {
  return !!err && typeof err === 'object' && Number.isInteger(err.statusCode);
}

