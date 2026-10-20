import { describe, it, expect, beforeEach } from 'vitest';
import { PegaSchemaInferrer, PegaFieldDocumentor } from '../../inference/index.js';
import { PegaMetaModelRegistry } from '../../metamodel/index.js';
import { MOCK_ACTIVITY_JSON, MOCK_DATA_TRANSFORM_JSON } from '../fixtures/pega-samples.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(__dirname, '../../schemas');

describe('PegaFieldDocumentor', () => {
  let inferrer: PegaSchemaInferrer;
  let documentor: PegaFieldDocumentor;
  let registry: PegaMetaModelRegistry;

  beforeEach(async () => {
    inferrer = new PegaSchemaInferrer();
    documentor = new PegaFieldDocumentor(inferrer);
    registry = PegaMetaModelRegistry.getInstance();
    if (!registry.isKnownClass('@baseclass')) {
      await registry.initialize(schemasDir);
    }
  });

  describe('documentField', () => {
    it('generates description for Activity field', () => {
      const doc = documentor.documentField('pyActivityName', 'ResolveTicket', {});
      expect(doc.fieldName).toBe('pyActivityName');
      expect(doc.description).toBe('Name of the Activity rule to call');
      expect(doc.isReference).toBe(true);
      expect(doc.sampleValues).toContain('ResolveTicket');
    });

    it('generates description for DataTransform field', () => {
      const doc = documentor.documentField('pyModelName', 'InitializeTicketData', {});
      expect(doc.fieldName).toBe('pyModelName');
      expect(doc.description).toBe('Data Transform/Model name');
      expect(doc.isReference).toBe(true);
    });

    it('generates description for DecisionTable fields', () => {
      const doc = documentor.documentField('pyPropertyEvaluated', 'pyPriority', {});
      expect(doc.description).toBe('Property being evaluated');
    });

    it('generates description for connector fields', () => {
      const doc = documentor.documentField('pyTargetClass', 'Work-Cover-External', {});
      expect(doc.description).toBe('Target class for the connector');
      expect(doc.isReference).toBe(true);
    });

    it('handles unknown field gracefully', () => {
      const doc = documentor.documentField('pyUnknownField', 'some-value', {});
      expect(doc.description).toContain('Field pyUnknownField');
      expect(doc.isReference).toBe(false);
    });

    it('marks pxObjClass as required', () => {
      const doc = documentor.documentField('pxObjClass', 'Rule-Obj-Test', {});
      expect(doc.isRequired).toBe(true);
      expect(doc.isReference).toBe(true);
    });
  });

  describe('documentClass', () => {
    it('documents all fields in an Activity JSON', () => {
      const docs = documentor.documentClass('Rule-Obj-Activity', MOCK_ACTIVITY_JSON, registry);
      expect(docs.length).toBeGreaterThan(0);
      const labelDoc = docs.find(d => d.fieldName === 'pyLabel');
      expect(labelDoc).toBeDefined();
      expect(labelDoc!.description).toBe('Display label for the rule');
    });

    it('documents all fields in a DataTransform JSON', () => {
      const docs = documentor.documentClass('Rule-Obj-Model', MOCK_DATA_TRANSFORM_JSON, registry);
      expect(docs.length).toBeGreaterThan(0);
      const modelDoc = docs.find(d => d.fieldName === 'pyModelName');
      expect(modelDoc).toBeDefined();
      expect(modelDoc!.description).toBe('Data Transform/Model name');
    });
  });

  describe('generatePromptContext', () => {
    it('produces formatted output for an Activity', () => {
      const ctx = documentor.generatePromptContext('Rule-Obj-Activity', MOCK_ACTIVITY_JSON, registry);
      expect(ctx).toContain('Rule Type: Rule-Obj-Activity');
      expect(ctx).toContain('Fields:');
      expect(ctx).toContain('pyActivityName');
      expect(ctx).toContain('pyLabel');
      expect(ctx).toContain('ref');
      expect(ctx).toContain('optional');
    });

    it('produces formatted output with sample values', () => {
      const ctx = documentor.generatePromptContext('Rule-Obj-Activity', MOCK_ACTIVITY_JSON, registry);
      expect(ctx).toContain('ResolveTicket');
      expect(ctx).toContain('Process and Resolve Jira Ticket');
    });

    it('produces formatted output for a DataTransform', () => {
      const ctx = documentor.generatePromptContext('Rule-Obj-Model', MOCK_DATA_TRANSFORM_JSON, registry);
      expect(ctx).toContain('Rule Type: Rule-Obj-Model');
      expect(ctx).toContain('pyModelName');
      expect(ctx).toContain('InitializeTicketData');
    });
  });
});
