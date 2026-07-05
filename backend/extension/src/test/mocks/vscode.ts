/**
 * Mock vscode module for unit testing outside the extension host.
 * Provides stubs for commonly used VS Code APIs.
 */

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data: T): void {
    this.listeners.forEach(l => l(data));
  }
  dispose(): void {
    this.listeners = [];
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string;
  collapsibleState: TreeItemCollapsibleState;
  command?: { command: string; title: string };
  iconPath?: ThemeIcon;
  description?: string;
  children?: TreeItem[];

  constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export class Uri {
  readonly scheme: string;
  readonly path: string;
  readonly fsPath: string;

  private constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
    this.fsPath = path;
  }

  static file(path: string): Uri {
    return new Uri("file", path);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path, ...segments].join("/"));
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export interface WebviewPanel {
  webview: Webview;
  reveal: () => void;
  dispose: () => void;
  onDidDispose: (listener: () => void, thisArg?: unknown, disposables?: { dispose(): void }[]) => { dispose(): void };
  visible: boolean;
  viewType: string;
  title: string;
}

export interface Webview {
  html: string;
  postMessage: (msg: unknown) => Thenable<boolean>;
  onDidReceiveMessage: (listener: (msg: unknown) => void, thisArg?: unknown, disposables?: { dispose(): void }[]) => { dispose(): void };
  asWebviewUri: (uri: Uri) => Uri;
  cspSource: string;
}

export interface OutputChannel {
  appendLine: (value: string) => void;
  append: (value: string) => void;
  show: () => void;
  dispose: () => void;
}

export const window = {
  createWebviewPanel: (_viewType: string, _title: string, _column: ViewColumn, _options?: unknown): WebviewPanel => {
    const webview: Webview = {
      html: "",
      postMessage: () => Promise.resolve(true),
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      asWebviewUri: (uri: Uri) => uri,
      cspSource: "https://mock.csp",
    };
    return {
      webview,
      reveal: () => {},
      dispose: () => {},
      onDidDispose: () => ({ dispose: () => {} }),
      visible: true,
      viewType: _viewType,
      title: _title,
    };
  },
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  createOutputChannel: (): OutputChannel => ({
    appendLine: () => {},
    append: () => {},
    show: () => {},
    dispose: () => {},
  }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(),
};

export const workspace = {
  workspaceFolders: [{ uri: Uri.file("/test-workspace"), name: "test", index: 0 }],
  getConfiguration: () => ({
    get: () => undefined,
    update: () => Promise.resolve(),
  }),
};

export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose(): void { this.callOnDispose(); }
  static from(...disposables: { dispose(): void }[]): Disposable {
    return new Disposable(() => disposables.forEach(d => d.dispose()));
  }
}
