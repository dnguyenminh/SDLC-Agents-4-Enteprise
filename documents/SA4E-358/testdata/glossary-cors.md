# Domain Glossary — SA4E-358 (CORS / Loopback Security)

Bổ sung terms bảo mật CORS cho KB (nguồn: BRD SA4E-358, finding SA-01 của SA4E-356).

## Entries (định dạng GLOSSARY để ingest)

GLOSSARY | term=CORS | definition=Cross-Origin Resource Sharing — cơ chế browser cho phép web page gọi resource của origin khác; server quyết định origin nào được ĐỌC response qua header Access-Control-Allow-Origin; ACAO * = mọi origin đều đọc được (nguy hiểm trên loopback server) | avoid=same-origin policy, CORS bypass, cross domain
GLOSSARY | term=Origin | definition=Scheme + host + port của caller (vd https://evil.com, vscode-webview://abc123); browser tự gắn header Origin cho cross-origin request và JavaScript KHÔNG thể giả mạo — là tín hiệu tin cậy chính để gate request trên loopback | avoid=referer, host header, domain
GLOSSARY | term=ACAO | definition=Access-Control-Allow-Origin — response header khai báo origin được phép đọc response; pattern an toàn: echo đúng Origin chỉ khi Origin thuộc allowlist, TUYỆT ĐỐI không dùng * vô điều kiện (CWE-942) | avoid=wildcard, star header, permissive cors
GLOSSARY | term=Preflight | definition=Request OPTIONS browser gửi trước cross-origin request không-đơn-giản (vd POST JSON); chỉ khi preflight pass (2xx + ACAO hợp lệ) thì request thật mới được gửi; gate phải chặn preflight của origin lạ (trả 403 thay vì 204) | avoid=options request, cors check, handshake
GLOSSARY | term=Allowlist | definition=Danh sách giá trị được phép — ở SA4E-358: pattern Origin hợp lệ (vscode-webview://*, http/https localhost + 127.0.0.1 mọi port); mọi giá trị ngoài danh sách bị deny (fail-closed); so khớp pattern theo scheme, KHÔNG substring matching | avoid=whitelist, blocklist, blacklist
GLOSSARY | term=DNS Rebinding | definition=Kỹ thuật attacker trỏ DNS domain của mình về 127.0.0.1 để request trông như same-origin nhưng chạm loopback server; phòng: validate Host header phải là 127.0.0.1/localhost:port (CWE-350) | avoid=rebinding attack, dns swap, host spoof
GLOSSARY | term=Loopback Binding | definition=Bind server vào 127.0.0.1 (chỉ nhận connection từ chính máy); WrapperServer đã bind đúng từ đầu (WrapperServer.ts:98) — chặn attacker remote từ mạng nhưng KHÔNG chặn browser cùng máy (drive-by) | avoid=0.0.0.0, bind all interfaces, listen localhost
GLOSSARY | term=Cross-Origin Readback | definition=Kịch bản tấn công: JS của origin A ĐỌC được response của request gửi đến server khác — được bật bởi ACAO *; vector chính của SA-01: trang web đọc dữ liệu Atlassian qua MCP wrapper :9181 | avoid=data exfil, response leak, cors steal
GLOSSARY | term=Fail-closed | definition=Nguyên tắc bảo mật: khi không xác định được trạng thái hợp lệ (header hỏng, thiếu thông tin, nhiều giá trị Origin) → TỪ CHỐI thay vì cho qua; ngược lại fail-open là anti-pattern | avoid=default deny, secure default, closed gate
GLOSSARY | term=Drive-by Attack | definition=Tấn công chỉ cần user visit 1 trang web (không cài đặt, không thao tác thêm); điều kiện kèm theo: server loopback đang listen trong browser context của user — đúng scenario SA-01 | avoid=watering hole, web attack, browser exploit
