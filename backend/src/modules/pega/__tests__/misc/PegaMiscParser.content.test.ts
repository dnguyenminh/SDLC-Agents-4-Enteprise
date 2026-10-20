import { describe, it, expect } from 'vitest';
import { PegaMiscParser } from '../../misc/PegaMiscParser.js';

describe('PegaMiscParser', () => {
  const parser = new PegaMiscParser();

  // ─── Group 9: Correspondence — subject/body/from ──────────────────────

  describe('Correspondence parsing', () => {
    it('parses Correspondence with subject, body, from address', () => {
      const json = {
        pxObjClass: 'Rule-Corr-Email',
        pyRuleName: 'WelcomeEmail',
        pyType: 'Email',
        pySubject: 'Welcome to our platform',
        pyBody: 'Dear {{.Customer.Name}},\n\nWelcome!',
        pyFromAddress: 'noreply@example.com',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('WelcomeEmail');

      const typed = parser.parseCorrespondence(json);
      expect(typed.pyName).toBe('WelcomeEmail');
      expect(typed.pyType).toBe('Email');
      expect(typed.pySubject).toBe('Welcome to our platform');
      expect(typed.pyBody).toBe('Dear {{.Customer.Name}},\n\nWelcome!');
      expect(typed.pyFromAddress).toBe('noreply@example.com');
    });

    it('handles Correspondence with missing optional fields', () => {
      const json = {
        pxObjClass: 'Rule-Corr-SMS',
        pyRuleName: 'AlertSMS',
      };

      const typed = parser.parseCorrespondence(json);
      expect(typed.pyType).toBeUndefined();
      expect(typed.pySubject).toBeUndefined();
      expect(typed.pyBody).toBeUndefined();
      expect(typed.pyFromAddress).toBeUndefined();
    });
  });

  // ─── Group 10: File rules + Edit rules ────────────────────────────────

  describe('File rules + Edit rules', () => {
    it('parses FileBinary and FileText', () => {
      const binaryJson = {
        pxObjClass: 'Rule-File-Binary',
        pyRuleName: 'LogoImage',
        pyFilePath: '/assets/logo.png',
        pyMimeType: 'image/png',
      };

      const binary = parser.parseFileBinary(binaryJson);
      expect(binary.pyName).toBe('LogoImage');
      expect(binary.pyFilePath).toBe('/assets/logo.png');
      expect(binary.pyMimeType).toBe('image/png');

      const textJson = {
        pxObjClass: 'Rule-File-Text',
        pyRuleName: 'ConfigJSON',
        pyContent: '{"version": "1.0"}',
      };

      const text = parser.parseFileText(textJson);
      expect(text.pyName).toBe('ConfigJSON');
      expect(text.pyContent).toBe('{"version": "1.0"}');
    });

    it('parses EditValidate with validate type, class, message', () => {
      const json = {
        pxObjClass: 'Rule-Edit-Validate',
        pyRuleName: 'ValidateEmail',
        pyValidateType: 'Prompt',
        pyClass: 'Work-Contact',
        pyMessage: 'Please enter a valid email address',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('ValidateEmail');

      const typed = parser.parseEditValidate(json);
      expect(typed.pyName).toBe('ValidateEmail');
      expect(typed.pyValidateType).toBe('Prompt');
      expect(typed.pyClass).toBe('Work-Contact');
      expect(typed.pyMessage).toBe('Please enter a valid email address');
    });
  });

  // ─── Group 11: AutoTest + Utility ──────────────────────────────────────

  describe('AutoTest + Utility', () => {
    it('parses AutoTest with test script and expectations', () => {
      const json = {
        pxObjClass: 'Rule-Test-AutoTest',
        pyRuleName: 'LoginTest',
        pyTestScript: ['OpenLoginPage', 'EnterCredentials', 'ClickLogin'],
        pyExpectations: ['DashboardVisible', 'UserNameDisplayed'],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('LoginTest');

      const typed = parser.parseAutoTest(json);
      expect(typed.pyName).toBe('LoginTest');
      expect(typed.pyTestScript).toEqual(['OpenLoginPage', 'EnterCredentials', 'ClickLogin']);
      expect(typed.pyExpectations).toEqual(['DashboardVisible', 'UserNameDisplayed']);
    });

    it('parses Utility with code, language, parameters', () => {
      const json = {
        pxObjClass: 'Rule-Utility-Script',
        pyRuleName: 'CalculateTax',
        pyCode: 'return amount * 0.1;',
        pyLanguage: 'JS',
        pyParameters: ['amount'],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('CalculateTax');

      const typed = parser.parseUtility(json);
      expect(typed.pyName).toBe('CalculateTax');
      expect(typed.pyCode).toBe('return amount * 0.1;');
      expect(typed.pyLanguage).toBe('JS');
      expect(typed.pyParameters).toEqual(['amount']);
    });
  });
});
