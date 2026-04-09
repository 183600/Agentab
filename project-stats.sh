#!/bin/bash

echo "================================"
echo "Agentab 项目改进统计报告"
echo "================================"
echo ""

echo "📁 代码统计"
echo "--------------------------------"
echo "总文件数: $(find lib test -name "*.js" -type f | wc -l)"
echo "总代码行数: $(find lib test -name "*.js" -type f -exec wc -l {} + | tail -1 | awk '{print $1}')"
echo ""

echo "📦 模块统计"
echo "--------------------------------"
echo "核心模块: $(ls lib/*.js 2>/dev/null | wc -l)"
echo "测试文件: $(ls test/*.test.js 2>/dev/null | wc -l)"
echo ""

echo "✅ 测试统计"
echo "--------------------------------"
npm test 2>&1 | grep -E "Test Files|Tests|Duration" | tail -3
echo ""

echo "🆕 新增文件 (本次改进)"
echo "--------------------------------"
ls -lh lib/secure-sandbox.js lib/recovery.js lib/scheduler.js lib/autocomplete.js lib/progress.js 2>/dev/null | awk '{print $9, $5}'
echo ""

echo "📝 文档文件"
echo "--------------------------------"
ls -lh IMPROVEMENTS_V2.md SUMMARY.md integration-guide.js 2>/dev/null | awk '{print $9, $5}'
echo ""

echo "================================"
