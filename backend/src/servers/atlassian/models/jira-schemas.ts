/**
 * SA4E-110 - Zod schemas for all Jira tool inputs.
 * Validates issue keys, JQL length, pagination, and field structures.
 */
import { z } from 'zod';

/** Pattern: PROJECT-123 */
const issueKeyPattern = /^[A-Z][A-Z0-9]+-\d+$/;

export const IssueKeySchema = z.string()
  .regex(issueKeyPattern, 'Invalid issue key format (e.g., PROJ-123)');

/** JQL max 2000 chars - P3 security requirement */
export const JqlSchema = z.string()
  .min(1, 'JQL query must not be empty')
  .max(2000, 'JQL query must not exceed 2000 characters');

export const PaginationSchema = z.object({
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
});

export const GetIssueSchema = z.object({
  issue_key: IssueKeySchema,
  fields: z.string().optional(),
  expand: z.string().optional(),
});

export const CreateIssueSchema = z.object({
  project_key: z.string().min(1),
  summary: z.string().min(1).max(255),
  issue_type: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.string().optional(),
  labels: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

export const UpdateIssueSchema = z.object({
  issue_key: IssueKeySchema,
  /** Fields object to update. Must be an object (NOT a JSON string). Example: {"parent":{"id":"12345"}} */
  fields: z.record(z.unknown()).describe('Fields object to update (NOT a JSON string). Example: {"summary":"New title","parent":{"id":"12345"}}'),
});

export const DeleteIssueSchema = z.object({
  issue_key: IssueKeySchema,
  delete_subtasks: z.boolean().default(false),
});

export const SearchJqlSchema = z.object({
  jql: JqlSchema,
  fields: z.string().optional(),
  expand: z.string().optional(),
  ...PaginationSchema.shape,
});

export const GetFilterSchema = z.object({
  filter_id: z.string().min(1),
});

export const FilterResultsSchema = z.object({
  filter_id: z.string().min(1),
  ...PaginationSchema.shape,
});

export const TransitionSchema = z.object({
  issue_key: IssueKeySchema,
  transition_id: z.string().min(1),
  comment: z.string().optional(),
  fields: z.record(z.unknown()).optional(),
});

export const TransitionByNameSchema = z.object({
  issue_key: IssueKeySchema,
  transition_name: z.string().min(1),
  comment: z.string().optional(),
  fields: z.record(z.unknown()).optional(),
});

export const GetTransitionsSchema = z.object({
  issue_key: IssueKeySchema,
});

export const CommentSchema = z.object({
  issue_key: IssueKeySchema,
  body: z.string().min(1),
  visibility: z.object({
    type: z.enum(['group', 'role']),
    value: z.string(),
  }).optional(),
});

export const UpdateCommentSchema = z.object({
  issue_key: IssueKeySchema,
  comment_id: z.string().min(1),
  body: z.string().min(1),
});

export const DeleteCommentSchema = z.object({
  issue_key: IssueKeySchema,
  comment_id: z.string().min(1),
});

export const GetCommentsSchema = z.object({
  issue_key: IssueKeySchema,
  ...PaginationSchema.shape,
});

export const GetSingleCommentSchema = z.object({
  issue_key: IssueKeySchema,
  comment_id: z.string().min(1),
});

export const AttachFileSchema = z.object({
  issue_key: IssueKeySchema,
  file_path: z.string().min(1),
});

export const GetAttachmentsSchema = z.object({
  issue_key: IssueKeySchema,
});

export const DeleteAttachmentSchema = z.object({
  attachment_id: z.string().min(1),
});

export const DownloadAttachmentSchema = z.object({
  attachment_id: z.string().min(1).optional(),
  attachment_url: z.string().url().optional(),
}).refine(data => data.attachment_id || data.attachment_url, {
  message: 'Either attachment_id or attachment_url is required',
});

export const ProjectKeySchema = z.object({
  project_key: z.string().min(1),
});

export const BoardIdSchema = z.object({
  board_id: z.number().int().positive(),
});

export const SprintIdSchema = z.object({
  board_id: z.number().int().positive(),
  sprint_id: z.number().int().positive(),
  ...PaginationSchema.shape,
});

export const EpicIssuesSchema = z.object({
  board_id: z.number().int().positive(),
  epic_id: z.number().int().positive(),
  ...PaginationSchema.shape,
});

export const UserSearchSchema = z.object({
  query: z.string().min(1),
  ...PaginationSchema.shape,
});

export const WatcherSchema = z.object({
  issue_key: IssueKeySchema,
  account_id: z.string().min(1),
});

export const WorklogSchema = z.object({
  issue_key: IssueKeySchema,
  time_spent: z.string().min(1),
  started: z.string().optional(),
  comment: z.string().optional(),
});

export const DeleteWorklogSchema = z.object({
  issue_key: IssueKeySchema,
  worklog_id: z.string().min(1),
});

export const GetWorklogsSchema = z.object({
  issue_key: IssueKeySchema,
});

export const FieldsSchema = z.object({
  issue_key: IssueKeySchema,
});

export const CreateVersionSchema = z.object({
  project_key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  released: z.boolean().default(false),
  start_date: z.string().optional(),
  release_date: z.string().optional(),
});