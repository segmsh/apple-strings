export interface EntryToken {
  start: number;
  end: number;
  raw: string;
  value: string;
  key: string;
  comment?: string;
}

const ESCAPES: Record<string, string> = {
  a: "\x07",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
};

const ENCODES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

// Characters allowed in unquoted strings of old-style property lists
const UNQUOTED_REGEXP: RegExp = /[A-Za-z0-9_$+/:.-]/;

export const decode = (raw: string): string => {
  if (!raw.startsWith('"')) return raw;

  const content = raw.slice(1, -1);
  let result = "";

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "\\") {
      result += content[i];
      continue;
    }

    const next = content[i + 1];
    const hex = /^[0-9a-fA-F]{1,4}/.exec(content.slice(i + 2, i + 6));
    const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4));

    if ((next === "U" || next === "u") && hex) {
      result += String.fromCharCode(parseInt(hex[0], 16));
      i += 1 + hex[0].length;
    } else if (octal) {
      result += String.fromCharCode(parseInt(octal[0], 8));
      i += octal[0].length;
    } else {
      result += ESCAPES[next] ?? next ?? "";
      i++;
    }
  }

  return result;
};

// Keeps the raw value when unchanged; keeps literal newlines if the original used them
export const encode = (value: string, raw: string): string => {
  if (decode(raw) === value) return raw;

  const literalNewlines = raw.includes("\n") && !raw.includes("\\n");
  let result = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const code = value.charCodeAt(i);

    if (char === "\n" && literalNewlines) {
      result += char;
    } else if (char in ENCODES) {
      result += ENCODES[char];
    } else if (code < 0x20 || code === 0x7f) {
      result += `\\U${code.toString(16).toUpperCase().padStart(4, "0")}`;
    } else {
      result += char;
    }
  }

  return `"${result}"`;
};

class Scanner {
  private index = 0;
  private comment: string | undefined;
  private readonly tokens: EntryToken[] = [];

  constructor(private readonly source: string) {}

  scan(): EntryToken[] {
    for (;;) {
      this.skipTrivia();
      if (this.index >= this.source.length) break;

      const comment = this.comment;
      this.comment = undefined;

      const key = decode(this.readString());

      this.skipTrivia();

      // "key"; shorthand: the value is the key itself, nothing to translate
      if (this.peek() === ";") {
        this.index++;
        continue;
      }

      this.expect("=");
      this.skipTrivia();

      const start = this.index;
      const raw = this.readString();
      const end = this.index;

      this.skipTrivia();
      this.expect(";");

      this.tokens.push({
        start,
        end,
        raw,
        value: decode(raw),
        key,
        ...(comment && { comment }),
      });
    }

    return this.tokens;
  }

  private peek(): string {
    return this.source[this.index];
  }

  private startsWith(value: string): boolean {
    return this.source.startsWith(value, this.index);
  }

  private expect(value: string) {
    if (!this.startsWith(value)) {
      throw new Error(`Expected "${value}" at position ${this.index}`);
    }

    this.index += value.length;
  }

  // Skips whitespace and comments, remembering a comment right above the next entry
  private skipTrivia() {
    let newlines = 0;

    for (;;) {
      const char = this.peek();

      if (char === "\n") {
        newlines++;
        // A blank line detaches the comment from the next entry
        if (newlines > 1) this.comment = undefined;
        this.index++;
      } else if (char !== undefined && /\s/.test(char)) {
        this.index++;
      } else if (this.startsWith("//") || char === "#") {
        const start = this.index + (char === "#" ? 1 : 2);
        while (this.index < this.source.length && this.peek() !== "\n") {
          this.index++;
        }
        this.comment = this.source.slice(start, this.index).trim();
        newlines = 0;
      } else if (this.startsWith("/*")) {
        const end = this.source.indexOf("*/", this.index + 2);

        if (end < 0) {
          throw new Error(`Unterminated comment at position ${this.index}`);
        }

        this.comment = this.source.slice(this.index + 2, end).trim();
        this.index = end + 2;
        newlines = 0;
      } else {
        return;
      }
    }
  }

  private readString(): string {
    const start = this.index;

    if (this.peek() === '"') {
      this.index++;

      while (this.index < this.source.length && this.peek() !== '"') {
        this.index += this.peek() === "\\" ? 2 : 1;
      }

      if (this.index >= this.source.length) {
        throw new Error(`Unterminated string at position ${start}`);
      }

      this.index++;
    } else {
      while (UNQUOTED_REGEXP.test(this.peek() ?? "")) this.index++;
    }

    if (this.index === start) {
      throw new Error(`Expected a string at position ${start}`);
    }

    return this.source.slice(start, this.index);
  }
}

export const scan = (source: string): EntryToken[] => new Scanner(source).scan();
