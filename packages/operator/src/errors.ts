/** The model returned something the schema rejected, after the bounded retry. */
export class ModelOutputError extends Error {
  override readonly name = "ModelOutputError";

  constructor(message: string) {
    super(message);
  }
}

/** A step failed for a business reason. Retry only when `retryable` is set. */
export class StepFailed extends Error {
  override readonly name = "StepFailed";
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}
