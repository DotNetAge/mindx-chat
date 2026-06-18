<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpened, Document } from '@element-plus/icons-vue'

const props = defineProps({
  content: {
    type: String,
    default: ''
  }
})

// Unix 绝对路径或 ~ 开头的路径
// 分段：路径段不允许包含空格、标点（: ; , ! ? )）
const PATH_RE = /(?:~|\/)(?:[^\s:;,!?)]+\/)*[^\s:;,!?)]+/g

interface TextSeg { type: 'text'; text: string }
interface PathSeg { type: 'path'; path: string; name: string; isDir: boolean }

function isDirPath(p: string): boolean {
  return p.endsWith('/') || !/\.\w+$/.test(p)
}

const segments = computed<(TextSeg | PathSeg)[]>(() => {
  const text = props.content
  if (!text) return []
  const result: (TextSeg | PathSeg)[] = []
  let lastIdx = 0

  // 用全局 regex 迭代查找所有匹配
  let m: RegExpExecArray | null
  PATH_RE.lastIndex = 0
  while ((m = PATH_RE.exec(text)) !== null) {
    // 前面的纯文本段
    if (m.index > lastIdx) {
      result.push({ type: 'text', text: text.slice(lastIdx, m.index) })
    }
    const raw = m[0]
    result.push({
      type: 'path',
      path: raw,
      name: raw.split('/').filter(Boolean).pop() || raw,
      isDir: isDirPath(raw),
    })
    lastIdx = m.index + raw.length
  }
  // 末尾纯文本段
  if (lastIdx < text.length) {
    result.push({ type: 'text', text: text.slice(lastIdx) })
  }
  return result
})
</script>

<template>
  <span class="formatted-content">
    <template v-for="(seg, i) in segments" :key="i">
      <span v-if="seg.type === 'text'">{{ seg.text }}</span>
      <el-tooltip v-else :content="seg.path" placement="top" :show-after="300">
        <a
          :href="'file://' + seg.path"
          class="path-link"
          target="_blank"
          rel="noopener noreferrer"
          @click.stop
        >
          <el-icon :size="14">
            <FolderOpened v-if="seg.isDir" />
            <Document v-else />
          </el-icon>
          {{ seg.name }}
        </a>
      </el-tooltip>
    </template>
  </span>
</template>

<style scoped>
.path-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--accent-cyan);
  text-decoration: none;
  font-weight: 600;
  font-size: 13px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(6, 182, 212, 0.08);
  border: 1px solid rgba(6, 182, 212, 0.15);
  transition: all 0.15s ease;
  white-space: nowrap;
}

.path-link:hover {
  background: rgba(6, 182, 212, 0.15);
  border-color: rgba(6, 182, 212, 0.35);
  color: #67e8f9;
}

.path-link .el-icon {
  flex-shrink: 0;
}
</style>
