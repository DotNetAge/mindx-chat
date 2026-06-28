# 分层RAG UI 改造计划

## 核心目标

语义搜索从"大片查小片"——搜索结果按文档层级折叠展示，力导图支持按需展开。

## 数据流

```
kb.search(query) → SearchResult[]
  │
  ├─ level (0=文档摘要, 1=节, 2=子节, ...)
  ├─ parent_id (父 chunk 的 SHA)
  ├─ chunk_type (root/segment/region)
  ├─ doc_id (所属文档)
  └─ has_children (布尔，是否有子 chunk)
        │
        ▼
TreeSearchPanel.vue ← graphStore.expandedChunkIds
  └─ 按 parent_id 分组 → 树状渲染
       ├─ [+] chunk (折叠)
       └─ [−] chunk (展开)
             └─ child chunks...
```

## 阶段

### Phase 1: 数据层 — graphApi.ts + graphStore.ts

- [ ] 1.1 SearchResult 类型扩展
  - `graphApi.ts`: 解析 `level`, `parent_id`, `chunk_type`, `doc_id`, `has_children`
  - 验证后端 `kb.search` 返回的 metadata 中是否包含这些字段

- [ ] 1.2 Store 新增树结构状态
  - `graphStore.ts`:
    - `searchTree: TreeNode[]` — 按 parent_id 分组后的树
    - `expandedChunkIds: Set<string>` — 展开的 chunk ID
    - `getChildren(parentId: string): SearchResult[]` — 从本地数据提取子片
    - `toggleChunkExpanded(chunkId: string)` — 切换展开/折叠

- [ ] 1.3 树构建工具函数
  - `utils/treeBuilder.ts`（新增）:
    - `buildSearchTree(results: SearchResult[]): TreeNode[]`
    - 按 parent_id 归组、排序、标记展开状态

### Phase 2: 搜索树组件 — TreeSearchPanel.vue

- [ ] 2.1 新建 `TreeSearchPanel.vue`
  - 树状渲染搜索结果
  - 层级路径（缩进 + 连线 └─ ├─）
  - [+]/[−] 折叠按钮
  - 选中/高亮当前匹配节点
  - Level 徽标（L0, L1, L2...）

- [ ] 2.2 整合到 GraphSidebar
  - `GraphSidebar.vue`: 搜索结果区从平铺列表改为 TreeSearchPanel

- [ ] 2.3 点击树节点 → 选中对应图节点
  - 保持与现有 `store.selectNode(nodeId)` 联动

### Phase 3: 力导图渐进加载

- [ ] 3.1 Region 节点交互
  - 点击 Region Node → 异步加载该 Region 下的 Document Nodes
  - 使用现有 API 但增加 depth=1 限制
  - 不一次性加载全部（当前 listAllNodes 加载全部）

- [ ] 3.2 Document 节点交互
  - 点击 Document Node → 加载其 CONTAINS 的实体

- [ ] 3.3 RelationGraph 渲染优化
  - 大量节点时保持性能（当前是全量加载）
  - 渐进式布局：新增节点时平滑过渡

### Phase 4: 细节打磨

- [ ] 4.1 搜索为空时的友好提示
- [ ] 4.2 树节点动画（折叠/展开过渡）
- [ ] 4.3 多级展开的 Breadcrumb 面包屑导航
- [ ] 4.4 配合 i18n（中英文）

## 关键约定

- `level === 0` = Root Chunk（文档摘要），显示为文档标题
- `chunk_type === "region"` 在搜索中显示为 📁 目录
- `chunk_type === "root"` 显示为 📄 文档
- `chunk_type === "segment"` 显示为 📑 章节
- `parent_id === ""` = 顶层节点（文档摘要或孤立的段）
