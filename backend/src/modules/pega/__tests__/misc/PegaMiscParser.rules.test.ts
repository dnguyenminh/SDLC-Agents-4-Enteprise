import { describe, it, expect } from 'vitest';
import { PegaMiscParser } from '../../misc/PegaMiscParser.js';

describe('PegaMiscParser', () => {
  const parser = new PegaMiscParser();

  // ─── Group 5: ServiceLevel — urgency/goal/deadline/escalation ──────────

  describe('ServiceLevel parsing', () => {
    it('parses ServiceLevel with urgency, goal, deadline, escalation', () => {
      const json = {
        pxObjClass: 'Rule-Obj-ServiceLevel',
        pyRuleName: 'SLADefault',
        pyUrgency: 50,
        pyGoal: '2h',
        pyDeadline: '8h',
        pyLimit: '24h',
        pyAction: 'NotifyManager',
        pyEscalation: 'EscalateToDirector',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('SLADefault');

      const typed = parser.parseServiceLevel(json);
      expect(typed.pyName).toBe('SLADefault');
      expect(typed.pyUrgency).toBe(50);
      expect(typed.pyGoal).toBe('2h');
      expect(typed.pyDeadline).toBe('8h');
      expect(typed.pyLimit).toBe('24h');
      expect(typed.pyAction).toBe('NotifyManager');
      expect(typed.pyEscalation).toBe('EscalateToDirector');
    });

    it('handles ServiceLevel with missing optional fields', () => {
      const json = {
        pxObjClass: 'Rule-Obj-ServiceLevel',
        pyRuleName: 'MinimalSLA',
      };

      const typed = parser.parseServiceLevel(json);
      expect(typed.pyUrgency).toBeUndefined();
      expect(typed.pyGoal).toBeUndefined();
      expect(typed.pyDeadline).toBeUndefined();
      expect(typed.pyEscalation).toBeUndefined();
    });
  });

  // ─── Group 6: Circumstance — type/value/target ────────────────────────

  describe('Circumstance parsing', () => {
    it('parses Circumstance with type, value, target property', () => {
      const json = {
        pxObjClass: 'Rule-Circumstance-Date',
        pyRuleName: 'HolidayRule',
        pyCircumstanceType: 'Date',
        pyValue: '2026-12-25',
        pyTargetProperty: '.Order.ShipDate',
        pyPriority: 1,
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('HolidayRule');

      const typed = parser.parseCircumstance(json);
      expect(typed.pyName).toBe('HolidayRule');
      expect(typed.pyCircumstanceType).toBe('Date');
      expect(typed.pyValue).toBe('2026-12-25');
      expect(typed.pyTargetProperty).toBe('.Order.ShipDate');
      expect(typed.pyPriority).toBe(1);
    });

    it('handles Circumstance with missing optional fields', () => {
      const json = {
        pxObjClass: 'Rule-Circumstance-Property',
        pyRuleName: 'SimpleCirc',
      };

      const typed = parser.parseCircumstance(json);
      expect(typed.pyCircumstanceType).toBeUndefined();
      expect(typed.pyValue).toBeUndefined();
      expect(typed.pyTargetProperty).toBeUndefined();
      expect(typed.pyPriority).toBeUndefined();
    });
  });

  // ─── Group 7: Agent/Queue — interval/queue/threads ─────────────────────

  describe('Agent/Queue parsing', () => {
    it('parses Agent with type, interval, queue type, max threads', () => {
      const json = {
        pxObjClass: 'Rule-Agent-Queue',
        pyRuleName: 'EmailDispatcher',
        pyType: 'Queue',
        pyQueueType: 'Email',
        pyInterval: 60,
        pyMaxThreads: 5,
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('EmailDispatcher');

      const typed = parser.parseAgent(json);
      expect(typed.pyName).toBe('EmailDispatcher');
      expect(typed.pyType).toBe('Queue');
      expect(typed.pyQueueType).toBe('Email');
      expect(typed.pyInterval).toBe(60);
      expect(typed.pyMaxThreads).toBe(5);
    });

    it('parses QueueProcessor with class name and max items', () => {
      const json = {
        pxObjClass: 'Rule-Agent-Queue',
        pyRuleName: 'ProcessOrders',
        pyClassName: 'Work-Order',
        pyMaxItems: 100,
      };

      const typed = parser.parseQueueProcessor(json);
      expect(typed.pyName).toBe('ProcessOrders');
      expect(typed.pyClassName).toBe('Work-Order');
      expect(typed.pyMaxItems).toBe(100);
    });
  });

  // ─── Group 8: ReportDef — filters/sort/columns ────────────────────────

  describe('ReportDef parsing', () => {
    it('parses ReportDef with filters, sort fields, columns', () => {
      const json = {
        pxObjClass: 'Rule-Obj-Report-Definition',
        pyRuleName: 'OpenOrdersReport',
        pyDatasource: 'Data-Order',
        pyFilters: [
          { pyProperty: '.Status', pyOperator: 'equals', pyValue: 'Open' },
          { pyProperty: '.Priority', pyOperator: 'greater', pyValue: '3' },
        ],
        pySortFields: [
          { pyProperty: '.CreateDate', pyOrder: 'DESC' },
        ],
        pyColumns: [
          { pyProperty: '.OrderID', pyLabel: 'Order ID', pySortable: true },
          { pyProperty: '.CustomerName', pyLabel: 'Customer' },
        ],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('OpenOrdersReport');

      const typed = parser.parseReportDef(json);
      expect(typed.pyName).toBe('OpenOrdersReport');
      expect(typed.pyDatasource).toBe('Data-Order');
      expect(typed.pyFilters).toHaveLength(2);
      expect(typed.pyFilters![0].pyProperty).toBe('.Status');
      expect(typed.pyFilters![0].pyOperator).toBe('equals');
      expect(typed.pyFilters![0].pyValue).toBe('Open');
      expect(typed.pySortFields).toHaveLength(1);
      expect(typed.pySortFields![0].pyProperty).toBe('.CreateDate');
      expect(typed.pySortFields![0].pyOrder).toBe('DESC');
      expect(typed.pyColumns).toHaveLength(2);
      expect(typed.pyColumns![0].pyProperty).toBe('.OrderID');
      expect(typed.pyColumns![0].pyLabel).toBe('Order ID');
      expect(typed.pyColumns![0].pySortable).toBe(true);
    });

    it('handles ReportDef with missing arrays', () => {
      const json = {
        pxObjClass: 'Rule-Obj-Report-Definition',
        pyRuleName: 'MinimalReport',
      };

      const typed = parser.parseReportDef(json);
      expect(typed.pyDatasource).toBeUndefined();
      expect(typed.pyFilters).toBeUndefined();
      expect(typed.pySortFields).toBeUndefined();
      expect(typed.pyColumns).toBeUndefined();
    });
  });
});
