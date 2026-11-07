export interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string | number>;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: Array<{
    startPoint?: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
    endPoint?: { x: number; y: number };
  }>;
}

export interface RepositionedNode {
  id: string;
  x_old: number;
  y_old: number;
  x_new: number;
  y_new: number;
}

export interface LayoutFixResult {
  status: 'fixed' | 'already_good';
  message: string;
  nodes: number;
  edges: number;
  issues: object[];
  content_base64?: string;
  repositioned_nodes?: RepositionedNode[];
}

export interface NormalizedArgs {
  algorithm: string;
  spacing: number;
  direction: string;
  /** 'auto' chooses minimal fix; 'positions' forces full relayout; 'ports' only spreads edge ports. */
  scope: 'auto' | 'positions' | 'ports';
  /** Force full ELK relayout even when a minimal local repair would do. */
  relayout: boolean;
}