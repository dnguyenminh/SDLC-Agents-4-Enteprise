export const INDEXES = `
-- Indexes
CREATE INDEX IF NOT EXISTS idx_ke_tier ON knowledge_entries(tier);
CREATE INDEX IF NOT EXISTS idx_ke_scope ON knowledge_entries(scope);
CREATE INDEX IF NOT EXISTS idx_ke_user_id ON knowledge_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_user ON knowledge_entries(scope, user_id);
CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entries(type);
CREATE INDEX IF NOT EXISTS idx_ke_source ON knowledge_entries(source);
CREATE INDEX IF NOT EXISTS idx_ke_confidence ON knowledge_entries(confidence);
CREATE INDEX IF NOT EXISTS idx_ke_access ON knowledge_entries(access_count);
CREATE INDEX IF NOT EXISTS idx_ke_created ON knowledge_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_ke_expires ON knowledge_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_ke_pinned ON knowledge_entries(pinned, pin_order);
CREATE INDEX IF NOT EXISTS idx_ke_archived ON knowledge_entries(archived);
CREATE INDEX IF NOT EXISTS idx_ke_quality ON knowledge_entries(quality_score);
CREATE INDEX IF NOT EXISTS idx_ke_agent_name ON knowledge_entries(agent_name);
CREATE INDEX IF NOT EXISTS idx_ke_tier_archived ON knowledge_entries(tier, archived, created_at);
CREATE INDEX IF NOT EXISTS idx_kv_entry ON knowledge_vectors(entry_id);
CREATE INDEX IF NOT EXISTS idx_kge_source ON knowledge_graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_kge_target ON knowledge_graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_kge_relation ON knowledge_graph_edges(relation);
CREATE INDEX IF NOT EXISTS idx_cl_entry ON consolidation_log(entry_id);
CREATE INDEX IF NOT EXISTS idx_ms_session ON memory_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_ms_status ON memory_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ma_operation ON memory_audit(operation);
CREATE INDEX IF NOT EXISTS idx_ma_entry ON memory_audit(entry_id);
CREATE INDEX IF NOT EXISTS idx_ma_session ON memory_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_ma_created ON memory_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_ct_session ON conversation_turns(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_ct_role ON conversation_turns(role);
CREATE INDEX IF NOT EXISTS idx_ct_created ON conversation_turns(created_at);
CREATE INDEX IF NOT EXISTS idx_ct_summarized ON conversation_turns(summarized);
CREATE INDEX IF NOT EXISTS idx_ei_name ON entity_index(entity_name);
CREATE INDEX IF NOT EXISTS idx_ei_type ON entity_index(entity_type);
CREATE INDEX IF NOT EXISTS idx_ei_entry ON entity_index(entry_id);
CREATE INDEX IF NOT EXISTS idx_citations_entry ON citations(entry_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entry ON attachments(entry_id);
CREATE INDEX IF NOT EXISTS idx_feedback_entry ON feedback(entry_id);
CREATE INDEX IF NOT EXISTS idx_reminders_entry ON reminders(entry_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_search_log_created ON search_log(created_at);

-- Indexes for project isolation
CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id);

-- Default agent scope config
INSERT OR IGNORE INTO agent_scope_config (agent_role, tag_set) VALUES
  ('QA', '["testing","qa","test-plan","test-case","bug"]'),
  ('DEV', '["code","api","architecture","implementation","design"]'),
  ('BA', '["requirement","business","stakeholder","process"]'),
  ('SA', '["architecture","design","infrastructure","security"]'),
  ('DEVOPS', '["deployment","infrastructure","ci-cd","monitoring"]');
`;

export function migrateProjectId(db: { exec: (sql: string) => void }): void {
  try {
    db.exec('ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('duplicate column')) throw err;
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id)');
}
