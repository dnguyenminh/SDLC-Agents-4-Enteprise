# SA4E-364 — Test Data Index

> Sinh bởi QA Agent ngày 2026-10-16, kèm STC v1.0. Mọi STC test case ID (30/30) xuất hiện trong ít nhất 1 file bên dưới.

| File | Rows (data) | TCs covered |
|------|-------------|-------------|
| bridge-tool-inventory.csv | 12 | UT-01, UT-02, UT-11, UT-12, PBT-01 |
| bridge-tool-call-params.csv | 12 | UT-03, UT-13, UT-14, UT-15, UT-16, UT-17, UT-18, IT-01, IT-02 |
| wiring-merge-scenarios.csv | 9 | UT-04, UT-05, UT-06, UT-07, IT-03, PBT-02 |
| loadout-role-scenarios.csv | 6 | UT-08, UT-09, UT-10 |
| uat-steps.csv | 8 | E2E-UI-01..04, SIT-01..03 |

Tổng: 47 data rows; coverage 30/30 STC IDs = 100%.

## Ghi chú sử dụng

- `params_json` escape double-quote theo chuẩn CSV ("" nội bộ).
- Giá trị `xxxxx(4001 chars)` = chuỗi 'x' lặp 4001 lần ( UT-14 boundary); `xxxxx(4000 chars)` = 4000 lần (pass).
- Placeholder runtime ID: không cần — mọi ID tool call dùng literal ('id-1'..'id-8', 'it-1') trong test.
- Dynamic IDs: `{existing_user_id}`-style không áp dụng (không có DB/entity).
