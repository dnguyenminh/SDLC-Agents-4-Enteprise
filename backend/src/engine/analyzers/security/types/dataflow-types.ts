export interface Definition {
  variable: string;
  line: number;
  blockId: number;
  id: number;
}

export interface DefUseChain {
  definition: Definition;
  uses: Array<{ line: number; blockId: number }>;
}

export interface DataFlowResult {
  reachingDefs: Map<number, Set<Definition>>;
  defUseChains: DefUseChain[];
  definitions: Definition[];
}
