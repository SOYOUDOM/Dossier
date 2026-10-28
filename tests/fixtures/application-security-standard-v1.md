# Application Security Standard

Version: 1.0
Effective date: 2025-01-15
Owner: Information Security

## 1. Purpose

This standard sets the minimum security controls for applications that the
organisation builds, buys or runs.

## 2. Scope

It applies to every application in production, including internet-facing
applications and internal line-of-business systems.

## 3. Vulnerability Management

### 3.1 Severity Classification

Vulnerabilities are classified by their CVSS base score.

| Severity | CVSS base score |
|---|---|
| Critical | 9.0 - 10.0 |
| High | 7.0 - 8.9 |
| Medium | 4.0 - 6.9 |
| Low | 0.1 - 3.9 |

### 3.2 Reporting

A vulnerability found in an internet-facing application must be reported to
Information Security as soon as it is confirmed. The application owner
records it in the vulnerability register.

### 3.3 Remediation

Vulnerabilities must be remediated by the application owner. Remediation is
tracked in the vulnerability register until closed.

## 4. Secure Configuration

Default accounts must be disabled before an application goes live.
