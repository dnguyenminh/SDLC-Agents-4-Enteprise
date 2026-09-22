# SA4E-307 STC

![Sequence](diagrams/sequence_detailed.png)

TC001 Entra login thành công — kỳ vọng user link/create OK
TC002 Entra token sai signature — reject
TC003 JitProvisioningService với NormalizedProfile google mock — tạo user
TC004 Registry trả EntraProviderStrategy đúng
TC005 sso-dynamic dispatch provider unknown — 501
