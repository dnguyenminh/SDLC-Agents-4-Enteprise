const escapeHtml = (str) => str
  .replace(/&/g, '\u0026\u0061\u006d\u0070\u003b')
  .replace(/</g, '\u0026\u006c\u0074\u003b')
  .replace(/>/g, '\u0026\u0067\u0074\u003b')
  .replace(/"/g, '\u0026\u0023\u0033\u0034\u003b')
  .replace(/'/g, '\u0026\u0023\u0033\u0039\u003b');

console.log('Test 1 (malicious):', escapeHtml('<script>alert("xss")</script>'));
console.log('Test 2 (quotes):', escapeHtml('He said "hello" & "goodbye"'));