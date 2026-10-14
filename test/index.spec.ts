import { assert, describe, it } from "vitest";
import eol from "eol";
import fs from "fs";
import path from "path";
import AppleStringsProcessor from "../src";

const processor = new AppleStringsProcessor();

const fixtures = [
  "typical.strings",
  "test.strings",
  "sections.strings",
  "comments.strings",
  "edge.strings",
];

function readFixture(filename: string): string {
  return eol.lf(
    fs.readFileSync(path.join("test", "fixtures", filename), {
      encoding: "utf-8",
    }),
  );
}

function textsByKey(input: string): Record<string, string> {
  return Object.fromEntries(
    processor
      .parse(input)
      .segments.map(({ text, metadata }) => [String(metadata?.key), text]),
  );
}

describe("AppleStringsProcessorTest", function () {
  fixtures.forEach((filename) => {
    it(`should process ${filename} correctly`, function () {
      const input = readFixture(filename);
      const document = processor.parse(input);
      const roundTripped = processor.parse(processor.stringify(document));

      assert.equal(JSON.stringify(roundTripped), JSON.stringify(document));
    });

    it(`should roundtrip ${filename} exactly`, function () {
      const input = readFixture(filename);

      assert.equal(processor.stringify(processor.parse(input)), input);
    });

    it(`should keep ${filename} valid after translation`, function () {
      const input = readFixture(filename);
      const document = processor.parse(input);
      const samples = [
        "Übersetzt 日本語 😀",
        "  leading and trailing spaces  ",
        "It's \"quoted\" with back\\slash",
        "multi\nline\ttab\r\nend",
        "/* not a comment */ // either",
        "%@ and %1$d; semicolons; = signs",
        "control \u0001 char",
      ];
      const expected = new Map<string, string>();

      document.segments.forEach((current, index) => {
        current.text = samples[index % samples.length];
        expected.set(current.id, current.text);
      });

      const output = processor.parse(processor.stringify(document));

      assert.equal(output.segments.length, document.segments.length);
      output.segments.forEach((current) => {
        assert.equal(current.text, expected.get(current.id));
      });
    });
  });

  it("should decode escapes and unquoted strings", function () {
    assert.deepInclude(textsByKey(readFixture("edge.strings")), {
      escapes: "Tab\tnewline\nquote\" backslash\\ apostrophe' bell\x07",
      unicode: "¡Hola! é café",
      octal: "Octal ABC",
      unquoted_key: "Unquoted key",
      unquoted_value: "Unquoted_value",
      spaces: "No spaces around",
      padded: "  Leading and trailing spaces  ",
      multiline_literal: "Line one\nLine two",
      comment_like: "Not /* a comment */ // either",
      "key with spaces": "Key with spaces",
      "Ключ": "Unicode key",
    });
  });

  it("should decode the original fixture values", function () {
    assert.deepInclude(textsByKey(readFixture("test.strings")), {
      "test-quotes": '"Test quote"',
      "test-semicolon": 'Test "; semicolon',
      "test-spacing": "Test spacing",
      "test edge": ' = "Test edge"',
      "test-multiline-value-with-comment":
        "Test\nmultiline\nvalue\nwith comment\n/* comment */\n",
    });
  });

  it("should skip empty values and shorthand entries", function () {
    const keys = Object.keys(textsByKey(readFixture("edge.strings")));

    ["empty", "blank", "shorthand"].forEach((key) => assert.notInclude(keys, key));
    assert.lengthOf(processor.parse(readFixture("comments.strings")).segments, 0);
  });

  it("should attach the comment right above an entry", function () {
    const segments = processor.parse(readFixture("typical.strings")).segments;
    const comments = Object.fromEntries(
      segments.map(({ metadata }) => [metadata?.key, metadata?.comment]),
    );

    assert.deepEqual(comments, {
      AppName: "Our app name",
      EnterUsername: "User login dialog",
      EnterEmail: undefined,
      password: undefined,
    });
  });

  it("should not attach a comment separated by a blank line", function () {
    const document = processor.parse('/* Header */\n\n"a" = "A";\n');

    assert.isUndefined(document.segments[0].metadata?.comment);
  });

  it("should escape translated text", function () {
    const document = processor.parse('"a" = "Text";\n"b" = Unquoted;\n');

    document.segments[0].text = 'Say "hi"\n\\';
    document.segments[1].text = "Now quoted";

    assert.equal(
      processor.stringify(document),
      '"a" = "Say \\"hi\\"\\n\\\\";\n"b" = "Now quoted";\n',
    );
  });

  it("should keep literal newlines when the original used them", function () {
    const document = processor.parse('"a" = "One\nTwo";\n');

    document.segments[0].text = "Eins\nZwei";

    assert.equal(processor.stringify(document), '"a" = "Eins\nZwei";\n');
  });

  it("should give duplicate keys unique ids", function () {
    const ids = processor
      .parse('"a" = "One";\n"a" = "Two";\n')
      .segments.map(({ id }) => id);

    assert.equal(new Set(ids).size, 2);
  });

  it("should throw on invalid strings files", function () {
    assert.throws(() => processor.parse('"a" = "unterminated;\n'));
    assert.throws(() => processor.parse('"a" = "missing semicolon"\n"b" = "B";'));
  });

  it("should produce deterministic ids", function () {
    const input = readFixture("edge.strings");

    assert.deepEqual(processor.parse(input), processor.parse(input));
  });
});
