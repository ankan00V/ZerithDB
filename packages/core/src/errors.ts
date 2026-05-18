export class ZerithValidationError<T> extends Error {
  constructor(
    message: string,
    public zodError?: T
  ) {
    super(message);
    this.name = "ZerithValidationError";
  }
}
