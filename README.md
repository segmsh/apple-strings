# @segmsh/apple-strings

Apple strings processor for [segm.sh](https://segm.sh). This package parses `.strings` localization files into a document (AST + segments) and stringifies them back, treating values as translatable segments while leaving everything else byte-for-byte intact.

## Installation

```bash
npm install @segmsh/apple-strings
```

## Usage

```typescript
import AppleStringsProcessor from "@segmsh/apple-strings";

const processor = new AppleStringsProcessor();

const content = '/* Greeting on the home screen */\n"welcome" = "\\U00A1Bienvenidos!";\n';
const document = processor.parse(content);
// document.segments[0].text === "¡Bienvenidos!"
// document.segments[0].metadata === { key: "welcome", comment: "Greeting on the home screen" }

// ... modify document segments ...

const newContent = processor.stringify(document);
```

## Features

- **Source Preservation**: Comments, spacing and layout are kept exactly as written.
- **Escapes**: Values are decoded (`\"`, `\\`, `\n`, `\t`, `\U00A1`, octal escapes), so segments contain plain text; translated text is escaped back.
- **Translator Comments**: The comment right above an entry is exposed as `metadata.comment`.
- **Key Paths**: Each segment carries its key in `metadata.key`. Empty values and `"key";` shorthand entries are not segmented.
- **Round-trip**: Parsing and stringifying an unchanged document returns the original input.

Files are expected as decoded strings; legacy UTF-16 `.strings` files need to be decoded before parsing.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## License

[Apache-2.0](LICENSE)
