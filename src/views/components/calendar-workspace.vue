<template>
  <div class="pmis-calendar art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      :eyebrow="config.eyebrow"
      :title="mode === 'sheet' ? `${kindLabel}表` : `${kindLabel}明细表`"
      :description="
        mode === 'sheet'
          ? `按月查看每台设备每日${kindLabel}状态，未完成与延误在同一矩阵中清晰暴露。`
          : `按设备追溯方案项目每日完成情况，${kindLabel}状态可继续下钻查看任务结果。`
      "
      :icon="mode === 'sheet' ? config.icon : 'ri:table-view'"
      :tags="[
        { label: monthCaption, type: 'primary' },
        { label: departmentLabel, type: 'info' },
        { label: `${overview.overdue} 项延误`, type: overview.overdue ? 'danger' : 'success' }
      ]"
      :metrics="metrics"
    >
      <template #actions>
        <ArtExcelExport
          v-auth="exportPermission"
          :data="exportRows"
          :columns="exportColumns"
          :filename="mode === 'sheet' ? `设备${kindLabel}表` : `${kindLabel}明细表`"
          :sheet-name="monthCaption"
          button-text="导出"
          type="warning"
          :disable-when-empty="false"
          plain
          auto-index
          ><ArtSvgIcon icon="ri:file-excel-2-line" />导出</ArtExcelExport
        >
      </template>
    </BusinessWorkspaceHeader>

    <section class="pmis-calendar__body">
      <ArtWorkspaceSplitter
        primary-size="288px"
        primary-min="248px"
        primary-max="400px"
        :breakpoint="900"
        stacked-primary-size="300px"
      >
        <template #primary>
          <PmisDepartmentNavigator @change="changeDepartments" />
        </template>
        <main class="pmis-calendar__content">
          <ArtSearchBar
            :model-value="query"
            @update:model-value="replaceReactiveModel(query, $event)"
            :items="searchItems"
            :span="mode === 'detail' ? 6 : 8"
            :label-width="64"
            :show-expand="false"
            :is-expand="true"
            :disabled-search="state.loading"
            @search="load"
            @reset="reset"
          />
          <ElAlert
            v-if="mode === 'detail' && equipmentError"
            type="warning"
            :closable="false"
            show-icon
            title="设备筛选暂不可用"
          >
            {{ equipmentError }}
            <ElButton link type="primary" @click="loadEquipmentOptions">重新加载设备</ElButton>
          </ElAlert>
          <ArtSectionCard
            root-class="pmis-calendar__matrix-card"
            :title="mode === 'sheet' ? '设备日历矩阵' : `${kindLabel}项目日历矩阵`"
            :subtitle="matrixSubtitle"
            :loading="state.loading"
            :error="state.error"
            :empty="!state.loading && !state.error && matrixRows.length === 0"
            :empty-title="
              mode === 'detail' && !query.equipmentId
                ? '请先选择设备'
                : `当前范围暂无${kindLabel}任务`
            "
            :empty-description="
              mode === 'detail' && !query.equipmentId
                ? `选择一台设备后查看各${kindLabel}项目的每日完成情况。`
                : `请确认已启用${kindLabel}方案并绑定适用设备。`
            "
            :min-height="0"
            @retry="load"
          >
            <template #actions>
              <div class="pmis-calendar__legend" :aria-label="`${kindLabel}状态图例`">
                <span class="is-completed">{{ completedLabel }}</span>
                <span class="is-review">待确认</span>
                <span class="is-pending">{{ pendingLabel }}</span>
                <span class="is-overdue">延误 / 逾期完成</span>
                <span class="is-exempt">{{ exemptLabel }}</span>
                <span class="is-empty">未安排</span>
              </div>
            </template>
            <ArtTable
              class="pmis-calendar__matrix"
              :data="matrixRows"
              :columns="columns"
              :pagination="false"
              :show-table-header="true"
              max-height="520"
              :empty-text="`暂无${kindLabel}任务`"
            />
          </ArtSectionCard>
        </main>
      </ArtWorkspaceSplitter>
    </section>

    <ArtDrawer ref="drawerRef" :title="`${kindLabel}任务明细`" size="lg">
      <PmisDetailDrawerSections v-if="detailTask">
        <ArtSectionCard title="任务摘要" subtitle="计划、设备与当前执行状态">
          <template #actions>
            <ElButton
              v-if="mode === 'sheet' && detailTask.status === 'pending'"
              v-auth="executePermission"
              type="primary"
              @click="openExecution(detailTask)"
            >
              <ArtSvgIcon icon="ri:play-circle-line" />执行{{ kindLabel }}
            </ElButton>
          </template>
          <ArtDescriptions :columns="2" :data="detailTask" :items="taskDescriptions" />
        </ArtSectionCard>
        <ArtSectionCard
          title="项目结果"
          :subtitle="`已记录 ${detailTask.results.length} 项`"
          :empty="detailTask.results.length === 0"
          empty-description="现场端尚未提交项目结果。"
        >
          <div class="pmis-calendar__results">
            <article v-for="result in detailTask.results" :key="result.id">
              <div
                ><strong>{{ result.item?.itemName || itemNoun }}</strong
                ><small>{{ result.item?.requirement || '—' }}</small></div
              >
              <ArtDictDisplay
                dict-code="pmisResultStatus"
                :value="result.resultStatus"
                display="tag"
              />
            </article>
          </div>
        </ArtSectionCard>
      </PmisDetailDrawerSections>
    </ArtDrawer>
    <PmisTaskExecutionDialog ref="executionRef" @success="handleExecutionSuccess" />
  </div>
</template>

<script setup lang="tsx">
  import { replaceReactiveModel } from '@/utils/form/model'
  import dayjs from 'dayjs'
  import { isEqual } from 'lodash-es'
  import ArtTooltip from '@/components/core/feedback/art-tooltip/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtExcelExport from '@/components/core/forms/art-excel-export/index.vue'
  import ArtSearchBar, {
    type SearchFormItem
  } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    fetchPmisEquipmentSnapshot,
    fetchPmisTaskSnapshot,
    summarizePmisTasks,
    type PmisEquipmentOption,
    type PmisPlanItem,
    type PmisTask,
    type PmisTaskStatus,
    type PmisPlanKind
  } from '@pmis/api'
  import PmisDepartmentNavigator from './department-navigator.vue'
  import PmisTaskExecutionDialog, {
    type PmisTaskExecutionDialogOpenData
  } from './task-execution-dialog.vue'
  import { pmisKindConfig } from './business-config'
  import { resolvePmisCalendarPermissions } from './business-permissions'
  import PmisDetailDrawerSections from './detail-drawer-sections.vue'

  const props = withDefaults(defineProps<{ mode: 'sheet' | 'detail'; kind?: PmisPlanKind }>(), {
    kind: 'inspection'
  })
  const config = computed(() => pmisKindConfig(props.kind))
  const kindLabel = computed(() => config.value.label)
  const isInspectionKind = computed(() => ['inspection', 'patrol'].includes(props.kind))
  const completedLabel = computed(() => (isInspectionKind.value ? '已检' : '已完成'))
  const pendingLabel = computed(() => (isInspectionKind.value ? '未检' : '未完成'))
  const exemptLabel = computed(() => (isInspectionKind.value ? '免检' : '免执行'))
  const itemNoun = computed(() => (isInspectionKind.value ? '检查项目' : '作业项目'))
  const { hasAuth } = useAuth()
  interface CalendarQuery {
    month: string
    equipmentId: string
    shiftName: string
  }
  interface MatrixRow {
    id: string
    identity: string
    secondary: string
    tasksByDate: Record<string, PmisTask | undefined>
    item?: PmisPlanItem
  }
  const initialQuery = (): CalendarQuery => ({
    month: dayjs().format('YYYY-MM'),
    equipmentId: '',
    shiftName: ''
  })
  const query = reactive<CalendarQuery>(initialQuery())
  const tenantScopeStore = useTenantScopeStore()
  const state = reactive<{ loading: boolean; error: string; tasks: PmisTask[] }>({
    loading: false,
    error: '',
    tasks: []
  })
  const equipmentOptions = shallowRef<PmisEquipmentOption[]>([])
  const equipmentError = ref('')
  const departmentIds = ref<string[]>([])
  const departmentLabel = ref('全部产线')
  const drawerRef = ref<ArtDrawerExpose<PmisTask>>()
  const executionRef = ref<{
    handleOpen: (data: PmisTaskExecutionDialogOpenData) => Promise<void>
  }>()
  const detailTask = shallowRef<PmisTask>()
  const permissions = computed(() => resolvePmisCalendarPermissions(props.kind, props.mode))
  const exportPermission = computed(() => permissions.value.export)
  const viewPermission = computed(() => permissions.value.view)
  const executePermission = computed(() => permissions.value.execute ?? '')
  const monthCaption = computed(() => dayjs(`${query.month}-01`).format('YYYY年MM月'))
  const monthStart = computed(() => dayjs(`${query.month}-01`).startOf('month'))
  const monthEnd = computed(() => monthStart.value.endOf('month'))
  const days = computed(() =>
    Array.from({ length: monthEnd.value.date() }, (_, index) =>
      monthStart.value.date(index + 1).format('YYYY-MM-DD')
    )
  )
  const overview = computed(() => summarizePmisTasks(state.tasks))
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '计划任务',
      value: overview.value.total,
      description: monthCaption.value,
      icon: 'ri:calendar-line'
    },
    {
      label: completedLabel.value,
      value: overview.value.completed,
      description: `完成率 ${overview.value.completionRate}%`,
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: pendingLabel.value,
      value: overview.value.pending,
      description: '尚未到期',
      icon: 'ri:time-line',
      tone: 'warning'
    },
    {
      label: '延误',
      value: overview.value.overdue,
      description: isInspectionKind.value ? '需优先补检' : '需优先处理',
      icon: 'ri:alarm-warning-line',
      tone: overview.value.overdue ? 'danger' : 'info'
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '月份',
      key: 'month',
      type: 'date',
      props: { type: 'month', valueFormat: 'YYYY-MM', clearable: false, placeholder: '选择月份' }
    },
    ...(props.mode === 'detail'
      ? [
          {
            label: '设备',
            key: 'equipmentId',
            type: 'select',
            props: {
              filterable: true,
              clearable: true,
              placeholder: '选择设备',
              options: equipmentOptions.value.map((item) => ({
                label: `${item.equipmentName} · ${item.equipmentCode}`,
                value: item.id
              }))
            }
          } as SearchFormItem
        ]
      : []),
    {
      label: '班次',
      key: 'shiftName',
      type: 'input',
      props: { clearable: true, placeholder: '全部班次' }
    }
  ])
  const statusWeight: Record<PmisTaskStatus, number> = {
    overdue: 4,
    completed_overdue: 3,
    pending: 3,
    pending_confirm: 3,
    completed: 2,
    exempt: 1
  }
  const pickTask = (tasks: PmisTask[]): PmisTask | undefined =>
    [...tasks].sort(
      (left, right) => statusWeight[right.displayStatus] - statusWeight[left.displayStatus]
    )[0]
  const matrixRows = computed<MatrixRow[]>(() => {
    const filtered = query.equipmentId
      ? state.tasks.filter((task) => task.equipment.id === query.equipmentId)
      : state.tasks
    if (props.mode === 'sheet') {
      const equipment = new Map<string, PmisTask[]>()
      filtered.forEach((task) =>
        equipment.set(task.equipment.id, [...(equipment.get(task.equipment.id) ?? []), task])
      )
      return [...equipment.entries()].map(([id, tasks]) => ({
        id,
        identity: tasks[0].equipment.equipmentName,
        secondary: tasks[0].equipment.equipmentCode,
        tasksByDate: Object.fromEntries(
          days.value.map((date) => [
            date,
            pickTask(tasks.filter((task) => task.plannedDate === date))
          ])
        )
      }))
    }
    if (!query.equipmentId) return []
    const items = new Map<string, { item: PmisPlanItem; tasks: PmisTask[] }>()
    filtered.forEach((task) =>
      task.plan.items.forEach((item) => {
        const key = item.id || `${task.plan.id}-${item.sort}`
        const current = items.get(key) ?? { item, tasks: [] }
        current.tasks.push(task)
        items.set(key, current)
      })
    )
    return [...items.entries()].map(([id, value]) => ({
      id,
      item: value.item,
      identity: value.item.itemName,
      secondary: `${value.item.requirement}（${filtered.find((task) => task.plan.items.some((item) => item.id === value.item.id))?.plan.planName || `${kindLabel.value}方案`}）`,
      tasksByDate: Object.fromEntries(
        days.value.map((date) => [
          date,
          pickTask(value.tasks.filter((task) => task.plannedDate === date))
        ])
      )
    }))
  })
  const showTask = async (task?: PmisTask): Promise<void> => {
    if (!task || !hasAuth(viewPermission.value)) return
    detailTask.value = task
    await nextTick()
    await drawerRef.value?.handleOpen(task, {
      showFooter: false,
      contentHeight: 'calc(100vh - 90px)'
    })
  }
  const openExecution = (value: PmisTask): void =>
    void executionRef.value?.handleOpen({ task: value })
  const handleExecutionSuccess = (): void => {
    drawerRef.value?.handleClose()
    void load()
  }
  const statusLabel = (status: PmisTaskStatus): string => {
    const labels: Record<PmisTaskStatus, string> = {
      pending: pendingLabel.value,
      pending_confirm: '待确认',
      completed: completedLabel.value,
      completed_overdue: '逾期完成',
      exempt: exemptLabel.value,
      overdue: '已延误'
    }
    return labels[status]
  }
  const statusMark = (status: PmisTaskStatus): string => {
    if (status === 'completed' || status === 'completed_overdue') return '✓'
    if (status === 'pending_confirm') return '待'
    if (status === 'overdue') return '!'
    return status === 'exempt' ? '免' : '•'
  }
  const statusTooltip = (task: PmisTask, actionable: boolean): string =>
    `${dayjs(task.plannedDate).format('YYYY年MM月DD日')} · ${statusLabel(task.displayStatus)}${
      actionable ? ' · 点击查看任务明细' : ''
    }`
  const cell = (task?: PmisTask) =>
    task && hasAuth(viewPermission.value) ? (
      <ArtTooltip
        content={statusTooltip(task, true)}
        placement="top"
        showAfter={180}
        hideAfter={80}
      >
        <button
          type="button"
          class={['pmis-calendar__status', `is-${task.displayStatus}`]}
          aria-label={`${task.plannedDate} ${statusLabel(task.displayStatus)}，查看明细`}
          onClick={() => void showTask(task)}
        >
          {statusMark(task.displayStatus)}
        </button>
      </ArtTooltip>
    ) : task ? (
      <ArtTooltip
        content={statusTooltip(task, false)}
        placement="top"
        showAfter={180}
        hideAfter={80}
      >
        <span
          class={['pmis-calendar__status', 'is-readonly', `is-${task.displayStatus}`]}
          aria-label={`${task.plannedDate} ${statusLabel(task.displayStatus)}`}
        >
          {statusMark(task.displayStatus)}
        </span>
      </ArtTooltip>
    ) : (
      <span class="pmis-calendar__empty-cell">—</span>
    )
  const columns = computed<ColumnOption<MatrixRow>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 66, fixed: 'left' },
    {
      prop: 'identity',
      label: props.mode === 'sheet' ? '设备' : `${kindLabel.value}项目`,
      minWidth: props.mode === 'sheet' ? 220 : 280,
      fixed: 'left',
      formatter: (row) => (
        <div class="pmis-calendar__identity">
          <span class="pmis-calendar__identity-icon">
            <ArtSvgIcon icon={props.mode === 'sheet' ? 'ri:dashboard-3-line' : config.value.icon} />
          </span>
          <span class="pmis-calendar__identity-copy">
            <strong title={row.identity}>{row.identity}</strong>
            <small title={row.secondary}>{row.secondary}</small>
          </span>
        </div>
      )
    },
    ...days.value.map((date): ColumnOption<MatrixRow> => ({
      prop: date,
      label: dayjs(date).format('DD'),
      width: 52,
      align: 'center',
      className: 'pmis-calendar__day-cell',
      showOverflowTooltip: false,
      formatter: (row) => cell(row.tasksByDate[date])
    }))
  ])
  const matrixSubtitle = computed(
    () => `${monthCaption.value} · ${departmentLabel.value} · 单击状态单元格查看任务明细`
  )
  let loadVersion = 0
  const load = async (): Promise<void> => {
    const version = ++loadVersion
    state.loading = true
    state.error = ''
    try {
      let tasks = await fetchPmisTaskSnapshot(props.kind, {
        dateFrom: monthStart.value.format('YYYY-MM-DD'),
        dateTo: monthEnd.value.format('YYYY-MM-DD'),
        departmentIds: departmentIds.value,
        equipmentId: query.equipmentId || undefined
      })
      if (query.shiftName) tasks = tasks.filter((task) => task.shiftName === query.shiftName)
      if (version === loadVersion) state.tasks = tasks
    } catch {
      if (version === loadVersion) state.error = `${kindLabel.value}日历加载失败，请重试。`
    } finally {
      if (version === loadVersion) state.loading = false
    }
  }
  const changeDepartments = (ids: string[], label: string): void => {
    if (departmentLabel.value === label && isEqual(departmentIds.value, ids)) return
    departmentIds.value = ids
    departmentLabel.value = label
    void load()
  }
  const reset = (): void => {
    Object.assign(query, initialQuery())
    void load()
  }
  const exportRows = computed(() =>
    matrixRows.value.map((row) => ({
      identity: row.identity,
      secondary: row.secondary,
      ...Object.fromEntries(
        days.value.map((date) => [
          dayjs(date).format('MM-DD'),
          row.tasksByDate[date] ? statusLabel(row.tasksByDate[date].displayStatus) : '未安排'
        ])
      )
    }))
  )
  const exportColumns = computed(() => ({
    identity: { title: props.mode === 'sheet' ? '设备名称' : `${kindLabel.value}项目`, width: 24 },
    secondary: { title: props.mode === 'sheet' ? '设备编号' : `${kindLabel.value}要求`, width: 32 },
    ...Object.fromEntries(
      days.value.map((date) => [
        dayjs(date).format('MM-DD'),
        { title: dayjs(date).format('MM-DD') }
      ])
    )
  }))
  const taskDescriptions = computed(() =>
    detailTask.value
      ? [
          { key: 'taskNo', label: '任务单号', value: detailTask.value.taskNo },
          {
            key: 'status',
            label: `${kindLabel.value}状态`,
            value: detailTask.value.displayStatus,
            dictCode: 'pmisTaskStatus'
          },
          {
            key: 'equipment',
            label: '设备',
            value: `${detailTask.value.equipment.equipmentName} · ${detailTask.value.equipment.equipmentCode}`
          },
          {
            key: 'department',
            label: '部门 / 产线',
            value: detailTask.value.equipment.department?.departmentName || '待分配'
          },
          { key: 'plan', label: `${kindLabel.value}方案`, value: detailTask.value.plan.planName },
          { key: 'date', label: '计划日期', value: detailTask.value.plannedDate }
        ]
      : []
  )
  let equipmentLoadVersion = 0
  const loadEquipmentOptions = async (): Promise<void> => {
    const version = ++equipmentLoadVersion
    equipmentOptions.value = []
    equipmentError.value = ''
    try {
      const result = await fetchPmisEquipmentSnapshot({}, { showErrorMessage: false })
      if (version === equipmentLoadVersion) equipmentOptions.value = result
    } catch {
      if (version === equipmentLoadVersion)
        equipmentError.value = '设备列表加载失败；任务日历仍可查看。'
    }
  }
  void useUserStore().ensureDictLoaded('pmisResultStatus')
  watch(
    () => tenantScopeStore.revision,
    () => {
      departmentIds.value = []
      departmentLabel.value = '全部产线'
      query.equipmentId = ''
      state.tasks = []
      if (props.mode === 'detail') void loadEquipmentOptions()
      void load()
    },
    // Clear the parent filter before the navigator emits its own scope-reset event.
    { flush: 'sync' }
  )
  if (props.mode === 'detail') void loadEquipmentOptions()
  void load()
</script>

<style scoped lang="scss">
  .pmis-calendar {
    &__body {
      display: flex;
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    &__content {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      gap: var(--art-space-3);
      width: 100%;
      min-width: 0;
      max-width: 100%;
      min-height: 0;
      overflow: hidden;
    }

    &__matrix-card {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      min-width: 0;
      min-height: 300px;
      overflow: hidden;

      :deep(.art-section-card__body) {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        min-height: 0 !important;
      }

      :deep(.art-section-card__header) {
        gap: var(--art-space-4);
        align-items: center;
        padding-bottom: var(--art-space-3);
        margin-bottom: 0;
        border-bottom: 1px solid var(--el-border-color-lighter);
      }

      @media (width <= 1100px) {
        :deep(.art-section-card__identity) {
          flex-basis: 100%;
        }

        :deep(.art-section-card__actions) {
          margin-left: 0;
        }
      }

      :deep(.art-async-state__empty) {
        flex: 1 1 auto;
        align-content: center;
        min-height: 0;
        padding-top: clamp(28px, 5vh, 56px);
        padding-bottom: clamp(56px, 10vh, 112px);
      }
    }

    &__legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      align-items: center;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__legend span {
      display: inline-flex;
      gap: 5px;
      align-items: center;
    }

    &__legend span::before {
      width: 9px;
      height: 9px;
      content: '';
      background: var(--art-gray-200);
      border-radius: 50%;
    }

    &__legend .is-completed::before {
      background: var(--el-color-success);
    }

    &__legend .is-pending::before {
      background: var(--el-color-warning);
    }

    &__legend .is-review::before {
      background: var(--theme-color);
    }

    &__legend .is-overdue::before {
      background: var(--el-color-danger);
    }

    &__legend .is-exempt::before {
      background: var(--el-text-color-placeholder);
    }

    &__legend .is-empty::before {
      background: transparent;
      border: 1px solid var(--el-border-color);
    }

    &__matrix {
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;

      :deep(.el-table) {
        margin-top: var(--art-space-3);
      }

      :deep(.el-table__header-wrapper th.el-table__cell) {
        height: 44px;
        font-variant-numeric: tabular-nums;
      }

      :deep(.el-table__row td.el-table__cell) {
        height: 52px;
      }

      :deep(.el-table__fixed),
      :deep(.el-table__fixed-right) {
        box-shadow: 8px 0 18px rgb(15 23 42 / 5%);
      }

      :deep(.el-scrollbar__bar.is-horizontal) {
        height: 8px;
      }
    }

    :deep(.pmis-calendar__identity) {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      min-width: 0;
    }

    :deep(.pmis-calendar__identity-icon) {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    :deep(.pmis-calendar__identity-copy) {
      display: grid;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.pmis-calendar__status) {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid transparent;
      border-radius: 50%;
      transition:
        color var(--art-motion-duration-fast) ease,
        background-color var(--art-motion-duration-fast) ease,
        border-color var(--art-motion-duration-fast) ease,
        transform var(--art-motion-duration-fast) ease;
    }

    :deep(.pmis-calendar__day-cell .cell) {
      display: grid;
      place-items: center;
      padding: 0 6px;
      overflow: visible;
      text-overflow: clip;
    }

    :deep(.pmis-calendar__status:not(.is-readonly):hover) {
      transform: translateY(-1px) scale(1.06);
    }

    :deep(.pmis-calendar__status.is-completed) {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
      border-color: var(--el-color-success-light-7);
    }

    :deep(.pmis-calendar__status.is-pending) {
      color: var(--el-color-warning);
      background: var(--el-color-warning-light-9);
      border-color: var(--el-color-warning-light-7);
    }

    :deep(.pmis-calendar__status.is-pending_confirm) {
      font-size: 11px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-color: color-mix(in srgb, var(--theme-color) 24%, var(--el-border-color));
    }

    :deep(.pmis-calendar__status.is-overdue) {
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
      border-color: var(--el-color-danger-light-7);
    }

    :deep(.pmis-calendar__status.is-completed_overdue) {
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
      border-color: var(--el-color-danger-light-7);
    }

    :deep(.pmis-calendar__status.is-exempt) {
      color: var(--el-text-color-secondary);
      background: var(--art-gray-100);
      border-color: var(--el-border-color);
    }

    :deep(.pmis-calendar__status:focus-visible) {
      outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
      outline-offset: 2px;
    }

    :deep(.pmis-calendar__status.is-readonly) {
      cursor: default;
    }

    :deep(.pmis-calendar__empty-cell) {
      color: var(--el-text-color-placeholder);
    }

    &__results {
      display: grid;
    }

    &__results article {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px 0;
    }

    &__results article + article {
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__results strong,
    &__results small {
      display: block;
    }

    &__results small {
      margin-top: 3px;
      color: var(--el-text-color-secondary);
    }

    @media (width <= 1120px) {
      &__matrix-card :deep(.art-section-card__header) {
        align-items: flex-start;
      }

      &__legend {
        justify-content: flex-end;
      }
    }

    @media (width <= 720px) {
      &__legend {
        justify-content: flex-start;
      }
    }
  }
</style>
