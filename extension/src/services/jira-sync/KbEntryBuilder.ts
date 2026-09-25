/**
 * SA4E-102 — KbEntryBuilder: Assembles 3 KB entries per Jira ticket.
 * Entry 1: metadata + description. Entry 2: comments. Entry 3: links graph.
 */
import { adfToMarkdown, htmlToPlaintext } from "./AdfConverter";
import { summarizeComments, extractAllTicketRefs, formatCommentSummaries, type JiraComment } from "./CommentSummarizer";
import type { CrawledIssue } from "./LinkCrawler";
import { getEffectiveScope } from "../../utils/scope-detector";

/** KB entry payload ready for ingestion. */
export interface KbEntry {
    content: string;
    summary: string;
    type: string;
    scope: string;
    source: string;
    tags: string;
}

const MAX_DESC_LEN = 3000;

/**
 * Build 3 KB entries for a crawled issue.
 * @param issue Crawled issue data
 * @param projectKey Jira project key (for source path)
 * @returns Array of 3 KbEntry objects
 */
export function buildKbEntries(issue: CrawledIssue, projectKey: string): KbEntry[] {
    return [
        buildMetadataEntry(issue, projectKey),
        buildCommentsEntry(issue, projectKey),
        buildLinksEntry(issue, projectKey),
    ];
}

/** Entry 1: Issue metadata + description (ADF → Markdown). */
function buildMetadataEntry(issue: CrawledIssue, projectKey: string): KbEntry {
    const desc = convertDescription(issue);
    const attachList = formatAttachments(issue);

    const lines = [
        `JIRA_ISSUE | key=${issue.key} | type=${issue.issuetype} | status=${issue.status} | priority=${issue.priority}`,
        `project=${projectKey} | assignee=${issue.assignee || "unassigned"} | labels=${issue.labels.join(",")}`,
        "",
        `## Summary`,
        issue.summary,
        "",
        `## Description`,
        desc.slice(0, MAX_DESC_LEN),
    ];

    if (attachList) {
        lines.push("", "## Attachments", attachList);
    }

    return {
        content: lines.join("\n"),
        summary: `${issue.key}: ${issue.summary}`,
        type: "REQUIREMENT",
        scope: getEffectiveScope(),
        source: `jira/${projectKey}/${issue.key}/metadata`,
        tags: `jira,${projectKey},${issue.issuetype},${issue.status}`,
    };
}

/** Entry 2: Comment summary + extracted ticket references. */
function buildCommentsEntry(issue: CrawledIssue, projectKey: string): KbEntry {
    const comments = issue.comments as JiraComment[];
    const summaries = summarizeComments(comments);
    const ticketRefs = extractAllTicketRefs(summaries);
    const formatted = formatCommentSummaries(summaries);

    const lines = [
        `JIRA_COMMENTS | key=${issue.key} | count=${comments.length}`,
        "",
        "## Comment Summary",
        formatted,
    ];

    if (ticketRefs.length > 0) {
        lines.push("", "## Ticket References (from comments)", ticketRefs.join(", "));
    }

    return {
        content: lines.join("\n"),
        summary: `${issue.key}: ${comments.length} comments`,
        type: "CONTEXT",
        scope: getEffectiveScope(),
        source: `jira/${projectKey}/${issue.key}/comments`,
        tags: `jira,${projectKey},comments,${issue.key}`,
    };
}

/** Entry 3: Issue links graph + subtasks + attachment metadata. */
function buildLinksEntry(issue: CrawledIssue, projectKey: string): KbEntry {
    const lines = [
        `JIRA_LINKS | key=${issue.key} | links_count=${issue.issuelinks.length} | subtasks_count=${issue.subtasks.length}`,
    ];

    if (issue.issuelinks.length > 0) {
        lines.push("", "## Issue Links");
        for (const link of issue.issuelinks) {
            lines.push(`- ${link.type} → ${link.linkedKey} (${link.linkedStatus}) "${link.linkedSummary}"`);
        }
    }

    if (issue.subtasks.length > 0) {
        lines.push("", "## Sub-tasks");
        for (const st of issue.subtasks) {
            lines.push(`- ${st.key}: ${st.summary} (${st.status})`);
        }
    }

    if (issue.attachments.length > 0) {
        lines.push("", "## Attachment Metadata");
        for (const att of issue.attachments) {
            const sizeKb = Math.round(att.size / 1024);
            lines.push(`- ${att.filename} (${sizeKb}KB, ${att.mimeType})`);
        }
    }

    return {
        content: lines.join("\n"),
        summary: `${issue.key}: ${issue.issuelinks.length} links, ${issue.subtasks.length} subtasks`,
        type: "CONTEXT",
        scope: getEffectiveScope(),
        source: `jira/${projectKey}/${issue.key}/links`,
        tags: `jira,${projectKey},links,${issue.key}`,
    };
}

/** Convert issue description from ADF/HTML to markdown. */
function convertDescription(issue: CrawledIssue): string {
    if (issue.description && typeof issue.description === "object") {
        const md = adfToMarkdown(issue.description);
        if (md.trim()) { return md; }
    }
    if (issue.renderedDescription) {
        return htmlToPlaintext(issue.renderedDescription);
    }
    if (typeof issue.description === "string") { return issue.description; }
    return "(no description)";
}

/** Format attachment list for metadata entry. */
function formatAttachments(issue: CrawledIssue): string {
    if (issue.attachments.length === 0) { return ""; }
    return issue.attachments
        .map(att => `- ${att.filename} (${Math.round(att.size / 1024)}KB)`)
        .join("\n");
}
