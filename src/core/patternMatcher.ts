const ANSI_SEQUENCE_PATTERN =
  /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;

export function stripAnsiSequences(value: string): string {
  return value.replace(ANSI_SEQUENCE_PATTERN, "");
}

export class RollingPatternMatcher {
  private readonly buffers = new Map<object, string>();
  private readonly maxBufferChars: number;

  public constructor(maxBufferChars = 4096) {
    this.maxBufferChars = Math.max(256, maxBufferChars);
  }

  public clear(key: object): void {
    this.buffers.delete(key);
  }

  public matches(key: object, chunk: string, patterns: readonly RegExp[]): boolean {
    const previous = this.buffers.get(key) ?? "";
    const combined = trimToMax(previous + stripAnsiSequences(chunk), this.maxBufferChars);
    this.buffers.set(key, combined);

    for (const pattern of patterns) {
      if (testRegExp(pattern, combined)) {
        return true;
      }
    }

    return false;
  }
}

function trimToMax(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return value.slice(value.length - maxChars);
}

function testRegExp(pattern: RegExp, text: string): boolean {
  if (pattern.global || pattern.sticky) {
    pattern.lastIndex = 0;
  }

  return pattern.test(text);
}
