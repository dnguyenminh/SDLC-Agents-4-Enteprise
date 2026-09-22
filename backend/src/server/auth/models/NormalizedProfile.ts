export interface NormalizedProfile {
  provider: string;           // 'entra' | 'google' | 'github'
  externalSubjectId: string;  // Entra oid / Google sub / GitHub id
  email: string;
  emailVerified: boolean;
  name: string;
  groups?: string[];          // optional (Entra groups)
}
