/**
 * Shared setup and inline Rust source fixtures for RustParser unit tests
 * (KSA-151). Extracted from rust-parser.test.ts to keep each file under the
 * CI line-count gate (<=200 lines). No logic changed — fixtures relocated.
 */

import { Parser, Language } from 'web-tree-sitter';
import * as fs from 'fs';
import * as path from 'path';
import RustParser from '../rust-parser.js';

export const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

export async function setup() {
  await Parser.init();
  const parser = new Parser();
  const wasmPath = path.resolve(
    __dirname,
    '../../grammars/tree-sitter-rust.wasm'
  );
  if (!fs.existsSync(wasmPath)) {
    console.error(`[skip] Rust WASM grammar not found at ${wasmPath}`);
    return null;
  }
  const language = await Language.load(wasmPath);
  parser.setLanguage(language);
  return new RustParser(parser, 'rust');
}

export const FUNCTIONS_SRC = `pub fn hello(name: &str) -> String {
    format!("Hello, {}", name)
}

fn private_helper() {}`;

export const ASYNC_UNSAFE_SRC = `pub async fn fetch(url: &str) -> Result<Vec<u8>, Error> {
    Ok(vec![])
}

pub unsafe fn raw_ptr(p: *mut u8) -> u8 {
    *p
}`;

export const STRUCTS_SRC = `pub struct Config {
    host: String,
    port: u16,
}

struct Internal {
    data: Vec<u8>,
}`;

export const ENUMS_SRC = `pub enum Status {
    Active,
    Inactive,
    Error(String),
}`;

export const TRAITS_SRC = `pub trait Serializable {
    fn serialize(&self) -> Vec<u8>;
    fn deserialize(data: &[u8]) -> Self;
}`;

export const IMPL_BLOCKS_SRC = `struct Server {
    port: u16,
}

impl Server {
    pub fn new(port: u16) -> Self {
        Self { port }
    }

    pub fn start(&self) {
        println!("Starting on port {}", self.port);
    }

    fn internal_setup(&mut self) {}
}`;

export const TRAIT_IMPLS_SRC = `struct MyStruct;

trait Display {
    fn fmt(&self) -> String;
}

impl Display for MyStruct {
    fn fmt(&self) -> String {
        "MyStruct".to_string()
    }
}`;

export const MODULES_SRC = `pub mod utils {
    pub fn helper() -> i32 {
        42
    }
}

mod internal;`;

export const MACRO_DEF_SRC = `macro_rules! my_macro {
    ($x:expr) => { $x + 1 };
}`;

export const CONSTS_SRC = `pub const MAX_SIZE: usize = 1024;
static mut COUNTER: u32 = 0;`;

export const USE_SIMPLE_SRC = `use std::collections::HashMap;
use std::io::Read;

fn main() {}`;

export const USE_GROUPED_SRC = `use std::io::{self, Read, Write};

fn main() {}`;

export const USE_GLOB_SRC = `use std::prelude::*;

fn main() {}`;

export const PUB_USE_SRC = `pub use crate::config::Settings;

fn main() {}`;

export const CALLS_SRC = `fn main() {
    let x = compute(42);
    process(x);
}

fn compute(n: i32) -> i32 { n * 2 }
fn process(n: i32) {}`;

export const MACRO_CALLS_SRC = `fn main() {
    println!("hello");
    vec![1, 2, 3];
}`;

export const DERIVE_SRC = `#[derive(Debug, Clone, Serialize)]
pub struct Config {
    name: String,
}`;

export const VISIBILITY_SRC = `pub fn public_fn() {}
pub(crate) fn crate_fn() {}
fn private_fn() {}`;
