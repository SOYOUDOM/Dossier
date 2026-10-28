# Application Security Standard

Version: 2.0
Effective date: 2026-02-01
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
Information Security as soon as it is confirmed.

### 3.3 Remediation Timeframe

Vulnerabilities must be remediated within the following timeframes, counted
from the date the vulnerability is confirmed.

| Severity | Internet-facing application | Internal application |
|---|---|---|
| Critical | 7 days | 14 days |
| High | 30 days | 45 days |
| Medium | 90 days | 90 days |
| Low | 180 days | 180 days |

### 3.4 Exceptions

Where a vulnerability cannot be remediated in time, the application owner may
request an exception. An exception must be approved by the Chief Information
Security Officer and may extend the timeframe by at most 30 days.

## 4. Secure Configuration

Default accounts must be disabled before an application goes live.
