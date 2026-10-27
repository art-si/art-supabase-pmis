<template>
  <div class="pmis-dashboard art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="SHOPFLOOR VISIBILITY"
      title="设备点检看板"
      description="面向车间现场集中展示当日设备点检状态，延误与未检设备始终优先排列。"
      icon="ri:dashboard-3-line"
      :tags="[
        { label: dayjs().format('YYYY年MM月DD日'), type: 'primary' },
        { label: `自动刷新 ${refreshMinutes} 分钟`, type: 'info' }
      ]"
      :metrics="metrics"
      refreshable
      :refresh-loading="state.loading"
      refresh-label="刷新看板数据"
      @refresh="load"
    >
      <template #actions>
        <ElButton type="primary" plain @click="openSettings">
          <ArtSvgIcon icon="ri:settings-3-line" />看板设置
        </ElButton>
      </template>
    </BusinessWorkspaceHeader>

    <ArtSectionCard
      :show-scrollbar="false"
      class="pmis-dashboard__surface"
      title="当日点检状态"
      :subtitle="`共 ${filteredTasks.length} 台次 · ${filterCaption}`"
      :loading="state.loading"
      :error="state.error"
      :empty="!state.loading && !state.error && filteredTasks.length === 0"
      empty-title="当日暂无点检任务"
      empty-description="启用点检方案并绑定设备后，当日任务会自动出现在看板。"
      @retry="load"
    >
      <template #actions>
        <div class="pmis-dashboard__filters">
          <ElTreeSelect
            v-model="filters.departmentId"
            :data="departments"
            node-key="id"
            :props="{ label: 'departmentName', children: 'children' }"
            clearable
            filterable
            check-strictly
            default-expand-all
            placeholder="全部产线"
            aria-label="筛选部门或产线"
          />
          <ElSelect
            v-model="filters.equipmentId"
            clearable
            filterable
            placeholder="全部设备"
            aria-label="筛选设备"
          >
            <ElOption
              v-for="item in equipment"
              :key="item.id"
              :label="`${item.equipmentName} · ${item.equipmentCode}`"
              :value="item.id"
            />
          </ElSelect>
          <ElSelect
            v-model="filters.status"
            clearable
            placeholder="全部状态"
            aria-label="筛选点检状态"
          >
            <ElOption
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label || item.name"
              :value="item.value"
            />
          </ElSelect>
        </div>
      </template>
      <ElScrollbar class="pmis-dashboard__scroll">
        <div class="pmis-dashboard__grid">
          <article v-for="task in filteredTasks" :key="task.id" :class="`is-${task.displayStatus}`">
            <div class="pmis-dashboard__tile-head">
              <span><ArtSvgIcon icon="ri:tools-line" /></span>
              <ArtDictDisplay
                dict-code="pmisTaskStatus"
                :value="task.displayStatus"
                display="tag"
              />
            </div>
            <strong>{{ task.equipment.equipmentName }}</strong>
            <small
              >{{ task.equipment.equipmentCode }} ·
              {{ task.equipment.department?.departmentName || '待分配产线' }}</small
            >
            <div class="pmis-dashboard__tile-meta">
              <span>{{ task.plan.planName }}</span
              ><span>{{ task.shiftName || '默认班次' }}</span>
            </div>
            <button
              v-auth="'PmisInspectionDashboard:ViewDetail'"
              type="button"
              @click="showDetail(task)"
              >查看点检明细<ArtSvgIcon icon="ri:arrow-right-line"
            /></button>
          </article>
        </div>
      </ElScrollbar>
    </ArtSectionCard>

    <ArtDrawer ref="drawerRef" title="设备点检详情" size="lg">
      <PmisDetailDrawerSections v-if="detailTask">
        <ArtSectionCard title="点检任务" subtitle="当日设备任务与执行结果">
          <ArtDescriptions :columns="2" :data="detailTask" :items="taskDescriptions" />
        </ArtSectionCard>
      </PmisDetailDrawerSections>
    </ArtDrawer>

    <ArtDialog ref="settingsRef" size="sm" content-max-height="440px">
      <div class="pmis-dashboard__settings">
        <div class="pmis-dashboard__settings-intro">
          <span aria-hidden="true"><ArtSvgIcon icon="ri:dashboard-3-line" /></span>
          <div>
            <strong>展示节奏</strong>
            <p>调整数据刷新频率与设备卡片密度，仅影响当前登录会话。</p>
          </div>
        </div>
        <ArtForm
          :model-value="settings"
          @update:model-value="replaceReactiveModel(settings, $event)"
          :items="settingsItems"
          :span="12"
          :show-reset="false"
          :show-submit="false"
          label-position="top"
        />
      </div>
    </ArtDialog>
  </div>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import dayjs from 'dayjs'
  import { useIntervalFn } from '@vueuse/core'
  import TreeUtils from '@/utils/tree'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import PmisDetailDrawerSections from './detail-drawer-sections.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    fetchPmisDepartmentTree,
    fetchPmisEquipmentOptions,
    fetchPmisTaskSnapshot,
    summarizePmisTasks,
    type PmisDepartmentTreeOption,
    type PmisEquipmentOption,
    type PmisTask,
    type PmisTaskStatus
  } from '@pmis/api'

  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { getDictMap } = storeToRefs(userStore)
  const drawerRef = ref<ArtDrawerExpose<PmisTask>>()
  const settingsRef = ref<ArtDialogExpose>()
  const detailTask = shallowRef<PmisTask>()
  const departments = shallowRef<PmisDepartmentTreeOption[]>([])
  const equipment = shallowRef<PmisEquipmentOption[]>([])
  const state = reactive<{ loading: boolean; error: string; tasks: PmisTask[] }>({
    loading: false,
    error: '',
    tasks: []
  })
  const filters = reactive<{
    departmentId: string
    equipmentId: string
    status: PmisTaskStatus | ''
  }>({ departmentId: '', equipmentId: '', status: '' })
  const settings = reactive({ refreshMinutes: 5, columns: 4 })
  const refreshMinutes = computed(() => settings.refreshMinutes)
  const statusOptions = computed(() => getDictMap.value.pmisTaskStatus ?? [])
  const departmentTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  const selectedDepartmentIds = computed(() =>
    filters.departmentId
      ? departmentTreeUtils
          .getDescendants(departments.value, filters.departmentId, true)
          .map((item) => String(item.id))
      : []
  )
  const statusRank: Record<PmisTaskStatus, number> = {
    overdue: 4,
    completed_overdue: 3,
    pending: 3,
    pending_confirm: 3,
    completed: 2,
    exempt: 1
  }
  const filteredTasks = computed(() =>
    state.tasks
      .filter(
        (task) =>
          !filters.departmentId ||
          selectedDepartmentIds.value.includes(task.equipment.productionDepartmentId || '')
      )
      .filter((task) => !filters.equipmentId || task.equipment.id === filters.equipmentId)
      .filter((task) => !filters.status || task.displayStatus === filters.status)
      .sort((left, right) => statusRank[right.displayStatus] - statusRank[left.displayStatus])
  )
  const overview = computed(() => summarizePmisTasks(filteredTasks.value))
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当日任务',
      value: overview.value.total,
      description: '当前筛选范围',
      icon: 'ri:calendar-check-line'
    },
    {
      label: '已检',
      value: overview.value.completed,
      description: `完成率 ${overview.value.completionRate}%`,
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '未检',
      value: overview.value.pending,
      description: '等待现场执行',
      icon: 'ri:time-line',
      tone: 'warning'
    },
    {
      label: '延误',
      value: overview.value.overdue,
      description: '优先补检',
      icon: 'ri:alarm-warning-line',
      tone: overview.value.overdue ? 'danger' : 'info'
    }
  ])
  const filterCaption = computed(
    () =>
      [
        departmentTreeUtils.findNode(departments.value, filters.departmentId)?.departmentName,
        equipment.value.find((item) => item.id === filters.equipmentId)?.equipmentName,
        statusOptions.value.find((item) => item.value === filters.status)?.label
      ]
        .filter(Boolean)
        .join(' · ') || '全部设备'
  )
  let loadVersion = 0
  const load = async (): Promise<void> => {
    const version = ++loadVersion
    state.loading = true
    state.error = ''
    try {
      const tasks = await fetchPmisTaskSnapshot('inspection', {
        dateFrom: dayjs().format('YYYY-MM-DD'),
        dateTo: dayjs().format('YYYY-MM-DD')
      })
      if (version === loadVersion) state.tasks = tasks
    } catch {
      if (version === loadVersion) state.error = '点检看板加载失败，请重试。'
    } finally {
      if (version === loadVersion) state.loading = false
    }
  }
  const showDetail = async (task: PmisTask): Promise<void> => {
    detailTask.value = task
    await nextTick()
    await drawerRef.value?.handleOpen(task, {
      showFooter: false,
      contentHeight: 'calc(100vh - 90px)'
    })
  }
  const settingsItems: FormItem[] = [
    {
      label: '自动刷新间隔（分钟）',
      key: 'refreshMinutes',
      type: 'number',
      span: 12,
      props: { min: 1, max: 60, precision: 0, class: '!w-full' }
    },
    {
      label: '每行展示设备数',
      key: 'columns',
      type: 'number',
      span: 12,
      props: { min: 2, max: 6, precision: 0, class: '!w-full' }
    }
  ]
  const openSettings = (): void =>
    void settingsRef.value?.handleOpen(undefined, {
      title: '点检看板设置',
      subtitle: '设置仅在当前登录会话内生效',
      confirmText: '应用设置',
      onConfirm: () => true
    })
  const taskDescriptions = computed(() =>
    detailTask.value
      ? [
          {
            key: 'equipment',
            label: '设备',
            value: `${detailTask.value.equipment.equipmentName} · ${detailTask.value.equipment.equipmentCode}`
          },
          {
            key: 'status',
            label: '点检状态',
            value: detailTask.value.displayStatus,
            dictCode: 'pmisTaskStatus'
          },
          {
            key: 'department',
            label: '部门 / 产线',
            value: detailTask.value.equipment.department?.departmentName || '待分配'
          },
          { key: 'plan', label: '点检方案', value: detailTask.value.plan.planName },
          { key: 'taskNo', label: '任务单号', value: detailTask.value.taskNo },
          {
            key: 'responsible',
            label: '负责人',
            value: detailTask.value.responsible?.employeeName || '—'
          }
        ]
      : []
  )
  const { pause, resume } = useIntervalFn(
    () => void load(),
    computed(() => refreshMinutes.value * 60_000)
  )
  watch(refreshMinutes, () => {
    pause()
    resume()
  })
  let scopeLoadVersion = 0
  const loadScopeResources = async (): Promise<void> => {
    const version = ++scopeLoadVersion
    ++loadVersion
    filters.departmentId = ''
    filters.equipmentId = ''
    departments.value = []
    equipment.value = []
    state.tasks = []
    void load()
    const [departmentResult, equipmentResult] = await Promise.allSettled([
      fetchPmisDepartmentTree(),
      fetchPmisEquipmentOptions({ current: 1, size: 500 })
    ])
    if (version !== scopeLoadVersion) return
    if (departmentResult.status === 'fulfilled') departments.value = departmentResult.value
    if (equipmentResult.status === 'fulfilled') equipment.value = equipmentResult.value.data
  }
  void userStore.ensureDictLoaded('pmisTaskStatus')
  watch(
    () => tenantScopeStore.revision,
    () => void loadScopeResources()
  )
  void loadScopeResources()
</script>

<style scoped lang="scss">
  .pmis-dashboard {
    --pmis-dashboard-columns: v-bind('settings.columns');

    &__surface {
      flex: 1;
      min-height: 0;
    }

    &__filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    &__filters .el-select {
      width: 168px;
    }

    &__settings {
      display: grid;
      gap: var(--art-space-4);
    }

    &__settings-intro {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      padding: var(--art-space-3);
      background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
      border-radius: var(--custom-radius);

      > span {
        display: grid;
        flex: 0 0 40px;
        place-items: center;
        width: 40px;
        height: 40px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
        border-radius: var(--el-border-radius-base);
      }

      strong,
      p {
        display: block;
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__scroll {
      height: clamp(420px, calc(100vh - 356px), 760px);
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(var(--pmis-dashboard-columns), minmax(210px, 1fr));
      gap: 14px;
      padding: 2px;
    }

    &__grid article {
      display: grid;
      gap: 10px;
      min-width: 0;
      padding: 16px;
      background: color-mix(in srgb, var(--art-gray-100) 60%, var(--default-box-color));
      border: 1px solid var(--el-border-color-lighter);
      border-top: 3px solid var(--el-text-color-placeholder);
      border-radius: var(--custom-radius);
    }

    &__grid article.is-completed {
      border-top-color: var(--el-color-success);
    }

    &__grid article.is-pending {
      border-top-color: var(--el-color-warning);
    }

    &__grid article.is-overdue {
      border-top-color: var(--el-color-danger);
    }

    &__tile-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__tile-head > span {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    &__grid article > strong {
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 16px;
      white-space: nowrap;
    }

    &__grid article > small {
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__tile-meta {
      display: flex;
      gap: 8px;
      justify-content: space-between;
      padding-top: 10px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__grid article > button {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      justify-content: flex-end;
      padding: 6px 0 0;
      font: inherit;
      font-size: 12px;
      color: var(--theme-color);
      cursor: pointer;
      background: transparent;
      border: 0;
    }

    &__grid article > button:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
      outline-offset: 2px;
    }
  }

  @media (width <= 1180px) {
    .pmis-dashboard__grid {
      grid-template-columns: repeat(3, minmax(210px, 1fr));
    }
  }

  @media (width <= 820px) {
    .pmis-dashboard__grid {
      grid-template-columns: repeat(2, minmax(210px, 1fr));
    }
  }
</style>
