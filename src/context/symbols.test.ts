/**
 * Tests for symbol extraction module
 */

import { describe, test, expect } from "bun:test";
import {
  extractSymbols,
  extractSymbolsFromFile,
  isSupported,
  getSupportedExtensions,
  type Symbol,
} from "./symbols";
import { join } from "path";
import { writeFile, rm, mkdir } from "fs/promises";

// Test fixtures directory
const FIXTURES_DIR = join(import.meta.dir, "..", "..", ".test-fixtures");

describe("Symbol extraction", () => {
  describe("TypeScript/JavaScript", () => {
    test("extracts function declarations", () => {
      const content = `
function hello() {}
export function goodbye() {}
async function asyncFn() {}
export async function exportAsyncFn() {}
`;
      const symbols = extractSymbols(content, "test.ts");

      expect(symbols).toHaveLength(4);
      expect(symbols[0]).toEqual({ name: "hello", type: "function", line: 2 });
      expect(symbols[1]).toEqual({ name: "goodbye", type: "function", line: 3 });
      expect(symbols[2]).toEqual({ name: "asyncFn", type: "function", line: 4 });
      expect(symbols[3]).toEqual({
        name: "exportAsyncFn",
        type: "function",
        line: 5,
      });
    });

    test("extracts class declarations", () => {
      const content = `
class MyClass {}
export class ExportedClass extends BaseClass {}
`;
      const symbols = extractSymbols(content, "test.ts");

      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toEqual({ name: "MyClass", type: "class", line: 2 });
      expect(symbols[1]).toEqual({
        name: "ExportedClass",
        type: "class",
        line: 3,
      });
    });

    test("extracts type and interface declarations", () => {
      const content = `
type MyType = string;
export type ExportedType = number;
interface MyInterface {}
export interface ExportedInterface {}
`;
      const symbols = extractSymbols(content, "test.ts");

      expect(symbols).toHaveLength(4);
      expect(symbols[0]).toEqual({ name: "MyType", type: "type", line: 2 });
      expect(symbols[1]).toEqual({
        name: "ExportedType",
        type: "type",
        line: 3,
      });
      expect(symbols[2]).toEqual({
        name: "MyInterface",
        type: "interface",
        line: 4,
      });
      expect(symbols[3]).toEqual({
        name: "ExportedInterface",
        type: "interface",
        line: 5,
      });
    });

    test("extracts const declarations", () => {
      const content = `
const MY_CONST = 42;
export const EXPORTED_CONST = "hello";
`;
      const symbols = extractSymbols(content, "test.ts");

      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toEqual({ name: "MY_CONST", type: "const", line: 2 });
      expect(symbols[1]).toEqual({
        name: "EXPORTED_CONST",
        type: "const",
        line: 3,
      });
    });

    test("handles .js, .jsx, .tsx, .mjs, .cjs extensions", () => {
      const content = "function test() {}";

      for (const ext of [".js", ".jsx", ".tsx", ".mjs", ".cjs"]) {
        const symbols = extractSymbols(content, `file${ext}`);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("test");
      }
    });

    test("handles mixed TypeScript file", () => {
      const content = `
import { something } from 'module';

export interface Config {
  name: string;
}

export type Status = 'pending' | 'done';

export class Service {
  async init(): Promise<void> {}
}

export async function main(config: Config): Promise<void> {
  const service = new Service();
  await service.init();
}

const DEFAULT_CONFIG: Config = { name: 'default' };
`;
      const symbols = extractSymbols(content, "app.ts");

      const names = symbols.map((s) => s.name);
      expect(names).toContain("Config");
      expect(names).toContain("Status");
      expect(names).toContain("Service");
      expect(names).toContain("main");
      expect(names).toContain("DEFAULT_CONFIG");
    });
  });

  describe("Python", () => {
    test("extracts function definitions", () => {
      const content = `
def hello():
    pass

async def async_hello():
    pass
`;
      const symbols = extractSymbols(content, "test.py");

      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toEqual({ name: "hello", type: "function", line: 2 });
      expect(symbols[1]).toEqual({
        name: "async_hello",
        type: "function",
        line: 5,
      });
    });

    test("extracts class definitions", () => {
      const content = `
class MyClass:
    pass

class DerivedClass(BaseClass):
    pass
`;
      const symbols = extractSymbols(content, "test.py");

      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toEqual({ name: "MyClass", type: "class", line: 2 });
      expect(symbols[1]).toEqual({
        name: "DerivedClass",
        type: "class",
        line: 5,
      });
    });

    test("handles mixed Python file", () => {
      const content = `
import os
from typing import Optional

class Config:
    def __init__(self):
        pass

    def validate(self):
        pass

async def main():
    config = Config()

def helper():
    pass
`;
      const symbols = extractSymbols(content, "app.py");

      const names = symbols.map((s) => s.name);
      expect(names).toContain("Config");
      expect(names).toContain("__init__");
      expect(names).toContain("validate");
      expect(names).toContain("main");
      expect(names).toContain("helper");
    });
  });

  describe("Go", () => {
    test("extracts function declarations", () => {
      const content = `
func Hello() {
}

func (s *Service) Method() {
}
`;
      const symbols = extractSymbols(content, "test.go");

      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toEqual({ name: "Hello", type: "function", line: 2 });
      expect(symbols[1]).toEqual({ name: "Method", type: "function", line: 5 });
    });

    test("extracts struct and interface declarations", () => {
      const content = `
type Config struct {
    Name string
}

type Handler interface {
    Handle() error
}
`;
      const symbols = extractSymbols(content, "test.go");

      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toEqual({ name: "Config", type: "class", line: 2 });
      expect(symbols[1]).toEqual({
        name: "Handler",
        type: "interface",
        line: 6,
      });
    });

    test("handles mixed Go file", () => {
      const content = `
package main

import "fmt"

type Server struct {
    Port int
}

type Logger interface {
    Log(msg string)
}

func NewServer(port int) *Server {
    return &Server{Port: port}
}

func (s *Server) Start() error {
    fmt.Println("Starting server")
    return nil
}

func main() {
    server := NewServer(8080)
    server.Start()
}
`;
      const symbols = extractSymbols(content, "main.go");

      const names = symbols.map((s) => s.name);
      expect(names).toContain("Server");
      expect(names).toContain("Logger");
      expect(names).toContain("NewServer");
      expect(names).toContain("Start");
      expect(names).toContain("main");
    });
  });

  describe("Rust", () => {
    test("extracts function declarations", () => {
      const content = `
fn hello() {
}

pub fn public_hello() {
}

pub async fn async_hello() {
}
`;
      const symbols = extractSymbols(content, "test.rs");

      expect(symbols).toHaveLength(3);
      expect(symbols[0]).toEqual({ name: "hello", type: "function", line: 2 });
      expect(symbols[1]).toEqual({
        name: "public_hello",
        type: "function",
        line: 5,
      });
      expect(symbols[2]).toEqual({
        name: "async_hello",
        type: "function",
        line: 8,
      });
    });

    test("extracts struct and trait declarations", () => {
      const content = `
struct Config {
    name: String,
}

pub struct PublicConfig {
    name: String,
}

trait Handler {
    fn handle(&self);
}

pub trait PublicHandler {
    fn handle(&self);
}
`;
      const symbols = extractSymbols(content, "test.rs");

      const structs = symbols.filter((s) => s.type === "class");
      const traits = symbols.filter((s) => s.type === "interface");

      expect(structs).toHaveLength(2);
      expect(traits).toHaveLength(2);
      expect(structs.map((s) => s.name)).toContain("Config");
      expect(structs.map((s) => s.name)).toContain("PublicConfig");
      expect(traits.map((s) => s.name)).toContain("Handler");
      expect(traits.map((s) => s.name)).toContain("PublicHandler");
    });

    test("extracts type alias declarations", () => {
      const content = `
type Result<T> = std::result::Result<T, Error>;
pub type BoxedError = Box<dyn std::error::Error>;
`;
      const symbols = extractSymbols(content, "test.rs");

      const types = symbols.filter((s) => s.type === "type");
      expect(types).toHaveLength(2);
      expect(types.map((s) => s.name)).toContain("Result");
      expect(types.map((s) => s.name)).toContain("BoxedError");
    });

    test("handles mixed Rust file", () => {
      const content = `
use std::io;

pub struct Server {
    port: u16,
}

pub trait Logger {
    fn log(&self, msg: &str);
}

impl Server {
    pub fn new(port: u16) -> Self {
        Server { port }
    }

    pub async fn start(&self) -> io::Result<()> {
        Ok(())
    }
}

fn main() {
    let server = Server::new(8080);
}
`;
      const symbols = extractSymbols(content, "main.rs");

      const names = symbols.map((s) => s.name);
      expect(names).toContain("Server");
      expect(names).toContain("Logger");
      expect(names).toContain("new");
      expect(names).toContain("start");
      expect(names).toContain("main");
    });
  });

  describe("Unsupported languages", () => {
    test("returns empty array for unsupported extensions", () => {
      const content = "some content";

      expect(extractSymbols(content, "file.c")).toEqual([]);
      expect(extractSymbols(content, "file.cpp")).toEqual([]);
      expect(extractSymbols(content, "file.java")).toEqual([]);
      expect(extractSymbols(content, "file.txt")).toEqual([]);
      expect(extractSymbols(content, "file")).toEqual([]);
    });
  });

  describe("Line numbers", () => {
    test("correctly calculates line numbers", () => {
      const content = `line 1
line 2
function onLine3() {}
line 4
function onLine5() {}`;

      const symbols = extractSymbols(content, "test.ts");

      expect(symbols[0].line).toBe(3);
      expect(symbols[1].line).toBe(5);
    });

    test("handles Windows line endings", () => {
      const content = "line 1\r\nline 2\r\nfunction onLine3() {}";
      const symbols = extractSymbols(content, "test.ts");

      // Note: \r\n counts as 2 chars but only 1 newline for line counting
      expect(symbols[0].line).toBe(3);
    });
  });

  describe("isSupported", () => {
    test("returns true for supported extensions", () => {
      expect(isSupported("file.ts")).toBe(true);
      expect(isSupported("file.tsx")).toBe(true);
      expect(isSupported("file.js")).toBe(true);
      expect(isSupported("file.jsx")).toBe(true);
      expect(isSupported("file.py")).toBe(true);
      expect(isSupported("file.go")).toBe(true);
      expect(isSupported("file.rs")).toBe(true);
    });

    test("returns false for unsupported extensions", () => {
      expect(isSupported("file.c")).toBe(false);
      expect(isSupported("file.java")).toBe(false);
      expect(isSupported("file.txt")).toBe(false);
      expect(isSupported("file")).toBe(false);
    });

    test("handles case-insensitive extensions", () => {
      expect(isSupported("file.TS")).toBe(true);
      expect(isSupported("file.PY")).toBe(true);
    });
  });

  describe("getSupportedExtensions", () => {
    test("returns all supported extensions", () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain(".ts");
      expect(extensions).toContain(".tsx");
      expect(extensions).toContain(".js");
      expect(extensions).toContain(".jsx");
      expect(extensions).toContain(".py");
      expect(extensions).toContain(".go");
      expect(extensions).toContain(".rs");
    });
  });

  describe("extractSymbolsFromFile", () => {
    test("extracts symbols from actual file", async () => {
      // Create test fixtures directory
      await mkdir(FIXTURES_DIR, { recursive: true });

      const testFile = join(FIXTURES_DIR, "test.ts");
      await writeFile(
        testFile,
        `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Greeter {
  constructor(private name: string) {}
  greet(): string {
    return \`Hello, \${this.name}!\`;
  }
}
`
      );

      try {
        const symbols = await extractSymbolsFromFile(testFile);

        expect(symbols.length).toBeGreaterThan(0);
        expect(symbols.map((s) => s.name)).toContain("greet");
        expect(symbols.map((s) => s.name)).toContain("Greeter");
      } finally {
        await rm(FIXTURES_DIR, { recursive: true, force: true });
      }
    });

    test("returns empty array for non-existent file", async () => {
      const symbols = await extractSymbolsFromFile("/nonexistent/file.ts");
      expect(symbols).toEqual([]);
    });
  });

  describe("Edge cases", () => {
    test("handles empty content", () => {
      expect(extractSymbols("", "test.ts")).toEqual([]);
    });

    test("handles content with no symbols", () => {
      const content = `
// Just comments
/* and more comments */
import { something } from 'module';
`;
      expect(extractSymbols(content, "test.ts")).toEqual([]);
    });

    test("symbols are sorted by line number", () => {
      const content = `
const z = 1;
function a() {}
class M {}
`;
      const symbols = extractSymbols(content, "test.ts");

      expect(symbols[0].line).toBeLessThan(symbols[1].line);
      expect(symbols[1].line).toBeLessThan(symbols[2].line);
    });

    test("handles deeply nested content", () => {
      const content = `
export class Outer {
  inner = class Inner {
    method() {
      const nested = () => {};
    }
  }
}
`;
      const symbols = extractSymbols(content, "test.ts");

      // Should at least find Outer class
      expect(symbols.map((s) => s.name)).toContain("Outer");
    });
  });
});
