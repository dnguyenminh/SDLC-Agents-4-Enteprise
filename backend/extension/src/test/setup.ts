/**
 * Mocha test setup — pre-populates the require cache with a mock 'vscode' module
 * so that source files importing vscode can be loaded outside the extension host.
 */

import * as path from "path";

const Module = require("module");
const mockModule = require("./mocks/vscode");

// Create a fake module entry for 'vscode'
const fakeModule = new Module("vscode");
fakeModule.filename = "vscode";
fakeModule.loaded = true;
fakeModule.exports = mockModule;

// Insert into cache — Node resolves 'vscode' and checks cache first
Module._cache["vscode"] = fakeModule;
