import { describe, it, expect } from 'vitest';
import { graphTypeForKind, KIND_TO_TYPE } from '../constants.js';

describe('graphTypeForKind', () => {
  it('maps apex_class to APEX_CLASS', () => {
    expect(graphTypeForKind('apex_class')).toBe('APEX_CLASS');
  });

  it('maps trigger to TRIGGER', () => {
    expect(graphTypeForKind('trigger')).toBe('TRIGGER');
  });

  it('maps flow to FLOW', () => {
    expect(graphTypeForKind('flow')).toBe('FLOW');
  });

  it('maps sf_object to SF_OBJECT', () => {
    expect(graphTypeForKind('sf_object')).toBe('SF_OBJECT');
  });

  it('maps sf_field to SF_FIELD', () => {
    expect(graphTypeForKind('sf_field')).toBe('SF_FIELD');
  });

  it('maps lwc_component to LWC_COMPONENT', () => {
    expect(graphTypeForKind('lwc_component')).toBe('LWC_COMPONENT');
  });

  it('maps aura_component to AURA_COMPONENT', () => {
    expect(graphTypeForKind('aura_component')).toBe('AURA_COMPONENT');
  });

  it('maps visualforce_page to VISUALFORCE_PAGE', () => {
    expect(graphTypeForKind('visualforce_page')).toBe('VISUALFORCE_PAGE');
  });

  it('maps pega_ prefix by stripping and uppercasing', () => {
    expect(graphTypeForKind('pega_rule_obj_flow')).toBe('RULE_OBJ_FLOW');
  });

  it('falls back to CODE_ENTITY for unknown kind', () => {
    expect(graphTypeForKind('unknown_xyz')).toBe('CODE_ENTITY');
  });

  it('falls back to CODE_ENTITY for empty kind', () => {
    expect(graphTypeForKind('')).toBe('CODE_ENTITY');
  });

  it('KIND_TO_TYPE contains all new kinds', () => {
    const required = ['apex_class','trigger','flow','sf_object','sf_field','lwc_component','aura_component','visualforce_page'];
    for (const k of required) {
      expect(KIND_TO_TYPE).toHaveProperty(k);
    }
  });
});
