/**
 * SA4E-336 — SEC-03: unit tests for normalizePsCommand + pattern helpers.
 * Direct coverage of the normalization step (decode / de-escape / collapse /
 * lower-case / decoded flag) that the gate relies on (TDD §7.3.1).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizePsCommand,
  isReadonlyPsCommand,
  matchedDestructiveCategory,
} from '../ps-command-patterns';

describe('normalizePsCommand (TDD §7.3.1)', () => {
  it('lower-cases and collapses whitespace', () => {
    const r = normalizePsCommand('  Get-ChildItem    .  ');
    expect(r.text).toBe('get-childitem .');
    expect(r.decoded).toBe(true);
  });

  it('strips backtick / caret escapes so remove-item is revealed', () => {
    expect(normalizePsCommand('Remo`ve-Item .').text).toContain('remove-item');
    expect(normalizePsCommand('Remo^ve-Item .').text).toContain('remove-item');
  });

  it('resolves trivial string concat', () => {
    expect(normalizePsCommand("& ('Remov'+'e-Item') .").text).toContain('remove-item');
  });

  it('decodes -EncodedCommand base64 payload', () => {
    // base64 of "Remove-Item -Recurse ." (UTF-8 — accepted by UTF-16 or UTF-8 path)
    const b64 = Buffer.from('Remove-Item -Recurse .', 'utf16le').toString('base64');
    const r = normalizePsCommand(`powershell -EncodedCommand ${b64}`);
    expect(r.decoded).toBe(true);
    expect(r.text).toContain('remove-item');
  });

  it('flags undecodable encoded payload as decoded=false', () => {
    const r = normalizePsCommand('powershell -EncodedCommand @@@not-base64@@@');
    expect(r.decoded).toBe(false);
  });

  it('flags dynamic eval ($var) as decoded=false', () => {
    expect(normalizePsCommand('iex $runtimeString').decoded).toBe(false);
    expect(normalizePsCommand('Invoke-Expression $cmd').decoded).toBe(false);
  });
});

describe('isReadonlyPsCommand', () => {
  it('accepts anchored safe cmdlets', () => {
    expect(isReadonlyPsCommand('get-childitem .')).toBe(true);
    expect(isReadonlyPsCommand('get-content a.txt')).toBe(true);
  });

  it('rejects compound statements with a destructive tail', () => {
    expect(isReadonlyPsCommand('get-content a.txt; remove-item .')).toBe(false);
  });

  it('rejects empty + non-allowlisted commands', () => {
    expect(isReadonlyPsCommand('')).toBe(false);
    expect(isReadonlyPsCommand('get-random')).toBe(false);
  });
});

describe('matchedDestructiveCategory', () => {
  it('returns a category id for destructive commands', () => {
    expect(matchedDestructiveCategory('remove-item -recurse .')).toContain('DESTRUCTIVE_');
    expect(matchedDestructiveCategory('stop-process -name node')).toContain('DESTRUCTIVE_');
  });

  it('returns null for safe commands', () => {
    expect(matchedDestructiveCategory('get-childitem .')).toBeNull();
  });
});
