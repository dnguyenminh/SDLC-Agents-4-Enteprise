/**
 * SA4E-110 - Jira REST API v2 client.
 * Provides typed methods for issues, transitions, comments, attachments, etc.
 */
import { BaseAtlassianClient } from './base-client.js';
import type { HttpResponse } from '../models/types.js';

/**
 * Jira API client with methods for all Jira REST v2 operations.
 * Extends BaseAtlassianClient for auth, retry, and rate limiting.
 */
export class JiraApiClient extends BaseAtlassianClient {
  async getIssue(key: string, fields?: string, expand?: string): Promise<HttpResponse> {
    const params = new URLSearchParams();
    if (fields) params.set('fields', fields);
    if (expand) params.set('expand', expand);
    const qs = params.toString() ? `?${params}` : '';
    return this.request({ method: 'GET', path: `/rest/api/2/issue/${key}${qs}` });
  }

  async createIssue(body: unknown): Promise<HttpResponse> {
    return this.request({ method: 'POST', path: '/rest/api/2/issue', body });
  }

  async updateIssue(key: string, fields: unknown): Promise<HttpResponse> {
    return this.request({ method: 'PUT', path: `/rest/api/2/issue/${key}`, body: { fields } });
  }

  async deleteIssue(key: string, deleteSubtasks: boolean): Promise<HttpResponse> {
    const qs = deleteSubtasks ? '?deleteSubtasks=true' : '';
    return this.request({ method: 'DELETE', path: `/rest/api/2/issue/${key}${qs}` });
  }

  async searchJql(jql: string, fields?: string, expand?: string, startAt = 0, maxResults = 50): Promise<HttpResponse> {
    const params = new URLSearchParams({ jql, startAt: String(startAt), maxResults: String(maxResults) });
    if (fields) params.set('fields', fields);
    if (expand) params.set('expand', expand);
    return this.request({ method: 'GET', path: `/rest/api/3/search/jql?${params}` });
  }

  async getTransitions(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/issue/${key}/transitions` });
  }

  async transitionIssue(key: string, transitionId: string, fields?: unknown, comment?: string): Promise<HttpResponse> {
    const body: Record<string, unknown> = { transition: { id: transitionId } };
    if (fields) body.fields = fields;
    if (comment) body.update = { comment: [{ add: { body: comment } }] };
    return this.request({ method: 'POST', path: `/rest/api/2/issue/${key}/transitions`, body });
  }

  async getComments(key: string, startAt = 0, maxResults = 50): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/issue/${key}/comment?startAt=${startAt}&maxResults=${maxResults}` });
  }

  async addComment(key: string, body: unknown): Promise<HttpResponse> {
    return this.request({ method: 'POST', path: `/rest/api/2/issue/${key}/comment`, body });
  }

  async updateComment(key: string, commentId: string, body: unknown): Promise<HttpResponse> {
    return this.request({ method: 'PUT', path: `/rest/api/2/issue/${key}/comment/${commentId}`, body });
  }

  async deleteComment(key: string, commentId: string): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', path: `/rest/api/2/issue/${key}/comment/${commentId}` });
  }

  async getComment(key: string, commentId: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/issue/${key}/comment/${commentId}` });
  }

  async attachFile(key: string, formData: FormData): Promise<HttpResponse> {
    return this.request({
      method: 'POST', path: `/rest/api/2/issue/${key}/attachments`,
      body: formData, isUpload: true,
      headers: { 'X-Atlassian-Token': 'no-check' },
    });
  }

  async getAttachmentMeta(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/attachment/meta' });
  }

  async deleteAttachment(id: string): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', path: `/rest/api/2/attachment/${id}` });
  }

  async getAttachment(id: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/attachment/${id}` });
  }

  async getFilter(id: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/filter/${id}` });
  }

  async getFavouriteFilters(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/filter/favourite' });
  }

  async getProjects(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/project' });
  }

  async getProject(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/project/${key}` });
  }

  async getVersions(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/project/${key}/versions` });
  }

  async getComponents(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/project/${key}/components` });
  }

  async createVersion(body: unknown): Promise<HttpResponse> {
    return this.request({ method: 'POST', path: '/rest/api/2/version', body });
  }

  async getRoles(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/project/${key}/role` });
  }

  async getIssueTypes(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/issuetype' });
  }

  async getPriorities(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/priority' });
  }

  async getStatuses(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/status' });
  }

  async getResolutions(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/resolution' });
  }

  async getFields(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/field' });
  }

  async getFieldOptions(fieldId: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/customFieldOption/${fieldId}` });
  }

  async getCreateMeta(projectKey: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields` });
  }

  async getEditMeta(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/issue/${key}/editmeta` });
  }

  async getMyself(): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: '/rest/api/2/myself' });
  }

  async searchUsers(query: string, startAt = 0, maxResults = 50): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/user/search?query=${encodeURIComponent(query)}&startAt=${startAt}&maxResults=${maxResults}` });
  }

  async getWatchers(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/issue/${key}/watchers` });
  }

  async addWatcher(key: string, accountId: string): Promise<HttpResponse> {
    return this.request({ method: 'POST', path: `/rest/api/2/issue/${key}/watchers`, body: JSON.stringify(accountId) });
  }

  async getWorklogs(key: string): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/api/2/issue/${key}/worklog` });
  }

  async addWorklog(key: string, body: unknown): Promise<HttpResponse> {
    return this.request({ method: 'POST', path: `/rest/api/2/issue/${key}/worklog`, body });
  }

  async deleteWorklog(key: string, worklogId: string): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', path: `/rest/api/2/issue/${key}/worklog/${worklogId}` });
  }

  async getBoards(startAt = 0, maxResults = 50): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/agile/1.0/board?startAt=${startAt}&maxResults=${maxResults}` });
  }

  async getSprints(boardId: number, startAt = 0, maxResults = 50): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=${maxResults}` });
  }

  async getSprintIssues(boardId: number, sprintId: number, startAt = 0, maxResults = 50): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=${maxResults}` });
  }

  async getBacklog(boardId: number, startAt = 0, maxResults = 50): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/agile/1.0/board/${boardId}/backlog?startAt=${startAt}&maxResults=${maxResults}` });
  }

  async getEpicIssues(boardId: number, epicId: number, startAt = 0, maxResults = 50): Promise<HttpResponse> {
    return this.request({ method: 'GET', path: `/rest/agile/1.0/board/${boardId}/epic/${epicId}/issue?startAt=${startAt}&maxResults=${maxResults}` });
  }

  /**
   * Download attachment binary using authenticated session.
   * Supports absolute URLs.
   */
  async downloadAttachment(url: string): Promise<{ buffer: Buffer; mimeType: string; size: number; filename: string }> {
    await this.config.rateLimiter.acquire();
    const headers = await this.config.authHeaders();
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Download failed: HTTP ${response.status} ${text}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('content-disposition') || '';
    let filename = 'attachment';
    const filenameMatch = contentDisposition.match(/filename\*?="([^"]+)"/i) || contentDisposition.match(/filename=([^;]+)/i);
    if (filenameMatch) {
      filename = decodeURIComponent(filenameMatch[1].trim().replace(/"/g, ''));
    } else {
      try {
        const urlObj = new URL(url);
        const lastSegment = urlObj.pathname.split('/').pop() || 'attachment';
        filename = decodeURIComponent(lastSegment);
      } catch {}
    }
    return { buffer, mimeType, size: buffer.length, filename };
  }
}