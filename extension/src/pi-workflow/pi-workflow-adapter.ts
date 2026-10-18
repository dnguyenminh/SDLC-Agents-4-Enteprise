/**
 * PiWorkflowAdapter facade — real adapter exposing the legacy LangGraphEngine
 * surface on top of PiWorkflowEngine (SEC-289-03 gateHandler, SA4E-333/334/355).
 * Implementation: ./pi-workflow-adapter/ (core, session-turns, legacy-turns,
 * legacy-helpers).
 */
import { AdapterLegacyTurns } from './pi-workflow-adapter/adapter-legacy-turns.js';

export class PiWorkflowAdapter extends AdapterLegacyTurns {}
