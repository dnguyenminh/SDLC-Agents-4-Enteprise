# Technical Design Document (TDD)
## Jira Ticket: SA4E-327
## Title: Pi Task Decomposition + Map-Reduce for large repo queries

## 1. Introduction
Design for task decomposition and Map-Reduce processing for large repo queries.

## 2. Architecture Overview
Decomposer → Map Workers → Reduce Aggregator → Session Factory
![Architecture](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

## Diagram Index
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class | [class.png](diagrams/class.png) | [class.drawio](diagrams/class.drawio) |
