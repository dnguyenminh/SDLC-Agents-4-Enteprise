// Shared test fixtures for PegaPortalParser test split (verbatim from original suite).
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';

export function createContext(): PegaClipboardContext {
  return new PegaClipboardContext({
    pyWorkPage: {
      Status: { type: 'Text', value: 'Open' },
      Amount: { type: 'Number', value: 150.5 },
      CustomerName: { type: 'Text', value: 'John Doe' },
    },
  });
}

export function sectionJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pxObjClass: 'Rule-HTML-Section',
    pyRuleName: 'TestSection',
    pyName: 'TestSection',
    pyType: 'Section',
    pyClassName: 'Work-Order',
    pyLayouts: [
      {
        type: 'dynamic',
        fields: [
          { name: 'CustomerName', label: 'Customer Name', type: 'Text', value: 'John Doe' },
          { name: 'Amount', label: 'Amount', type: 'Number', value: 150.5 },
        ],
      },
    ],
    pyFields: [
      { name: 'Status', label: 'Status', type: 'Text', value: 'Open' },
    ],
    ...overrides,
  };
}

export function harnessJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pxObjClass: 'Rule-HTML-Harness',
    pyRuleName: 'TestHarness',
    pyName: 'TestHarness',
    pyClassName: 'Work-Order',
    pyHeader: {
      pyName: 'HeaderSection',
      pyLayouts: [
        { type: 'dynamic', fields: [{ name: 'Title', label: 'Title', type: 'Text', value: 'Header Title' }] },
      ],
      pyFields: [],
    },
    pyContent: {
      pyName: 'ContentSection',
      pyLayouts: [
        { type: 'dynamic', fields: [{ name: 'Body', label: 'Body', type: 'Text', value: 'Main Content' }] },
      ],
      pyFields: [],
    },
    pyFooter: {
      pyName: 'FooterSection',
      pyLayouts: [
        { type: 'dynamic', fields: [{ name: 'Copyright', label: 'Copyright', type: 'Text', value: '2026' }] },
      ],
      pyFields: [],
    },
    pyPortal: 'MyPortal',
    pySkin: 'MySkin',
    ...overrides,
  };
}

export function flowActionJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pxObjClass: 'Rule-HTML-FlowAction',
    pyRuleName: 'ApproveAction',
    pyName: 'ApproveAction',
    pyClassName: 'Work-Order',
    pyLayouts: [
      {
        type: 'dynamic',
        fields: [{ name: 'Comment', label: 'Comment', type: 'Text', value: '' }],
      },
    ],
    pyFields: [],
    ...overrides,
  };
}

export function portalJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pxObjClass: 'Rule-Portal',
    pyRuleName: 'MyPortal',
    pyName: 'MyPortal',
    pyLabel: 'My Custom Portal',
    pyClassName: 'Work-Order',
    pyPortals: ['SubPortalA', 'SubPortalB'],
    pySkins: ['CorporateSkin'],
    ...overrides,
  };
}

export function skinJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pxObjClass: 'Rule-Portal-Skin',
    pyRuleName: 'CorporateSkin',
    pyName: 'CorporateSkin',
    pyClassName: '@baseclass',
    pyColors: { primary: '#1976d2', secondary: '#f5f5f5', accent: '#ff5722' },
    pyBackground: '#ffffff',
    pyFonts: { heading: 'Roboto', body: 'Open Sans' },
    ...overrides,
  };
}

export function navigationJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pxObjClass: 'Rule-Navigation',
    pyRuleName: 'MainNav',
    pyName: 'MainNav',
    pyClassName: '@baseclass',
    pyMenuItems: [
      { label: 'Home', url: '/home', icon: 'home' },
      { label: 'Orders', url: '/orders', icon: 'list' },
      {
        label: 'Admin',
        icon: 'settings',
        children: [
          { label: 'Users', url: '/admin/users' },
          { label: 'Config', url: '/admin/config' },
        ],
      },
    ],
    ...overrides,
  };
}
