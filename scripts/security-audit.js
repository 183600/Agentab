#!/usr/bin/env node

/**
 * Security Audit Script
 * Performs comprehensive security checks on the codebase
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const issues = {
  critical: [],
  high: [],
  medium: [],
  low: []
};

// Security patterns to check
const SECURITY_PATTERNS = {
  eval: {
    pattern: /\beval\s*\(/g,
    severity: 'critical',
    message: 'Use of eval() - potential code injection risk'
  },
  innerHTML: {
    pattern: /\.innerHTML\s*=/g,
    severity: 'high',
    message: 'Direct innerHTML assignment - potential XSS risk'
  },
  documentWrite: {
    pattern: /document\.write\s*\(/g,
    severity: 'high',
    message: 'Use of document.write() - potential XSS risk'
  },
  localStorageRaw: {
    pattern: /localStorage\.(setItem|getItem)\s*\([^)]*password[^)]*\)/gi,
    severity: 'high',
    message: 'Password stored in localStorage without encryption'
  },
  httpOnly: {
    pattern: /http:\/\//g,
    severity: 'medium',
    message: 'HTTP URL found - should use HTTPS'
  },
  apiKeyInCode: {
    pattern: /(api[_-]?key|apikey)\s*[=:]\s*['"][^'"]{10,}['"]/gi,
    severity: 'critical',
    message: 'API key hardcoded in source'
  },
  sqlInjection: {
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\+\s*(?:req|request|params|body|query)/gi,
    severity: 'critical',
    message: 'Potential SQL injection - unsanitized input in query'
  },
  commandInjection: {
    pattern: /(?:exec|spawn|execSync)\s*\([^)]*\+/g,
    severity: 'critical',
    message: 'Potential command injection - unsanitized input in command'
  },
  prototypePollution: {
    pattern: /(?:__proto__|constructor\.prototype)/g,
    severity: 'high',
    message: 'Potential prototype pollution'
  },
  regexDoS: {
    pattern: /new RegExp\([^)]*\+\s*[^)]+\)/g,
    severity: 'medium',
    message: 'Dynamic regex - potential ReDoS'
  }
};

function scanFile(filePath) {
  const ext = extname(filePath);
  if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    return;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (const [name, config] of Object.entries(SECURITY_PATTERNS)) {
      let match;
      const regex = new RegExp(config.pattern.source, config.pattern.flags);

      while ((match = regex.exec(content)) !== null) {
        // Find line number
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        const line = lines[lineNumber - 1]?.trim() || '';

        // Skip if in comment
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
          continue;
        }

        issues[config.severity].push({
          file: filePath,
          line: lineNumber,
          code: line.substring(0, 100),
          type: name,
          message: config.message
        });
      }
    }
  } catch (error) {
    console.error(`Error scanning ${filePath}: ${error.message}`);
  }
}

function scanDirectory(dir, exclude = ['node_modules', 'dist', 'coverage', '.git']) {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (exclude.includes(entry)) {
        continue;
      }

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath, exclude);
      } else if (stat.isFile()) {
        scanFile(fullPath);
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

function checkManifestSecurity() {
  try {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

    // Check permissions
    const dangerousPerms = ['debugger', 'declarativeNetRequest', 'proxy'];
    const permissions = manifest.permissions || [];

    for (const perm of dangerousPerms) {
      if (permissions.includes(perm)) {
        issues.high.push({
          file: 'manifest.json',
          line: 0,
          code: `"${perm}"`,
          type: 'dangerous_permission',
          message: `Dangerous permission: ${perm}`
        });
      }
    }

    // Check host permissions
    const hostPerms = manifest.host_permissions || [];
    if (hostPerms.includes('<all_urls>')) {
      issues.medium.push({
        file: 'manifest.json',
        line: 0,
        code: '<all_urls>',
        type: 'broad_host_permission',
        message: 'Broad host permissions - consider limiting to specific domains'
      });
    }

    // Check CSP
    const csp = manifest.content_security_policy;
    if (csp) {
      const extensionCsp = csp.extension_pages || '';
      if (extensionCsp.includes('unsafe-eval')) {
        issues.critical.push({
          file: 'manifest.json',
          line: 0,
          code: 'unsafe-eval',
          type: 'weak_csp',
          message: 'CSP allows unsafe-eval - weak security policy'
        });
      }
      if (extensionCsp.includes('unsafe-inline')) {
        issues.high.push({
          file: 'manifest.json',
          line: 0,
          code: 'unsafe-inline',
          type: 'weak_csp',
          message: 'CSP allows unsafe-inline - consider using nonces or hashes'
        });
      }
    }
  } catch (error) {
    console.error('Error checking manifest:', error.message);
  }
}

function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('SECURITY AUDIT REPORT');
  console.log('='.repeat(60) + '\n');

  const totalIssues =
    issues.critical.length + issues.high.length + issues.medium.length + issues.low.length;

  if (totalIssues === 0) {
    console.log(`${COLORS.green}✓ No security issues found${COLORS.reset}\n`);
    return true;
  }

  // Summary
  console.log('Summary:');
  console.log(`  ${COLORS.red}Critical: ${issues.critical.length}${COLORS.reset}`);
  console.log(`  ${COLORS.yellow}High: ${issues.high.length}${COLORS.reset}`);
  console.log(`  ${COLORS.blue}Medium: ${issues.medium.length}${COLORS.reset}`);
  console.log(`  Low: ${issues.low.length}`);
  console.log(`  Total: ${totalIssues}\n`);

  // Details
  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const colors = {
    critical: COLORS.red,
    high: COLORS.yellow,
    medium: COLORS.blue,
    low: COLORS.reset
  };

  for (const severity of severityOrder) {
    if (issues[severity].length === 0) continue;

    console.log(`\n${colors[severity]}${severity.toUpperCase()} SEVERITY${COLORS.reset}`);
    console.log('-'.repeat(40));

    for (const issue of issues[severity]) {
      console.log(`\n  File: ${issue.file}:${issue.line}`);
      console.log(`  Type: ${issue.type}`);
      console.log(`  ${issue.message}`);
      if (issue.code) {
        console.log(`  Code: ${issue.code}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Return false if there are critical or high severity issues
  return issues.critical.length === 0 && issues.high.length === 0;
}

// Main execution
console.log(`${COLORS.blue}Scanning codebase for security issues...${COLORS.reset}\n`);

scanDirectory('.');
checkManifestSecurity();

const passed = generateReport();

if (!passed) {
  console.log(`${COLORS.red}✗ Security audit failed${COLORS.reset}\n`);
  process.exit(1);
} else {
  console.log(`${COLORS.green}✓ Security audit passed${COLORS.reset}\n`);
  process.exit(0);
}
