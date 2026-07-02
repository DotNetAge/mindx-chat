<script setup lang="ts">
/**
 * SkeletonChat — 切换会话加载历史消息时的骨架屏
 *
 * 基于 Element Plus `<el-skeleton>` 组件。
 * 交替渲染用户消息（右对齐）和助理消息（左对齐）的占位气泡，
 * 底部渐隐线暗示消息还在恢复中。
 */
const ROWS = 6
</script>

<template>
  <div class="skeleton-chat" aria-hidden="true">
    <div
      v-for="i in ROWS"
      :key="i"
      class="skeleton-row"
      :class="{ 'skeleton-row--user': i % 2 === 1, 'skeleton-row--assistant': i % 2 === 0 }"
    >
      <!-- 助理消息左侧头像占位 -->
      <el-skeleton-item v-if="i % 2 === 0" variant="circle" class="skeleton-avatar" />

      <el-skeleton animated class="skeleton-bubble" :class="'skeleton-bubble--' + (i % 2 === 1 ? 'user' : 'assistant')">
        <template #template>
          <el-skeleton-item variant="p" class="skeleton-line" />
          <el-skeleton-item variant="p" class="skeleton-line" />
          <el-skeleton-item
            variant="p"
            class="skeleton-line"
            :style="{ width: i % 2 === 1 ? '40%' : '65%' }"
          />
        </template>
      </el-skeleton>

      <!-- 用户消息右侧头像占位 -->
      <el-skeleton-item v-if="i % 2 === 1" variant="circle" class="skeleton-avatar" />
    </div>

    <!-- 底部渐隐指示器 -->
    <div class="skeleton-fade" />
  </div>
</template>

<style scoped>
.skeleton-chat {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 28px;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.skeleton-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  animation: skeleton-fade-in 0.4s ease-out both;
}

.skeleton-row:nth-child(1) { animation-delay: 0s; }
.skeleton-row:nth-child(2) { animation-delay: 0.1s; }
.skeleton-row:nth-child(3) { animation-delay: 0.2s; }
.skeleton-row:nth-child(4) { animation-delay: 0.3s; }
.skeleton-row:nth-child(5) { animation-delay: 0.4s; }
.skeleton-row:nth-child(6) { animation-delay: 0.5s; }

.skeleton-row--user {
  justify-content: flex-end;
}

.skeleton-row--assistant {
  justify-content: flex-start;
}

.skeleton-avatar {
  width: 28px !important;
  height: 28px !important;
  flex-shrink: 0;
  border-radius: 8px !important;
}

.skeleton-bubble {
  max-width: 75%;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(55, 65, 81, 0.08);
  --el-skeleton-color: rgba(55, 65, 81, 0.15);
  --el-skeleton-to-color: rgba(55, 65, 81, 0.25);
}

.skeleton-bubble--user {
  border-radius: 10px 4px 10px 10px;
}

.skeleton-bubble--assistant {
  border-radius: 4px 10px 10px 10px;
}

.skeleton-line {
  display: block;
  width: 100%;
  height: 12px;
}

/* 行入场动画 */
@keyframes skeleton-fade-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 底部渐隐 */
.skeleton-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(
    to bottom,
    transparent,
    var(--bg-primary, #0f172a)
  );
  pointer-events: none;
}
</style>
