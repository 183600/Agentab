#!/usr/bin/env node

/**
 * Performance Analysis Script
 * Analyzes code splitting opportunities and bundle sizes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

/**
 * Analyze a JavaScript file
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const stats = fs.statSync(filePath);

  // Count imports
  const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
  const imports = [...importMatches].map(m => m[1]);

  // Count exports
  const exportMatches = content.matchAll(/export\s+(?:const|let|var|function|class|async\s+function)/g);
  const exportCount = [...exportMatches].length;

  // Check for dynamic imports
  const dynamicImportMatches = content.matchAll(/import\s*\(/g);
  const dynamicImports = [...dynamicImportMatches].length;

  // Estimate complexity
  const lines = content.split('\n').length;
  const functions = (content.match(/function\s+\w+/g) || []).length;
  const classes = (content.match(/class\s+\w+/g) || []).length;

  return {
    path: filePath,
    size: stats.size,
    lines,
    imports,
    importCount: imports.length,
    exportCount,
    dynamicImports,
    functions,
    classes,
    complexity: lines + functions * 5 + classes * 10
  };
}

/**
 * Walk directory and collect JS files
 */
function collectJsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden dirs
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      collectJsFiles(fullPath, files);
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Analyze module dependencies
 */
function analyzeDependencies(fileAnalyses) {
  const dependencyGraph = new Map();
  const reverseDependencies = new Map();

  for (const analysis of fileAnalyses) {
    const modulePath = path.relative(ROOT_DIR, analysis.path);
    dependencyGraph.set(modulePath, new Set());

    for (const importPath of analysis.imports) {
      // Resolve relative imports
      let resolved;
      if (importPath.startsWith('.')) {
        resolved = path.resolve(path.dirname(analysis.path), importPath);
        if (!resolved.endsWith('.js')) {
          resolved += '.js';
        }
        resolved = path.relative(ROOT_DIR, resolved);
      } else {
        resolved = importPath;
      }

      dependencyGraph.get(modulePath).add(resolved);

      // Track reverse dependencies
      if (!reverseDependencies.has(resolved)) {
        reverseDependencies.set(resolved, new Set());
      }
      reverseDependencies.get(resolved).add(modulePath);
    }
  }

  return { dependencyGraph, reverseDependencies };
}

/**
 * Find large modules that could be split
 */
function findSplitCandidates(fileAnalyses, threshold = 10000) {
  return fileAnalyses
    .filter(a => a.size > threshold && a.dynamicImports === 0)
    .sort((a, b) => b.size - a.size)
    .map(a => ({
      path: path.relative(ROOT_DIR, a.path),
      size: a.size,
      sizeKB: Math.round(a.size / 1024),
      lines: a.lines,
      exports: a.exportCount,
      complexity: a.complexity
    }));
}

/**
 * Calculate total bundle size
 */
function calculateBundleSize(fileAnalyses) {
  const total = fileAnalyses.reduce((sum, a) => sum + a.size, 0);
  const byDirectory = {};

  for (const analysis of fileAnalyses) {
    const relativePath = path.relative(ROOT_DIR, analysis.path);
    const dir = relativePath.split(path.sep)[0] || 'root';

    if (!byDirectory[dir]) {
      byDirectory[dir] = { size: 0, files: 0, lines: 0 };
    }

    byDirectory[dir].size += analysis.size;
    byDirectory[dir].files++;
    byDirectory[dir].lines += analysis.lines;
  }

  return {
    total,
    totalKB: Math.round(total / 1024),
    byDirectory,
    fileCount: fileAnalyses.length
  };
}

/**
 * Generate performance report
 */
function generateReport(results) {
  const lines = [];

  lines.push('# Performance Analysis Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Bundle Summary
  lines.push('## Bundle Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Size | ${results.bundle.totalKB} KB |`);
  lines.push(`| File Count | ${results.bundle.fileCount} |`);
  lines.push('');

  // Size by Directory
  lines.push('### Size by Directory');
  lines.push('');
  lines.push(`| Directory | Files | Size (KB) | Lines |`);
  lines.push(`|-----------|-------|-----------|-------|`);

  const sortedDirs = Object.entries(results.bundle.byDirectory).sort((a, b) => b[1].size - a[1].size);

  for (const [dir, stats] of sortedDirs) {
    lines.push(`| ${dir} | ${stats.files} | ${Math.round(stats.size / 1024)} | ${stats.lines} |`);
  }
  lines.push('');

  // Split Candidates
  lines.push('## Code Splitting Candidates');
  lines.push('');
  lines.push('Large modules without dynamic imports that could benefit from lazy loading:');
  lines.push('');
  lines.push(`| File | Size (KB) | Lines | Exports | Complexity |`);
  lines.push(`|------|-----------|-------|---------|------------|`);

  for (const candidate of results.splitCandidates.slice(0, 15)) {
    lines.push(
      `| ${candidate.path} | ${candidate.sizeKB} | ${candidate.lines} | ${candidate.exports} | ${candidate.complexity} |`
    );
  }
  lines.push('');

  // Performance Recommendations
  lines.push('## Performance Recommendations');
  lines.push('');

  const recommendations = generateRecommendations(results);
  for (const rec of recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push('');

  // Lazy Loading Opportunities
  lines.push('## Lazy Loading Opportunities');
  lines.push('');

  for (const candidate of results.splitCandidates.slice(0, 5)) {
    lines.push(`### \`${candidate.path}\``);
    lines.push('');
    lines.push('Current: Static import');
    lines.push('```javascript');
    lines.push(`import { Module } from '../${candidate.path}';`);
    lines.push('```');
    lines.push('');
    lines.push('Recommended: Dynamic import');
    lines.push('```javascript');
    lines.push(`const loadModule = () => import('../${candidate.path}');`);
    lines.push(`// Usage: const { Module } = await loadModule();`);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate performance recommendations
 */
function generateRecommendations(results) {
  const recommendations = [];

  // Check for large lib modules
  const libModules = results.splitCandidates.filter(c => c.path.startsWith('lib/'));
  if (libModules.length > 3) {
    recommendations.push(
      `Consider lazy loading ${libModules.length} large lib modules to reduce initial bundle size`
    );
  }

  // Check for high complexity modules
  const complexModules = results.splitCandidates.filter(c => c.complexity > 500);
  if (complexModules.length > 0) {
    recommendations.push(
      `${complexModules.length} modules have high complexity - consider further modularization`
    );
  }

  // Check bundle size
  if (results.bundle.totalKB > 500) {
    recommendations.push(
      `Total bundle size (${results.bundle.totalKB} KB) exceeds recommended 500 KB - prioritize code splitting`
    );
  }

  // Check for unused dynamic imports
  const dynamicImportCount = results.analyses.filter(a => a.dynamicImports > 0).length;
  if (dynamicImportCount < 3) {
    recommendations.push(
      'Few dynamic imports found - consider using more for better initial load performance'
    );
  }

  // Check largest files
  if (results.splitCandidates.length > 0) {
    const largest = results.splitCandidates[0];
    recommendations.push(
      `Largest file \`${largest.path}\` (${largest.sizeKB} KB) is a prime candidate for code splitting`
    );
  }

  return recommendations;
}

/**
 * Main analysis function
 */
function main() {
  console.log('Analyzing performance...');
  console.log('');

  // Collect and analyze files
  const files = collectJsFiles(ROOT_DIR);
  console.log(`Found ${files.length} JavaScript files`);

  const analyses = files.map(analyzeFile);
  console.log('Analyzed all files');
  console.log('');

  // Analyze dependencies
  const dependencies = analyzeDependencies(analyses);

  // Find split candidates
  const splitCandidates = findSplitCandidates(analyses);

  // Calculate bundle size
  const bundle = calculateBundleSize(analyses);

  // Generate results
  const results = {
    analyses,
    dependencies,
    splitCandidates,
    bundle
  };

  // Generate and save report
  const report = generateReport(results);
  const reportPath = path.join(ROOT_DIR, 'PERFORMANCE_REPORT.md');
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`Report saved to: ${reportPath}`);
  console.log('');
  console.log('Summary:');
  console.log(`  Total Bundle Size: ${bundle.totalKB} KB`);
  console.log(`  Total Files: ${bundle.fileCount}`);
  console.log(`  Split Candidates: ${splitCandidates.length}`);
  console.log('');

  // Print quick stats
  console.log('Top 5 Largest Files:');
  for (const candidate of splitCandidates.slice(0, 5)) {
    console.log(`  ${candidate.path}: ${candidate.sizeKB} KB (${candidate.lines} lines)`);
  }
}

// Run analysis
main();
