<script setup lang="ts">
defineOptions({ name: 'NestedFields' })

interface LogFieldEntry {
  key: string
  value: string
  isObject: boolean
  children: LogFieldEntry[]
  preview: string
}

const props = defineProps<{
  fields: LogFieldEntry[]
  depth?: number
}>()

const expandedKeys = ref(new Set<string>())

function toggle(key: string) {
  const s = expandedKeys.value
  if (s.has(key)) s.delete(key); else s.add(key)
  expandedKeys.value = new Set(s)
}

import { ref } from 'vue'
</script>

<template>
  <div class="nested-fields" :style="{ paddingLeft: depth ? '14px' : '0' }">
    <div v-for="f in fields" :key="f.key" class="nested-field-row">
      <span class="nf-key">{{ f.key }}:</span>
      <template v-if="f.isObject">
        <span class="nf-toggle" :class="{ expanded: expandedKeys.has(f.key) }" @click="toggle(f.key)">
          <span class="nf-icon">{{ expandedKeys.has(f.key) ? '▾' : '▸' }}</span>
          <span class="nf-preview">{{ f.preview }}</span>
        </span>
        <NestedFields
          v-if="expandedKeys.has(f.key)"
          :fields="f.children"
          :depth="(depth ?? 0) + 1"
        />
      </template>
      <span v-else class="nf-value">{{ f.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.nested-fields {
  font-size: 12px;
  line-height: 1.6;
}
.nested-field-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.nf-key {
  flex-shrink: 0;
  color: #79c0ff;
  min-width: 60px;
}
.nf-value {
  color: #c9d1d9;
  word-break: break-all;
}
.nf-toggle {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 1px 4px;
  border-radius: 3px;
}
.nf-toggle:hover {
  background: #21262d;
}
.nf-icon {
  color: #484f58;
  font-size: 10px;
  width: 12px;
  flex-shrink: 0;
}
.nf-preview {
  color: #6e7681;
  font-family: inherit;
  word-break: break-all;
}
</style>
