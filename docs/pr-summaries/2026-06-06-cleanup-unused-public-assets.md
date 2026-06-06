# PR 汇总：清理未引用公共资源

## 标题

清理旧图谱时期遗留的未引用公共资源。

## 功能描述

本 PR 删除仓库中不再被当前“小说转剧本 YAML”核心流程引用的静态资源，减少仓库噪音和体积，避免评审误以为项目仍依赖旧图谱样例内容。

删除内容包括：

- `public/icons.svg`
- `src/assets/hero.png`
- `public/novels/hongloumeng.txt`
- `public/novels/kuangren-riji.txt`
- `public/novels/the-call-of-the-wild.txt`

保留 `public/favicon.svg`，因为 `index.html` 仍引用它。

## 实现思路

1. 使用全文搜索确认这些文件没有被 README、docs、src、public 或入口 HTML 引用。
2. 删除已被 Git 跟踪但当前未使用的静态资源。
3. 不删除 `.env`、`.workbuddy/` 或未跟踪的本地原创样例文本。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 确认生产构建不依赖已删除资源。
3. 使用 `rg` 确认删除文件名不再被代码或文档引用。
