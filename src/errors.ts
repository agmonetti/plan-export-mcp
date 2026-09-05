export class ExportError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'EXPORT_ERROR') {
    super(message);
    this.name = 'ExportError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SecurityError extends ExportError {
  constructor(message: string, code: string = 'SECURITY_ERROR') {
    super(message, code);
    this.name = 'SecurityError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BrowserError extends ExportError {
  constructor(message: string, code: string = 'BROWSER_ERROR') {
    super(message, code);
    this.name = 'BrowserError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
