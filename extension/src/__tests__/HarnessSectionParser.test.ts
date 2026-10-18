/**
 * Unit Tests for HarnessSectionParser (SA4E-93).
 * Covers TC-UT-05 to TC-UT-07: recursive extraction, empty handling.
 * (Split from HarnessSectionParser.test.ts — extraction concern.)
 */

import { describe, it, expect } from "vitest";
import { HarnessSectionParser } from "../services/HarnessSectionParser";

describe("HarnessSectionParser", () => {
  const parser = new HarnessSectionParser();

  describe("TC-UT-05: Single section with 3 controls", () => {
    it("should extract 3 ControlDefinitions from pyControls array", () => {
      const harnessJson = {
        pyContentSection: {
          pyControls: [
            { pyFieldName: "pyFirstName", pyControlType: "pxTextInput", pyLabel: "First Name" },
            { pyFieldName: "pyEnabled", pyControlType: "pxCheckbox", pyMandatory: true },
            { pyFieldName: "pyStatus", pyControlType: "pxDropdown", pyValidValues: ["A", "B"] },
          ],
        },
      };
      const result = parser.extractControls(harnessJson);
      expect(result).toHaveLength(3);
      expect(result[0].fieldName).toBe("pyFirstName");
      expect(result[0].controlType).toBe("TextInput");
      expect(result[1].fieldName).toBe("pyEnabled");
      expect(result[1].controlType).toBe("Checkbox");
      expect(result[1].required).toBe(true);
      expect(result[2].fieldName).toBe("pyStatus");
      expect(result[2].controlType).toBe("Dropdown");
    });
  });

  describe("TC-UT-06: Nested sections (2 levels)", () => {
    it("should flatten controls from nested pySections", () => {
      const harnessJson = {
        pyContentSection: {
          pyControls: [
            { pyFieldName: "pyTopLevel1", pyControlType: "pxTextInput" },
            { pyFieldName: "pyTopLevel2", pyControlType: "pxNumber" },
          ],
          pySections: [
            {
              pyControls: [
                { pyFieldName: "pyNested1", pyControlType: "pxCheckbox" },
                { pyFieldName: "pyNested2", pyControlType: "pxTextArea" },
                { pyFieldName: "pyNested3", pyControlType: "pxDateTime" },
              ],
            },
          ],
        },
      };
      const result = parser.extractControls(harnessJson);
      expect(result).toHaveLength(5);
      const fieldNames = result.map(c => c.fieldName);
      expect(fieldNames).toContain("pyTopLevel1");
      expect(fieldNames).toContain("pyTopLevel2");
      expect(fieldNames).toContain("pyNested1");
      expect(fieldNames).toContain("pyNested2");
      expect(fieldNames).toContain("pyNested3");
    });

    it("should flatten controls from deeply nested pyLayouts", () => {
      const harnessJson = {
        pyContentSection: {
          pyLayouts: [
            {
              pyControls: [
                { pyFieldName: "pyLayoutField", pyControlType: "pxTextInput" },
              ],
              pyLayouts: [
                {
                  pyControls: [
                    { pyFieldName: "pyDeepField", pyControlType: "pxInteger" },
                  ],
                },
              ],
            },
          ],
        },
      };
      const result = parser.extractControls(harnessJson);
      const fieldNames = result.map(c => c.fieldName);
      expect(fieldNames).toContain("pyLayoutField");
      expect(fieldNames).toContain("pyDeepField");
    });
  });

  describe("TC-UT-07: Empty section (no controls)", () => {
    it("should return empty array for empty pyControls", () => {
      const harnessJson = {
        pyContentSection: {
          pyControls: [],
        },
      };
      const result = parser.extractControls(harnessJson);
      expect(result).toEqual([]);
    });

    it("should return empty array for section with no pyControls key", () => {
      const harnessJson = {
        pyContentSection: {
          someOtherProp: "value",
        },
      };
      const result = parser.extractControls(harnessJson);
      expect(result).toEqual([]);
    });

    it("should return empty array for completely empty harness JSON", () => {
      const result = parser.extractControls({});
      expect(result).toEqual([]);
    });

    it("should handle non-object section gracefully", () => {
      const harnessJson = {
        pyContentSection: "not-an-object",
      };
      const result = parser.extractControls(harnessJson as any);
      expect(result).toEqual([]);
    });
  });

});
