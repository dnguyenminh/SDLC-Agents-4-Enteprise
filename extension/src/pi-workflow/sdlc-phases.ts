export type SDLCPhase =
  | 'requirements'
  | 'specification'
  | 'design'
  | 'test_planning'
  | 'implementation'
  | 'user_guide'
  | 'testing'
  | 'deployment';

export const PHASE_ORDER: SDLCPhase[] = [
  'requirements',
  'specification',
  'design',
  'test_planning',
  'implementation',
  'user_guide',
  'testing',
  'deployment',
];
