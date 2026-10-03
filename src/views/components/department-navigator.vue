<template>
  <aside class="pmis-department-navigator art-card-xs" aria-label="部门与产线范围">
    <header>
      <div>
        <span>PRODUCTION SCOPE</span>
        <strong>部门 / 产线</strong>
        <small>上级节点包含全部下级设备</small>
      </div>
      <ArtIconButton
        icon="ri:filter-off-line"
        label="清除部门与产线筛选"
        :disabled="!activeId"
        @click="clear"
      />
    </header>

    <button
      type="button"
      class="pmis-department-navigator__all"
      :class="{ 'is-active': !activeId }"
      @click="clear"
    >
      <span><ArtSvgIcon icon="ri:apps-2-line" />全部产线</span>
      <strong>{{ departmentCount }}</strong>
    </button>

    <ArtAsyncState
      :loading="loading"
      :error="error"
      error-title="生产组织加载失败"
      :empty="!loading && !error && tree.length === 0"
      empty-text="暂无部门或产线"
      empty-description="请先在生产主数据中维护部门与产线。"
      :empty-image-size="68"
      :min-height="180"
      size="compact"
      full-height
      class="pmis-department-navigator__state"
      @retry="load"
    >
      <ElScrollbar class="pmis-department-navigator__scroll">
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
              <ArtSvgIcon
                :icon="data.children?.length ? 'ri:building-2-line' : 'ri:git-branch-line'"
              />
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
      </ElScrollbar>
    </ArtAsyncState>
  </aside>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { ElTree } from 'element-plus'
  import TreeUtils from '@/utils/tree'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
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
  let loadVersion = 0

  const load = async (): Promise<void> => {
    const version = ++loadVersion
    loading.value = true
    error.value = ''
    tree.value = []
    try {
      const departments = await fetchPmisDepartmentTree()
      if (version === loadVersion) tree.value = departments
    } catch {
      if (version === loadVersion) error.value = '部门与产线加载失败，请重试。'
    } finally {
      if (version === loadVersion) loading.value = false
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
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--art-space-4);
    overflow: hidden;
    isolation: isolate;

    > header {
      display: flex;
      gap: var(--art-space-2);
      align-items: flex-start;
      justify-content: space-between;

      > div {
        min-width: 0;

        > span,
        strong,
        small {
          display: block;
        }

        > span {
          margin-bottom: 2px;
          font-size: 9px;
          font-weight: 700;
          color: var(--theme-color);
          letter-spacing: 0.08em;
        }

        strong {
          font-size: 16px;
          line-height: 24px;
        }

        small {
          margin-top: 2px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

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

    &__state {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    &__scroll {
      height: 100%;
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
  }
</style>
