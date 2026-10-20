/**
 * Shared fixtures for artifact-analyzer tests.
 * Extracted from artifact-analyzer.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — fixtures relocated.
 */

export const PEGA_RULE_JSON = JSON.stringify({
  pxObjClass: 'Rule-Obj-Activity',
  pyClassName: 'Work-Cover-Jira',
  pyActivityName: 'ResolveTicket',
  pyLabel: 'Process and Resolve Jira Ticket',
  pyRuleset: 'JiraIntegration',
  steps: [
    { pyStepNum: '1', pyMethod: 'Property-Set', pyMethodParameters: '.Status', pyStepPage: '', pyStepPageClass: '' },
    { pyStepNum: '2', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.SendNotification', pyStepPage: '', pyStepPageClass: '' },
  ],
});

export const PEGA_RULE_NO_PXOBJCLASS = JSON.stringify({
  pyClassName: 'Work-Cover-Jira',
  pyActivityName: 'NoClassRule',
});

export const TYPESCRIPT_CODE = `import { Component } from '@angular/core';

interface User {
  name: string;
  age: number;
}

export function greet(user: User): string {
  return \`Hello, \${user.name}\`;
}`;

export const PYTHON_CODE = `import os
from typing import List

def calculate_total(items: List[float]) -> float:
    total = 0.0
    for item in items:
        total += item
    return total

class Calculator:
    pass`;

export const JAVA_CODE = `package com.example;

import java.util.List;

public class HelloWorld {
    private String name;

    public String greet() {
        return "Hello, " + this.name;
    }
}`;

export const CPP_CODE = `#include <iostream>
#include <vector>

class MyClass {
private:
    int value;
public:
    MyClass(int v) : value(v) {}
    void print() const { std::cout << value; }
};

int main() {
    MyClass obj(42);
    obj.print();
    return 0;
}`;

export const JSON_OBJECT = '{"name": "test", "value": 42, "nested": {"a": 1, "b": 2}}';
export const XML_CONTENT = '<root><item id="1">value</item><item id="2">other</item></root>';
export const YAML_CONTENT = 'server:\n  port: 8080\n  host: localhost\n  debug: true';

export const RANDOM_TEXT = 'The quick brown fox jumps over the lazy dog.';
