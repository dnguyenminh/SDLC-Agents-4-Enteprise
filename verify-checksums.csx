using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

string root = Environment.CurrentDirectory;
string csPath = Path.Combine(root, "extension/resources/.sdlc-checksums.json");
string cs = File.ReadAllText(csPath);
JsonDocument doc = JsonDocument.Parse(cs);
var files = doc.RootElement.GetProperty("files");

int total = 0, ok = 0, mismatch = 0, missing = 0;
var failures = new List<string>();
foreach (var kv in files.EnumerateObject()) {
  var rel = kv.Name;
  total++;
  string full = Path.Combine(root, rel);
  if (!File.Exists(full)) { missing++; continue; }
  string actual;
  try {
    using (var sha = SHA256.Create()) {
      byte[] bytes = File.ReadAllBytes(full);
      actual = Convert.ToHexString(sha.ComputeHash(bytes));
    }
  } catch (Exception e) { actual = "ERR:" + e.Message; }
  string expected = kv.Value.GetProperty("hash").GetString();
  if (string.IsNullOrEmpty(expected)) { continue; }
  if (string.Equals(actual, expected, StringComparison.Ordinal)) ok++;
  else { mismatch++; failures.Add($"{rel}\n    expected {expected[..12]}\n    actual   {actual[..12]}"); }
}
Console.WriteLine($"Checksum files: total {total}, match {ok}, mismatch {mismatch}, missing {missing}");
foreach (var f in failures.Take(30)) Console.WriteLine("MISMATCH: " + f);
