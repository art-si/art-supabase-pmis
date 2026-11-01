<template>
  <ArtSectionCard
    class="pmis-department-navigator"
    role="complementary"
    aria-label="部门与产线范围"
    title="部门 / 产线"
    subtitle="上级节点包含全部下级设备"
    :loading="loading"
    loading-mode="mask"
    :error="error"
    error-title="生产组织加载失败"
    :empty="!loading && !error && tree.length === 0"
    empty-title="暂无部门或产线"
    empty-description="请先在生产主数据中维护部门与产线。"
    :empty-visual-size="68"
    :min-height="0"
    body-class="is-compact"
    @retry="load"
  >
    <template #actions>
      <ArtIconButton
        icon="ri:filter-off-line"
        label="清除部门与产线筛选"
        :disabled="!activeId"
        @click="clear"
      />
    </template>

    <template #toolbar>
      <button
        type="button"
        class="pmis-department-navigator__all"
        :class="{ 'is-active': !activeId }"
        @click="clear"
      >
        <span class="art-icon-label"><ArtSvgIcon icon="ri:apps-2-line" />全部产线</span>
        <strong>{{ loading || error ? '—' : departmentCount }}</strong>
      </button>
    </template>

    <ElTree
      ref="treeRef"
      :data="tree"
      node-key="id"
      :props="{ label: 'departmentName', children: 'children' }"
      :current-node-key="activeId || undefined"
      default-expand-all
      highlight-current
      :expand-on-click-node="false"
      @node-click="selectNode"
    >
      <template #default="{ data }">
        <span class="pmis-department-navigator__node">
          <ArtSvgIcon :icon="data.children?.length ? 'ri:building-2-line' : 'ri:git-branch-line'" />
          <span :title="data.departmentName">{{ data.departmentName }}</span>
        </span>
      </template>
      <template #empty>
        <ArtEmptyState
          title="暂无可显示内容"
          description="请调整当前范围或稍后刷新。"
          size="compact"
          :visual-size="64"
        />
      </template>
    </ElTree>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { ElTree } from 'element-plus'
  import TreeUtils from '@/utils/tree'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { fetchPmisDepartmentTree, type PmisDepartmentTreeOption } from '@pmis/api'

  type TreeNode = PmisDepartmentTreeOption

  const emit = defineEmits<{ change: [ids: string[], label: string] }>()
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const loading = ref(false)
  const error = ref('')
  const activeId = ref('')
  const tree = shallowRef<TreeNode[]>([])
  const tenantScopeStore = useTenantScopeStore()
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const departmentCount = computed(() => treeUtils.treeToList(tree.value).length)
  let loadController: AbortController | undefined
  onScopeDispose(() => loadController?.abort())

  const load = async (): Promise<void> => {
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    loading.value = true
    error.value = ''
    tree.value = []
    try {
      const departments = await fetchPmisDepartmentTree(undefined, {
        signal: controller.signal,
        showErrorMessage: false
      })
      if (!controller.signal.aborted) tree.value = departments
    } catch {
      if (!controller.signal.aborted) error.value = '部门与产线加载失败，请重试。'
    } finally {
      if (loadController === controller) {
        if (!controller.signal.aborted) loading.value = false
        loadController = undefined
      }
    }
  }
  const clear = (): void => {
    activeId.value = ''
    treeRef.value?.setCurrentKey(undefined)
    emit('change', [], '全部产线')
  }
  const selectNode = (node: TreeNode): void => {
    activeId.value = node.id
    emit(
      'change',
      treeUtils.treeToList([node]).map((item) => String(item.id)),
      node.departmentName
    )
  }
  watch(
    () => tenantScopeStore.revision,
    () => {
      clear()
      void load()
    }
  )
  void load()
</script>

<style scoped lang="scss">
  .pmis-department-navigator {
    height: 100%;

    &__all {
      display: grid;
      flex: none;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--art-space-3);
      align-items: center;
      width: 100%;
      min-height: 48px;
      padding: 0 var(--art-space-3) 0 var(--art-space-4);
      font: inherit;
      color: var(--el-text-color-regular);
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--el-border-radius-base);
      transition:
        color 0.18s ease,
        background-color 0.18s ease;

      > span {
        display: inline-flex;
        gap: var(--art-space-2);
        align-items: center;
      }

      > strong {
        min-width: 24px;
        padding: 1px 6px;
        font-size: 11px;
        text-align: center;
        background: var(--el-fill-color-light);
        border-radius: 999px;
      }

      &:hover,
      &.is-active {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      }

      &.is-active {
        box-shadow: inset 3px 0 0 var(--theme-color);
      }
    }

    &__node {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: center;
      min-width: 0;
      font-size: 13px;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    :deep(.el-tree) {
      width: 100%;
      min-width: 0;
      background: transparent;
    }

    :deep(.el-tree-node),
    :deep(.el-tree-node__children),
    :deep(.el-tree-node__content) {
      min-width: 0;
    }

    :deep(.el-tree-node__content > .pmis-department-navigator__node) {
      flex: 1;
      width: 0;
    }

    :deep(.el-tree-node__content) {
      min-height: 42px;
      margin-bottom: 2px;
      border-radius: var(--el-border-radius-base);
      transition:
        color var(--art-motion-duration-fast) ease,
        background-color var(--art-motion-duration-fast) ease,
        box-shadow var(--art-motion-duration-fast) ease;
    }

    :deep(.el-tree-node__content:hover) {
      background: color-mix(in srgb, var(--theme-color) 7%, transparent);
    }

    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      font-weight: 600;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 11%, var(--default-box-color));
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    :deep(.el-tree-node__content:focus-visible) {
      outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
      outline-offset: -2px;
    }

    // 窄屏堆叠区固定为 300px，错误反馈需在首次呈现时完整露出重试按钮。
    @media (width <= 900px) {
      :deep(.art-section-card__body.art-async-state.is-compact > .art-async-state__result) {
        --el-result-extra-margin-top: var(--art-space-2);

        padding: var(--art-space-2);
      }

      :deep(
        .art-section-card__body.art-async-state.is-compact
          > .art-async-state__result
          .el-result__icon
          svg
      ) {
        width: var(--art-space-5);
        height: var(--art-space-5);
      }
    }
  }
</style>
