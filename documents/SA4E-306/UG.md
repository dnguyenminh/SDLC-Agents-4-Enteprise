# User Guide - SA4E-306 Pi Packages Config Page

## 1. Installation
Prerequisites: Pi extension host initialized, Settings panel access.

## 2. Configuration Reference
- API: GET `/api/packages/list` — returns package list with packageId, packageName, version, enabled, status.
- API: PATCH `/api/packages/:id` — body `{ enabled: boolean }` updates enable state.
- Business rules:
  - packageId non-empty string
  - enabled boolean
  - 7 pre-install packages listed

## 3. Usage
Open Settings → Packages tab. Toggle switch to enable/disable. Changes persist automatically.

## 4. Administration
Pre-install runs on first system startup. Packages are enabled by default. Install progress shown in UI.

## 5. Troubleshooting
- Pi extension host required warning: ensure extension host initialized.
- Failed to save settings: check config store write permission.
- Install timeout: automatic retry up to 3 times.

## 6. API Reference
### GET /api/packages/list
Response: `{ data: PackageConfig[], timestamp }`

### PATCH /api/packages/:id
Input: `{ enabled: boolean }`
Output: `{ data: { packageId, enabled }, timestamp }`
Errors: 400 validation error

## 7. FAQ
Q: Why packages missing?
A: Extension host must be active.
