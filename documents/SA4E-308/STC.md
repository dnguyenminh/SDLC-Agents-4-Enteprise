# SA4E-308 STC

![Sequence](diagrams/sequence_detailed.png)

TC001 Google login thành công
TC002 id_token sai aud -> reject
TC003 nonce mismatch -> reject
TC004 email_verified=false -> reject
