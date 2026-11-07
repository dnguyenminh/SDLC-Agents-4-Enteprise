/**
 * SA4E-110 - Zod schemas for Confluence tool inputs.
 * Validates space keys, page IDs, CQL queries, and content structures.
 */
import { z } from 'zod';

const PaginationSchema = z.object({
  start: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(25),
});

export const SearchSchema = z.object({
  cql: z.string().min(1).max(2000),
  ...PaginationSchema.shape,
});

export const GetPageSchema = z.object({
  page_id: z.string().min(1),
  expand: z.string().optional(),
});

export const CreatePageSchema = z.object({
  space_key: z.string().min(1),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  parent_id: z.string().optional(),
  representation: z.enum(['storage', 'wiki']).default('storage'),
});

export const UpdatePageSchema = z.object({
  page_id: z.string().min(1),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  version_number: z.number().int().positive(),
  representation: z.enum(['storage', 'wiki']).default('storage'),
});

export const DeletePageSchema = z.object({ page_id: z.string().min(1) });

export const PageByTitleSchema = z.object({
  space_key: z.string().min(1),
  title: z.string().min(1),
});

export const ChildrenSchema = z.object({
  page_id: z.string().min(1),
  ...PaginationSchema.shape,
});

export const AncestorsSchema = z.object({ page_id: z.string().min(1) });

export const ContentSearchSchema = z.object({
  query: z.string().min(1).max(2000),
  space_key: z.string().optional(),
  type: z.enum(['page', 'blogpost', 'comment']).optional(),
  ...PaginationSchema.shape,
});

export const RecentSchema = z.object({ ...PaginationSchema.shape });

export const ByLabelSchema = z.object({
  label: z.string().min(1),
  space_key: z.string().optional(),
  ...PaginationSchema.shape,
});

export const SpacesSchema = z.object({
  type: z.enum(['global', 'personal']).optional(),
  ...PaginationSchema.shape,
});

export const SpaceKeySchema = z.object({ space_key: z.string().min(1) });

export const SpaceContentSchema = z.object({
  space_key: z.string().min(1),
  type: z.enum(['page', 'blogpost']).default('page'),
  ...PaginationSchema.shape,
});

export const LabelSchema = z.object({
  page_id: z.string().min(1),
  label: z.string().min(1),
});

export const GetLabelsSchema = z.object({ page_id: z.string().min(1) });

export const AttachmentsSchema = z.object({
  page_id: z.string().min(1),
  ...PaginationSchema.shape,
});

export const AddAttachmentSchema = z.object({
  page_id: z.string().min(1),
  file_path: z.string().min(1).describe('Relative or absolute path to the file to upload'),
  base_dir: z.string().optional().describe('Optional workspace root to resolve relative file_path against. Must be registered in the server allowlist (MCP_WORKSPACE_ROOTS). Relative values are normalized to absolute. Example: /home/user/project-worktree-B'),
  workspace_root: z.string().optional().describe('Deprecated alias of base_dir (same semantics — optional workspace root to resolve relative file_path against; must be in the MCP_WORKSPACE_ROOTS allowlist). Ignored when base_dir is present. Example: /home/user/project-worktree-B'),
});

export const MacrosSchema = z.object({ page_id: z.string().min(1) });
export const HistorySchema = z.object({ page_id: z.string().min(1) });

export const VersionSchema = z.object({
  page_id: z.string().min(1),
  version_number: z.number().int().positive(),
});

export const GetCommentsSchema = z.object({
  page_id: z.string().min(1),
  ...PaginationSchema.shape,
});

export const AddCommentSchema = z.object({
  page_id: z.string().min(1),
  body: z.string().min(1),
  representation: z.enum(['storage', 'wiki']).default('storage'),
});