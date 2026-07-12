/** Tier 2 tool definitions — medium-frequency action-based tools. */

export const TIER2_TOOLS = [
  {
    name: 'mem_pin',
    description: 'Core/Archival Memory: pin entries for auto-recall, manage pinned context budget (2000 tokens max).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: pin, unpin, list, reorder, get_context, budget' },
        entry_id: { type: 'number', description: 'Entry ID (for pin/unpin/reorder)' },
        order: { type: 'number', description: 'New position (for reorder)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'mem_map',
    description: 'Structured Map: view/update entry metadata (topic, entities, decisions, action items, sentiment). Search by entity or topic.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: get, update, search_entity, search_topic, reextract' },
        entry_id: { type: 'number', description: 'Entry ID (for get/update/reextract)' },
        entity: { type: 'string', description: 'Entity name to search (for search_entity)' },
        topic: { type: 'string', description: 'Topic to search (for search_topic)' },
        map: { type: 'object', description: 'Partial StructuredMap to merge (for update)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'mem_crud',
    description: 'CRUD operations on knowledge entries: get, delete, list.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: get, delete, list' },
        id: { type: 'number', description: 'Entry ID (for get/delete)' },
        tier: { type: 'string', description: 'Filter by tier (for list)' },
        type: { type: 'string', description: 'Filter by type (for list)' },
        limit: { type: 'number', description: 'Max results (for list, default 20)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'mem_graph',
    description: 'Query knowledge graph relationships. Actions: neighbors, add_edge, path, ego, auto_link.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: neighbors, add_edge, path, ego, auto_link' },
        node_id: { type: 'number', description: 'Node ID for neighbors/ego/auto_link' },
        source_id: { type: 'number', description: 'Source node for add_edge' },
        target_id: { type: 'number', description: 'Target node for add_edge' },
        relation: { type: 'string', description: 'Edge relation type' },
        from_id: { type: 'number', description: 'Start node for path' },
        to_id: { type: 'number', description: 'End node for path' },
        radius: { type: 'number', description: 'Radius for ego graph (default 2)' },
        limit: { type: 'number', description: 'Max orphans to process for auto_link backfill (default 50)' },
      },
    },
  },
  {
    name: 'mem_consolidate',
    description: 'Tier consolidation: promote/demote entries, merge duplicates with dry-run support.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: consolidate, merge (default: consolidate)' },
        dry_run: { type: 'boolean', description: 'Preview changes without applying (default: false)' },
        survivor_id: { type: 'number', description: 'For merge: ID of entry to keep' },
        merge_ids: { type: 'string', description: 'For merge: comma-separated IDs to merge into survivor' },
        strategy: { type: 'string', description: 'Merge strategy: append, newest (default: append)' },
      },
    },
  },
  {
    name: 'mem_lifecycle',
    description: 'Entry lifecycle: staleness detection, reviews, reminders.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: detect_stale, archive, unarchive, due_reviews, mark_reviewed, schedule, snooze, complete' },
        entry_id: { type: 'number', description: 'Entry ID' },
        threshold: { type: 'number', description: 'Staleness threshold 0-1 (default: 0.8)' },
        dry_run: { type: 'boolean', description: 'Preview without applying (default: false)' },
        days: { type: 'number', description: 'Days since last review (for due_reviews, default: 90)' },
        interval_days: { type: 'number', description: 'Review interval in days (for schedule)' },
        snooze_days: { type: 'number', description: 'Snooze duration in days (default: 7)' },
        reviewer: { type: 'string', description: 'Reviewer identifier' },
        assignee: { type: 'string', description: 'Assignee for reminder' },
        owner: { type: 'string', description: 'Owner identifier' },
        status: { type: 'string', description: 'Review status: pending, approved, rejected, needs_revision' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'mem_templates',
    description: 'Manage content templates: create, list, validate entries against templates.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: create, list, validate' },
        name: { type: 'string', description: 'Template name (for create)' },
        type: { type: 'string', description: 'Entry type this template applies to' },
        required_sections: { type: 'string', description: 'Comma-separated required section names' },
        entry_id: { type: 'number', description: 'Entry ID to validate' },
      },
    },
  },
  {
    name: 'mem_attachments',
    description: 'Manage file attachments for knowledge entries.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: attach, list, remove, search' },
        entry_id: { type: 'number', description: 'Entry ID' },
        file_path: { type: 'string', description: 'File path to attach' },
        description: { type: 'string', description: 'Attachment description' },
        attachment_id: { type: 'number', description: 'Attachment ID (for remove)' },
        mime_prefix: { type: 'string', description: "MIME type prefix for search (e.g., 'image/')" },
      },
    },
  },
  {
    name: 'mem_discover',
    description: 'Find relevant entries: type-ahead suggestions or related entries.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: suggest, related' },
        query: { type: 'string', description: 'Partial query (for suggest)' },
        entry_id: { type: 'number', description: 'Entry ID (for related)' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
        refresh: { type: 'boolean', description: 'Force recompute related (default: false)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'mem_tags',
    description: 'Manage tag taxonomy: create tags, tag/untag entries, search by tags, view taxonomy.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: create, tag, untag, search, taxonomy, popular, entry_tags' },
        tag: { type: 'string', description: 'Tag name (for create)' },
        tags: { type: 'string', description: 'Comma-separated tags (for tag/untag/search)' },
        entry_id: { type: 'number', description: 'Entry ID (for tag/untag/entry_tags)' },
        category: { type: 'string', description: 'Tag category (for create/taxonomy)' },
        parent_tag: { type: 'string', description: 'Parent tag (for hierarchical create)' },
        operator: { type: 'string', description: 'Search operator: AND, OR (default: AND)' },
        limit: { type: 'number', description: 'Max results' },
      },
    },
  },
  {
    name: 'mem_citations',
    description: 'Citation tracking: record citations, view most/least cited entries.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: record, entry, most_cited, uncited, by_agent' },
        entry_id: { type: 'number', description: 'Entry ID' },
        cited_by: { type: 'string', description: 'Who/what is citing (for record)' },
        context: { type: 'string', description: 'Context of the citation (for record)' },
        agent: { type: 'string', description: 'Agent name (for by_agent)' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['action'],
    },
  },
];
