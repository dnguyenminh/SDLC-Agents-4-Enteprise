# Technical Design Document (TDD)
## Jira Ticket: SA4E-326
## Title: Pi Prompt Compression + Role-scoped prompts per model tier

## 1. Introduction
Design for prompt compression and role-scoped prompt templates per model tier.

## 2. Architecture Overview
PromptTemplateService loads compressed/full variants, AgentConfigurator filters by role/scope.
![Architecture](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

## 3. Component Design
PromptTemplateService, AgentConfigurator, ModelTierFilter

## 4. Class Design
PromptTemplate, CompressedVariant, RoleScopeFilter

## Diagram Index
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class | [class.png](diagrams/class.png) | [class.drawio](diagrams/class.drawio) |
