#!/bin/bash
# ============================================================
# coupiya-frontend 全面审查脚本
# 在 coupiya-frontend 项目根目录执行:
#   bash /path/to/audit.sh
# ============================================================

echo "=========================================="
echo " coupiya-frontend 代码审查 - 查找所有问题"
echo "=========================================="
echo ""

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROBLEM_COUNT=0

check_pattern() {
  local desc="$1"
  local pattern="$2"
  local result
  result=$(grep -rn "$pattern" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.env*" . 2>/dev/null | grep -v node_modules | grep -v .next | grep -v .git)
  if [ -n "$result" ]; then
    echo -e "${RED}❌ 发现: $desc${NC}"
    echo "$result"
    echo ""
    PROBLEM_COUNT=$((PROBLEM_COUNT + 1))
  else
    echo -e "${GREEN}✅ 未发现: $desc${NC}"
  fi
}

# 1. 检查 localhost 引用
check_pattern "localhost 地址（应该在 Docker 外部不可达）" "localhost"

# 2. 检查内部 IP
check_pattern "10.136.131.x 内部 IP" "10\.136\.131\."

# 3. 检查直接的端口号
check_pattern "硬编码端口 8009/8000/9000/9001" "[^0-9]800[09][^0-9]\|[^0-9]900[0-9][^0-9]"

# 4. 检查 minio 直接引用
check_pattern "minio:9000 Docker 内部地址" "minio:9000"

# 5. 检查 http:// 协议（应该是 https://）
check_pattern "http:// 协议（应该是 https://）" "http://"

# 6. 检查 graphql endpoint
echo -e "${YELLOW}--- GraphQL Endpoint 检查 ---${NC}"
grep -rn "uri:" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v .next

echo ""
echo -e "${YELLOW}--- 图片 URL 使用检查 ---${NC}"
grep -rn "\.media\[\|\.url\|thumbnail" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v .next | grep -v ".git"

echo ""
echo -e "${YELLOW}--- 环境变量检查 ---${NC}"
find . -name ".env*" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null | while read f; do
  echo "文件: $f"
  grep -E "API_URL|MEDIA_URL|GRAPHQL|SALEOR|STATIC_URL|NEXT_PUBLIC" "$f" 2>/dev/null
done

echo ""
echo "=========================================="
if [ $PROBLEM_COUNT -eq 0 ]; then
  echo -e "${GREEN}🎉 未发现问题！${NC}"
else
  echo -e "${RED}⚠️  发现 $PROBLEM_COUNT 类问题需要修复${NC}"
fi
echo "=========================================="
