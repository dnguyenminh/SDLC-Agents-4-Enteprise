/**
 * WorkflowParser --- KSA-243
 * Parses .kiro/agents/{agent}.md workflow sections into executable step definitions.
 */

import { ActionType, StepAction, inferActions, extractCondition } from "./workflow-parser-actions";
export { ActionType, StepAction } from "./workflow-parser-actions";

export interface ParsedWorkflow {
  agentName: string;
  rolePrompt: string;
  steps: WorkflowStep[];
  skills: string[];
}

export interface WorkflowStep {
  id: string;
  title: string;
  actions: StepAction[];
  isConditional: boolean;
  condition?: string;
}

/**
 * Parse an agent markdown file into a structured workflow.
 */
export function parseAgentWorkflow(agentName: string, markdown: string): ParsedWorkflow {
  const fmMatch = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  const body = fmMatch ? fmMatch[1].trim() : markdown.trim();
  const lines = body.split("\n");
  const steps: WorkflowStep[] = [];
  const roleLines: string[] = [];
  const skills = new Set<string>();
  let currentStep: WorkflowStep | null = null;
  let inWorkflowSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stepMatch = line.match(/^###\s*Step\s+([\d.]+):?\s*(.*)/i);
    if (stepMatch) {
      if (currentStep) steps.push(currentStep);
      const title = stepMatch[2].trim();
      currentStep = {
        id: `step-${stepMatch[1]}`,
        title,
        actions: [],
        isConditional: /\(if|only\s+for|when\s+/i.test(title),
        condition: extractCondition(title),
      };
      inWorkflowSection = true;
      continue;
    }
    if (/^##\s*Workflow/i.test(line)) { inWorkflowSection = true; continue; }
    if (/^##\s+/.test(line) && !/^###/.test(line) && inWorkflowSection && currentStep) {
      steps.push(currentStep);
      currentStep = null;
      inWorkflowSection = false;
    }
    if (currentStep && inWorkflowSection) {
      const actions = inferActions(line);
      for (const action of actions) { currentStep.actions.push(action); }
      const skillMatch = line.match(/\.kiro\/steering\/([\w-]+\.md)/);
      if (skillMatch) { skills.add(`.kiro/steering/${skillMatch[1]}`); }
    } else if (!inWorkflowSection) {
      roleLines.push(line);
    }
  }
  if (currentStep) steps.push(currentStep);

  const contextFilesMatches = body.matchAll(/contextFiles.*?path.*?["']([^"']+)["']/g);
  for (const m of contextFilesMatches) { skills.add(m[1]); }

  return { agentName, rolePrompt: roleLines.join("\n").trim(), steps, skills: [...skills] };
}
