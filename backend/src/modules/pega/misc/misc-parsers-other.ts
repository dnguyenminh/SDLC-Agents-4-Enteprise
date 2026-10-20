/** Misc rule parser impls — report/corr/file/edit/test/utility/other rules (BR-18). */
import type {
  ReportDef, ReportFilter, ReportSortField, ReportColumn,
  Correspondence, FileBinary, FileText, EditValidate, AutoTest,
  Utility, Message, Stream, Shortcut,
} from './PegaMiscTypes.js';
import { extractMiscName } from './misc-utils.js';

export function parseReportDef(json: Record<string, unknown>): ReportDef {
  const rawFilters = json.pyFilters as unknown[];
  const filters: ReportFilter[] = [];
  if (Array.isArray(rawFilters)) {
    for (const raw of rawFilters) {
      if (!raw || typeof raw !== 'object') continue;
      const f = raw as Record<string, unknown>;
      filters.push({
        pyProperty: (f.pyProperty as string) || '',
        pyOperator: (f.pyOperator as string) || '',
        pyValue: (f.pyValue as string) || '',
      });
    }
  }

  const rawSortFields = json.pySortFields as unknown[];
  const sortFields: ReportSortField[] = [];
  if (Array.isArray(rawSortFields)) {
    for (const raw of rawSortFields) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      sortFields.push({
        pyProperty: (s.pyProperty as string) || '',
        pyOrder: (s.pyOrder as 'ASC' | 'DESC') || 'ASC',
      });
    }
  }

  const rawColumns = json.pyColumns as unknown[];
  const columns: ReportColumn[] = [];
  if (Array.isArray(rawColumns)) {
    for (const raw of rawColumns) {
      if (!raw || typeof raw !== 'object') continue;
      const c = raw as Record<string, unknown>;
      columns.push({
        pyProperty: (c.pyProperty as string) || '',
        pyLabel: (c.pyLabel as string) || '',
        pySortable: c.pySortable !== undefined ? Boolean(c.pySortable) : undefined,
      });
    }
  }

  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Obj-Report-',
    pyName: extractMiscName(json),
    pyDatasource: (json.pyDatasource as string) || undefined,
    pyFilters: filters.length > 0 ? filters : undefined,
    pySortFields: sortFields.length > 0 ? sortFields : undefined,
    pyColumns: columns.length > 0 ? columns : undefined,
  };
}

export function parseCorrespondence(json: Record<string, unknown>): Correspondence {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Corr-',
    pyName: extractMiscName(json),
    pyType: (json.pyType as 'Email' | 'Letter' | 'SMS') || undefined,
    pySubject: (json.pySubject as string) || undefined,
    pyBody: (json.pyBody as string) || undefined,
    pyFromAddress: (json.pyFromAddress as string) || undefined,
  };
}

export function parseFileBinary(json: Record<string, unknown>): FileBinary {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-File-Binary',
    pyName: extractMiscName(json),
    pyFilePath: (json.pyFilePath as string) || undefined,
    pyMimeType: (json.pyMimeType as string) || undefined,
  };
}

export function parseFileText(json: Record<string, unknown>): FileText {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-File-Text',
    pyName: extractMiscName(json),
    pyContent: (json.pyContent as string) || undefined,
  };
}

export function parseEditValidate(json: Record<string, unknown>): EditValidate {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Edit-Validate',
    pyName: extractMiscName(json),
    pyValidateType: (json.pyValidateType as 'Prompt' | 'List' | 'Table') || undefined,
    pyClass: (json.pyClass as string) || undefined,
    pyMessage: (json.pyMessage as string) || undefined,
  };
}

export function parseAutoTest(json: Record<string, unknown>): AutoTest {
  const rawScript = json.pyTestScript as unknown[];
  const script: string[] = [];
  if (Array.isArray(rawScript)) {
    for (const raw of rawScript) {
      if (typeof raw === 'string') script.push(raw);
    }
  }

  const rawExpectations = json.pyExpectations as unknown[];
  const expectations: string[] = [];
  if (Array.isArray(rawExpectations)) {
    for (const raw of rawExpectations) {
      if (typeof raw === 'string') expectations.push(raw);
    }
  }

  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Test-AutoTest',
    pyName: extractMiscName(json),
    pyTestScript: script.length > 0 ? script : undefined,
    pyExpectations: expectations.length > 0 ? expectations : undefined,
  };
}

export function parseUtility(json: Record<string, unknown>): Utility {
  const rawParams = json.pyParameters as unknown[];
  const parameters: string[] = [];
  if (Array.isArray(rawParams)) {
    for (const raw of rawParams) {
      if (typeof raw === 'string') parameters.push(raw);
    }
  }

  const langRaw = (json.pyLanguage as string) || '';
  let language: 'Java' | 'JS' | 'SQL' | undefined;
  if (langRaw === 'Java' || langRaw === 'JS' || langRaw === 'SQL') {
    language = langRaw;
  }

  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Utility-',
    pyName: extractMiscName(json),
    pyCode: (json.pyCode as string) || undefined,
    pyLanguage: language,
    pyParameters: parameters.length > 0 ? parameters : undefined,
  };
}

export function parseMessage(json: Record<string, unknown>): Message {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Message',
    pyName: extractMiscName(json),
    pyText: (json.pyText as string) || undefined,
  };
}

export function parseStream(json: Record<string, unknown>): Stream {
  const rawGroups = json.pyGroups as unknown[];
  const groups: string[] = [];
  if (Array.isArray(rawGroups)) {
    for (const raw of rawGroups) {
      if (typeof raw === 'string') groups.push(raw);
    }
  }

  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Stream',
    pyName: extractMiscName(json),
    pyDataSource: (json.pyDataSource as string) || undefined,
    pyGroups: groups.length > 0 ? groups : undefined,
  };
}

export function parseShortcut(json: Record<string, unknown>): Shortcut {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Shortcut',
    pyName: extractMiscName(json),
    pyTarget: (json.pyTarget as string) || undefined,
  };
}
