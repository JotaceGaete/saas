export class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    if (options && typeof options === 'object') {
      if (options.code) this.code = String(options.code);
      if (options.provider) this.provider = String(options.provider);
      if (options.details !== undefined) this.details = options.details;
    }
  }
}

export function isHttpError(err) {
  return !!err && typeof err === 'object' && Number.isInteger(err.statusCode);
}

