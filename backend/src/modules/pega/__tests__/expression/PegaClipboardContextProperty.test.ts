import { describe, it, expect } from 'vitest';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';
import { fc, isSimpleString, isValidIdentifier } from './helpers.js';

describe('ClipboardContext properties', () => {

  it('resolves single-part property preserving value across all primitive types', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      fc.integer({ min: -999, max: 999 }),
      fc.boolean(),
      (textVal, numVal, boolVal) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            TextProp: textVal,
            NumProp: numVal,
            BoolProp: boolVal,
          },
        });
        expect(ctx.resolve(['TextProp']).text).toBe(textVal);
        expect(ctx.resolve(['TextProp']).type).toBe('Text');
        expect(ctx.resolve(['NumProp']).number).toBe(numVal);
        expect(ctx.resolve(['NumProp']).type).toBe('Number');
        expect(ctx.resolve(['BoolProp']).boolean).toBe(boolVal);
        expect(ctx.resolve(['BoolProp']).type).toBe('Boolean');
      }
    ));
  });

  it('resolves nested page property via chained paths', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 8 }).filter(isSimpleString),
      fc.string({ minLength: 0, maxLength: 8 }).filter(isSimpleString),
      fc.string({ minLength: 1, maxLength: 8 }).filter(isValidIdentifier),
      fc.string({ minLength: 1, maxLength: 8 }).filter(isValidIdentifier),
      (innerVal, outerVal, innerProp, outerProp) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            [outerProp]: {
              [innerProp]: { type: 'Text', value: innerVal },
            },
            Other: { type: 'Text', value: outerVal },
          },
        });
        const nested = ctx.resolve([outerProp, innerProp]);
        expect(nested.text).toBe(innerVal);
        expect(nested.type).toBe('Text');
        const top = ctx.resolve(['Other']);
        expect(top.text).toBe(outerVal);
      }
    ));
  });

  it('resolves absolute vs relative paths consistently', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 8 }).filter(isSimpleString),
      fc.string({ minLength: 1, maxLength: 8 }).filter(isValidIdentifier),
      (propValue, propName) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            [propName]: { type: 'Text', value: propValue },
          },
        });
        const relative = ctx.resolve([propName]);
        const absolute = ctx.resolve(['pyWorkPage', propName]);
        expect(relative.text).toBe(propValue);
        expect(absolute.text).toBe(propValue);
        expect(relative.text).toBe(absolute.text);
      }
    ));
  });
});
