/**
 * Layout/field conversion helpers for PegaPortalParser.
 * Extracted (BR-18) — pure functions over the portal JSON shapes; no behavior change.
 */

import type { LayoutType, PegaLayout, PegaField } from '../../ui/PegaUITypes.js';
import type { PortalLayout, PortalField, SectionType } from '../PegaPortalTypes.js';

export const LAYOUT_TYPE_MAP: Record<string, LayoutType> = {
  dynamic: 'dynamic',
  tab: 'tab',
  repeating: 'repeating',
  table: 'table',
};

export function convertField(raw: Record<string, unknown>): PortalField {
  return {
    name: (raw.name as string) || (raw.pyName as string) || (raw.pyPropertyName as string) || '',
    label: (raw.label as string) || (raw.pyLabel as string) || undefined,
    type: (raw.type as string) || (raw.pyType as string) || undefined,
    value: raw.value ?? raw.pyValue ?? undefined,
    visible: raw.visible !== undefined ? Boolean(raw.visible) : undefined,
    when: (raw.when as string) || (raw.pyWhen as string) || undefined,
  };
}

export function parseFields(raw: unknown): PortalField[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => convertField(f as Record<string, unknown>));
}

export function convertLayout(raw: Record<string, unknown>): PortalLayout {
  const childrenRaw = raw.children as unknown[];
  const fieldsRaw = raw.fields as unknown[];
  return {
    type: (raw.type as string) || (raw.pyLayoutType as string) || undefined,
    fields: Array.isArray(fieldsRaw) ? fieldsRaw.map((f) => convertField(f as Record<string, unknown>)) : undefined,
    children: Array.isArray(childrenRaw)
      ? childrenRaw.map((c) => convertLayout(c as Record<string, unknown>))
      : undefined,
    properties: raw.properties ? { ...raw.properties as Record<string, unknown> } : undefined,
    visible: raw.visible !== undefined ? Boolean(raw.visible) : undefined,
    when: (raw.when as string) || (raw.pyWhen as string) || undefined,
  };
}

export function portalLayoutToPegaLayout(layout: PortalLayout): PegaLayout {
  return {
    type: layout.type ? (LAYOUT_TYPE_MAP[layout.type] || 'dynamic') : undefined,
    fields: layout.fields?.map((f) => portalFieldToPegaField(f)),
    children: layout.children?.map((c) => portalLayoutToPegaLayout(c)),
    properties: layout.properties,
    visible: layout.visible,
    when: layout.when,
  };
}

export function portalFieldToPegaField(field: PortalField): PegaField {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    value: field.value,
    visible: field.visible,
    when: field.when,
  };
}

export function inferSectionType(json: Record<string, unknown>): SectionType {
  const cls = (json.pxObjClass as string) || '';
  if (cls === 'Rule-HTML-Harness') return 'Harness';
  if (cls === 'Rule-HTML-FlowAction') return 'FlowAction';
  return 'Section';
}

export function asStringArray(val: unknown): string[] {
  return Array.isArray(val) ? (val as string[]).filter((s) => typeof s === 'string') : [];
}
