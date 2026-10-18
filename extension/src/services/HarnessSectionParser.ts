/**
 * HarnessSectionParser — Extracts control definitions from raw harness JSON (SA4E-93).
 * Recursively walks pyHeaderSection/pyContentSection/pyFooterSection + pySections.
 * Pure function module — no side effects, no I/O.
 *
 * Deep-scan fallback and control-type mapping live in ./HarnessSectionParser/*.
 */

import type { ControlDefinition, PegaControlType } from "../models";
import { inferControlType } from "./HarnessSectionParser/control-type";
import { deepScanForControls } from "./HarnessSectionParser/deep-scan";

/** Top-level section keys in harness JSON */
const SECTION_KEYS = ["pyHeaderSection", "pyContentSection", "pyFooterSection"];

export class HarnessSectionParser {
  /**
   * Extract all UI controls from a raw harness JSON object.
   * Handles multiple Pega harness structures:
   * 1. pyHeaderSection/pyContentSection/pyFooterSection (design-time sections)
   * 2. pyLayouts / pxLayouts at top-level (actual rule JSON from Service 1)
   * @param harnessJson Full harness JSON from Pega
   * @returns Flat array of control definitions (deduplicated by fieldName)
   */
  public extractControls(harnessJson: Record<string, unknown>): ControlDefinition[] {
    const controls: ControlDefinition[] = [];
    // Path 1: Named section keys (pyHeaderSection, pyContentSection, pyFooterSection)
    for (const key of SECTION_KEYS) {
      const section = harnessJson[key];
      if (section) { controls.push(...this.parseSection(section)); }
    }
    // Path 2: Top-level pyLayouts (real harness JSON from Pega Service 1)
    if (Array.isArray(harnessJson.pyLayouts)) {
      for (const layout of harnessJson.pyLayouts) {
        controls.push(...this.parseSection(layout));
      }
    }
    // Path 3: Top-level pxLayouts (alternative key used in some Pega versions)
    if (Array.isArray(harnessJson.pxLayouts)) {
      for (const layout of harnessJson.pxLayouts) {
        controls.push(...this.parseSection(layout));
      }
    }
    // Path 4: Deep scan fallback for non-standard harness structures
    if (controls.length === 0) {
      controls.push(...deepScanForControls(harnessJson));
    }
    return this.deduplicateByFieldName(controls);
  }

  /** Recursively parse a section/layout for controls */
  private parseSection(section: unknown): ControlDefinition[] {
    if (!section || typeof section !== "object") { return []; }
    const sec = section as Record<string, unknown>;
    const controls: ControlDefinition[] = [];
    this.extractFromControls(sec, controls);
    this.extractFromProperties(sec, controls);
    this.extractFromNestedSections(sec, controls);
    return controls;
  }

  /** Extract controls from pyControls array */
  private extractFromControls(
    sec: Record<string, unknown>, out: ControlDefinition[],
  ): void {
    const pyControls = sec.pyControls;
    if (!Array.isArray(pyControls)) { return; }
    for (const ctrl of pyControls) {
      const def = this.mapRawControl(ctrl as Record<string, unknown>);
      if (def) { out.push(def); }
    }
  }

  /** Extract controls from direct properties (alternative structure) */
  private extractFromProperties(
    sec: Record<string, unknown>, out: ControlDefinition[],
  ): void {
    const fieldName = this.resolveFieldName(sec);
    if (fieldName) {
      const controlType = inferControlType(sec);
      out.push(this.buildControlDef(sec, fieldName, controlType));
    }
  }

  /** Recurse into nested pySections, pyLayouts, and pxLayouts */
  private extractFromNestedSections(
    sec: Record<string, unknown>, out: ControlDefinition[],
  ): void {
    const pySections = sec.pySections;
    if (Array.isArray(pySections)) {
      for (const nested of pySections) { out.push(...this.parseSection(nested)); }
    }
    const pyLayouts = sec.pyLayouts;
    if (Array.isArray(pyLayouts)) {
      for (const layout of pyLayouts) { out.push(...this.parseSection(layout)); }
    }
    // SA4E-93 fix: Also check pxLayouts (used in real Pega harness JSON)
    const pxLayouts = sec.pxLayouts;
    if (Array.isArray(pxLayouts)) {
      for (const layout of pxLayouts) { out.push(...this.parseSection(layout)); }
    }
  }

  /** Map raw control object to ControlDefinition */
  private mapRawControl(ctrl: Record<string, unknown>): ControlDefinition | null {
    const fieldName = this.resolveFieldName(ctrl);
    if (!fieldName) { return null; }
    const controlType = inferControlType(ctrl);
    return this.buildControlDef(ctrl, fieldName, controlType);
  }

  /** Build a ControlDefinition from raw properties */
  private buildControlDef(
    props: Record<string, unknown>, fieldName: string, controlType: PegaControlType,
  ): ControlDefinition {
    return {
      fieldName,
      controlType,
      required: props.pyMandatory === true || props.pyMandatory === "true",
      label: (props.pyLabel as string) || undefined,
      tooltip: (props.pyTooltip as string) || undefined,
      defaultValue: (props.pyDefaultValue as string) || undefined,
      validValues: Array.isArray(props.pyValidValues) ? props.pyValidValues : undefined,
      maxLength: typeof props.pyMaxLength === "number" ? props.pyMaxLength : undefined,
      minimum: typeof props.pyMinimum === "number" ? props.pyMinimum : undefined,
      maximum: typeof props.pyMaximum === "number" ? props.pyMaximum : undefined,
    };
  }

  /** Resolve field name from various raw property keys */
  private resolveFieldName(props: Record<string, unknown>): string | undefined {
    return (props.pyFieldName as string)
      || (props.pyPropertyName as string)
      || undefined;
  }

  /** Remove duplicate controls keeping first occurrence per fieldName */
  private deduplicateByFieldName(controls: ControlDefinition[]): ControlDefinition[] {
    const seen = new Set<string>();
    return controls.filter((c) => {
      if (seen.has(c.fieldName)) { return false; }
      seen.add(c.fieldName);
      return true;
    });
  }
}
