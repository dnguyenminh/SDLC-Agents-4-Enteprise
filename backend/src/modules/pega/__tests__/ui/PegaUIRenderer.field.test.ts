import { describe, it, expect } from 'vitest';
import { PegaFieldRenderer } from '../../ui/PegaFieldRenderer.js';
import { PegaVisibilityEvaluator } from '../../ui/PegaVisibilityEvaluator.js';
import type { PegaField } from '../../ui/PegaUITypes.js';
import { createContext, createDateValue } from './helpers.js';

describe('PegaFieldRenderer', () => {
  const renderer = new PegaFieldRenderer();
  const context = createContext();

  it('renders field label and formatted value for Text type', () => {
    const field: PegaField = { name: 'CustomerName', label: 'Customer Name', type: 'Text', value: 'John Doe' };
    const output = renderer.renderField(field, context);
    expect(output).toContain('Customer Name (Text)');
    expect(output).toContain('John Doe');
    expect(output).toContain('class="pega-field"');
    expect(output).toContain('class="pega-field-label"');
    expect(output).toContain('class="pega-field-value"');
  });

  it('uses field name as label when label is not provided', () => {
    const field: PegaField = { name: 'Email', type: 'Text', value: 'a@b.com' };
    const output = renderer.renderField(field, context);
    expect(output).toContain('Email (Text)');
    expect(output).toContain('a@b.com');
  });

  it('renders Boolean type as Yes/No', () => {
    const fieldTrue: PegaField = { name: 'Active', type: 'Boolean', value: true };
    const fieldFalse: PegaField = { name: 'Active', type: 'TrueFalse', value: false };
    expect(renderer.renderField(fieldTrue, context)).toContain('>Yes<');
    expect(renderer.renderField(fieldFalse, context)).toContain('>No<');
  });

  it('renders Page type as page reference', () => {
    const field: PegaField = { name: 'Customer', type: 'Page', value: {} };
    const output = renderer.renderField(field, context);
    expect(output).toContain('[Page: Customer]');
  });

  it('renders PageList type with item count', () => {
    const field: PegaField = { name: 'Orders', type: 'PageList', value: [{ id: 1 }, { id: 2 }] };
    const output = renderer.renderField(field, context);
    expect(output).toContain('[PageList: 2 items]');
  });

  it('renders empty PageList as 0 items', () => {
    const field: PegaField = { name: 'Items', type: 'PageList', value: [] };
    const output = renderer.renderField(field, context);
    expect(output).toContain('[PageList: 0 items]');
  });

  it('formats Date type value as ISO string', () => {
    const date = createDateValue();
    const field: PegaField = { name: 'Created', type: 'Date', value: date };
    const output = renderer.renderField(field, context);
    expect(output).toContain(date.toISOString());
  });

  it('formats DateTime type value as ISO string', () => {
    const date = createDateValue();
    const field: PegaField = { name: 'Timestamp', type: 'DateTime', value: date };
    const output = renderer.renderField(field, context);
    expect(output).toContain(date.toISOString());
  });

  it('renders em dash for null value', () => {
    const field: PegaField = { name: 'NullableField', type: 'Text', value: null };
    const output = renderer.renderField(field, context);
    expect(output).toContain('\u2014');
  });

  it('renders em dash for undefined value', () => {
    const field: PegaField = { name: 'MissingField', type: 'Text' };
    const output = renderer.renderField(field, context);
    expect(output).toContain('\u2014');
  });

  it('formats unknown type by falling through to String conversion', () => {
    const field: PegaField = { name: 'CustomProp', type: 'UnknownType', value: 'raw-value' };
    const output = renderer.renderField(field, context);
    expect(output).toContain('CustomProp (UnknownType)');
    expect(output).toContain('raw-value');
  });

  it('sanitizes HTML in field label and value', () => {
    const field: PegaField = { name: 'XSS', label: '<script>alert("xss")</script>', type: 'Text', value: '<b>bold</b>' };
    const output = renderer.renderField(field, context);
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<b>');
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('&lt;b&gt;');
  });
});

describe('PegaVisibilityEvaluator', () => {
  const evaluator = new PegaVisibilityEvaluator();
  const context = createContext();

  it('returns true for element with visible undefined and no when', () => {
    const result = evaluator.evaluate({}, context);
    expect(result).toBe(true);
  });

  it('returns true for element with visible true', () => {
    const result = evaluator.evaluate({ visible: true }, context);
    expect(result).toBe(true);
  });

  it('returns false for element with visible false', () => {
    const result = evaluator.evaluate({ visible: false }, context);
    expect(result).toBe(false);
  });

  it('returns true when when condition evaluates to true via expression evaluator', () => {
    const result = evaluator.evaluate({ when: '.Status = "Open"' }, context);
    expect(result).toBe(true);
  });

  it('returns false when when condition evaluates to false via expression evaluator', () => {
    const result = evaluator.evaluate({ when: '.Status = "Closed"' }, context);
    expect(result).toBe(false);
  });

  it('returns true for null when ignoring visible true explicitly', () => {
    const result = evaluator.evaluate({ visible: true, when: null as unknown as string }, context);
    expect(result).toBe(true);
  });

  it('returns true when when is an empty string', () => {
    const result = evaluator.evaluate({ when: '' }, context);
    expect(result).toBe(true);
  });
});
