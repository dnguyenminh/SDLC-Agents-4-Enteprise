---
name: 'TypeScript Standards'
description: 'Coding conventions for TypeScript files'
applyTo: '**/*.ts,**/*.tsx'
---

# TypeScript Code Standards

- Strict mode enabled
- File max 200 lines, function max 20 lines
- Models/interfaces in `models/` folder
- Services (business logic) in `services/` folder
- Pure utilities in `utils/` folder
- SOLID principles mandatory
- Use OOP Design Patterns (Strategy, Factory, Observer, Template Method)
- NEVER swallow exceptions — always handle or rethrow with context
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties
- Explicit return types on public functions
