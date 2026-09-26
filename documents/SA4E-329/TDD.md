# Technical Design Document (TDD)
## Jira Ticket: SA4E-329
## Title: Pi Model Routing and Fallback small to large

## 1. Introduction
Design for model routing with small-first strategy and fallback to large model.

## 2. Architecture Overview
User Request → Router → Small Model → Confidence Check → Fallback to Large
![Architecture](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

## Diagram Index
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class | [class.png](diagrams/class.png) | [class.drawio](diagrams/class.drawio) |
