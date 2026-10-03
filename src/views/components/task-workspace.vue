<template>
  <div class="pmis-task-workspace art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      :eyebrow="`${config.eyebrow} · TASK CONTROL`"
      :title="title"
      :description="description"
      :icon="config.icon"
      :tags="[
        { label: '设备主档联动', type: 'primary' },
        { label: '状态可追溯', type: 'success' },
        { label: '异常优先', type: overdueCount ? 'danger' : 'info' }
      ]"
      :metrics="metrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableRef" />
      </template>
    </BusinessWorkspaceHeader>

    <section class="pmis-task-workspace__body">
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
        <main class="pmis-task-workspace__results">
          <ArtTableQuery
            ref="tableRef"
            v-model="searchModel"
            :api-fn="fetchData"
            :columns-factory="columnsFactory"
            :search-items="searchItems"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :excel-columns="excelColumns"
            :search-bar-props="{ span: 8, labelPosition: 'top', showExpand: false, isExpand: true }"
            :table-props="{ rowKey: 'id', tableLayout: 'fixed' }"
            :empty-config="{
              title: `暂无${kindLabel}任务`,
              description: `启用${kindLabel}方案并绑定设备后，系统会自动生成未来任务。`
            }"
            focusable
            focus-scope-selector=".pmis-task-workspace__body"
            show-focus-mode
          />
        </main>
      </ArtWorkspaceSplitter>
    </section>

    <ArtDrawer ref="drawerRef" :title="`${kindLabel}任务详情`" size="lg">
      <PmisDetailDrawerSections v-if="detailRow">
        <ArtSectionCard title="任务摘要" subtitle="计划、设备与执行状态">
          <ArtDescriptions :columns="2" :data="detailRow" :items="taskDescriptions" />
        </ArtSectionCard>
        <ArtSectionCard
          title="检查结果"
          :subtitle="`已记录 ${detailRow.results.length} 个结果`"
          :empty="detailRow.results.length === 0"
          empty-title="尚未提交检查结果"
          empty-description="任务完成后，现场端提交的项目结果会在这里按顺序展示。"
        >
          <div class="pmis-task-workspace__result-list">
            <article v-for="result in detailRow.results" :key="result.id">
              <span :class="`is-${result.resultStatus}`">
                <ArtSvgIcon
                  :icon="
                    result.resultStatus === 'ok'
                      ? 'ri:checkbox-circle-line'
                      : result.resultStatus === 'ng'
                        ? 'ri:close-circle-line'
                        : 'ri:subtract-line'
                  "
                />
              </span>
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
    <PmisTaskEditorDialog ref="editorRef" @success="handleExecutionSuccess" />
  </div>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExcelColumn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import {
    confirmPmisTask,
    deletePmisTasks,
    fetchPmisTasks,
    summarizePmisTasks,
    type PmisPlanKind,
    type PmisTask
  } from '@pmis/api'
  import PmisDepartmentNavigator from './department-navigator.vue'
  import PmisTaskExecutionDialog, {
    type PmisTaskExecutionDialogOpenData
  } from './task-execution-dialog.vue'
  import { pmisKindConfig } from './business-config'
  import { resolvePmisTaskPermissions } from './business-permissions'
  import PmisDetailDrawerSections from './detail-drawer-sections.vue'
  import PmisTaskEditorDialog, { type TaskEditorOpenData } from './task-editor-dialog.vue'

  const props = defineProps<{ kind: PmisPlanKind; mode: 'task' | 'report' }>()
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const { getDictMap } = storeToRefs(userStore)
  const tableRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<ArtDrawerExpose<PmisTask>>()
  const detailRow = shallowRef<PmisTask>()
  const executionRef = ref<{
    handleOpen: (data: PmisTaskExecutionDialogOpenData) => Promise<void>
  }>()
  const editorRef = ref<{ handleOpen: (data: TaskEditorOpenData) => Promise<void> }>()
  const searchModel = ref<Record<string, unknown>>({
    keyword: '',
    dateRange: [],
    status: ''
  })
  const pageRows = shallowRef<PmisTask[]>([])
  const total = ref(0)
  const departmentIds = ref<string[]>([])
  const departmentLabel = ref('全部产线')
  const config = computed(() => pmisKindConfig(props.kind))
  const managedTask = computed(
    () => props.mode === 'task' && ['maintenance', 'preventive'].includes(props.kind)
  )
  const kindLabel = computed(() => config.value.label)
  const isInspectionKind = computed(() => ['inspection', 'patrol'].includes(props.kind))
  const itemNoun = computed(() => (isInspectionKind.value ? '检查项目' : '作业项目'))
  const title = computed(() =>
    props.mode === 'task' ? `${kindLabel.value}任务` : `${kindLabel.value}记录报表`
  )
  const description = computed(() =>
    props.mode === 'task'
      ? `按产线、计划日期与执行状态跟踪设备${kindLabel.value}任务，延误任务优先暴露。`
      : `按设备、日期与结果集中追溯${kindLabel.value}记录，支持查看项目明细与批量导出。`
  )
  const overview = computed(() => summarizePmisTasks(pageRows.value))
  const overdueCount = computed(() => overview.value.overdue)
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '任务总数',
      value: total.value,
      description: departmentLabel.value,
      icon: 'ri:file-list-3-line'
    },
    {
      label: '已完成',
      value: overview.value.completed,
      description: `完成率 ${overview.value.completionRate}%`,
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '计划中',
      value: overview.value.pending,
      description: '尚未到期',
      icon: 'ri:time-line',
      tone: 'warning'
    },
    {
      label: '已延误',
      value: overview.value.overdue,
      description: '需要优先处理',
      icon: 'ri:alarm-warning-line',
      tone: overview.value.overdue ? 'danger' : 'info'
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '任务单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索任务单号' }
    },
    {
      label: '计划日期',
      key: 'dateRange',
      type: 'daterange',
      props: {
        valueFormat: 'YYYY-MM-DD',
        rangeSeparator: '至',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期'
      }
    },
    {
      label: '执行状态',
      key: 'status',
      type: 'select',
      props: { clearable: true, options: getDictMap.value.pmisTaskStatus ?? [] }
    }
  ])
  void Promise.all(
    ['pmisTaskStatus', 'pmisResultStatus'].map((code) => userStore.ensureDictLoaded(code))
  )
  const fetchData = async (params: Record<string, unknown>) => {
    const range = Array.isArray(params.dateRange) ? params.dateRange.map(String) : []
    const result = await fetchPmisTasks(props.kind, {
      current: Number(params.current || 1),
      size: Number(params.size || 20),
      keyword: String(params.keyword || ''),
      status: String(params.status || '') || undefined,
      dateFrom: range[0],
      dateTo: range[1],
      departmentIds: departmentIds.value
    })
    pageRows.value = result.data
    total.value = result.total
    return result
  }
  const changeDepartments = (ids: string[], label: string): void => {
    departmentIds.value = ids
    departmentLabel.value = label
    void tableRef.value?.refreshContext()
  }
  const showDetail = async (row: PmisTask): Promise<void> => {
    detailRow.value = row
    await nextTick()
    await drawerRef.value?.handleOpen(row, {
      showFooter: false,
      contentHeight: 'calc(100vh - 90px)'
    })
  }
  const permissions = computed(() => resolvePmisTaskPermissions(props.kind, props.mode))
  const viewPermission = computed(() => permissions.value.view)
  const exportPermission = computed(() => permissions.value.export)
  const openExecution = (row: PmisTask): void => void executionRef.value?.handleOpen({ task: row })
  const openEditor = (row?: PmisTask, copy = false): void =>
    void editorRef.value?.handleOpen({ kind: props.kind, row, copy })
  const removeRows = async (rows: PmisTask[]): Promise<void> => {
    await confirmAction(
      `确定删除选中的 ${rows.length} 个临时任务吗？仅未执行的手工任务可删除。`,
      `删除${kindLabel.value}任务`,
      { type: 'warning' }
    )
    await deletePmisTasks(
      rows.map((row) => row.id),
      props.kind
    )
    handleExecutionSuccess()
  }
  const confirmTask = async (row: PmisTask): Promise<void> => {
    await confirmAction(`确认 ${row.taskNo} 的保养结果已复核无误吗？`, '确认保养结果', {
      type: 'success'
    })
    await confirmPmisTask(row.id)
    handleExecutionSuccess()
  }
  const rowMoreActions = (row: PmisTask): ButtonMoreItem[] => [
    {
      key: 'copy',
      label: '复制任务',
      icon: 'ri:file-copy-line',
      auth: permissions.value.copy
    },
    {
      key: 'delete',
      label: '删除任务',
      icon: 'ri:delete-bin-6-line',
      color: 'var(--el-color-danger)',
      auth: permissions.value.delete,
      disabled: row.status !== 'pending' || row.taskSource === 'scheduled'
    }
  ]
  const handleExecutionSuccess = (): void => void tableRef.value?.refreshData()
  const columnsFactory = (): ColumnOption<PmisTask>[] => [
    ...(managedTask.value ? [{ type: 'selection', width: 48 } as ColumnOption<PmisTask>] : []),
    { type: 'globalIndex', label: '序号', width: 70, fixed: 'left' },
    {
      prop: 'taskNo',
      label: '任务单号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) =>
        hasAuth(viewPermission.value) ? (
          <button
            type="button"
            class="pmis-task-workspace__link"
            onClick={() => void showDetail(row)}
          >
            {row.taskNo}
          </button>
        ) : (
          <span class="pmis-task-workspace__link is-static">{row.taskNo}</span>
        )
    },
    { prop: 'plan', label: '方案名称', minWidth: 180, formatter: (row) => row.plan.planName },
    { prop: 'plannedDate', label: '计划日期', width: 118 },
    {
      prop: 'equipment',
      label: '设备编号',
      minWidth: 150,
      formatter: (row) => row.equipment.equipmentCode
    },
    {
      prop: 'equipmentName',
      label: '设备名称',
      minWidth: 180,
      formatter: (row) => row.equipment.equipmentName
    },
    {
      prop: 'department',
      label: '部门 / 产线',
      minWidth: 160,
      formatter: (row) => row.equipment.department?.departmentName || '待分配'
    },
    {
      prop: 'responsible',
      label: '负责人',
      width: 130,
      formatter: (row) => row.responsible?.employeeName || '—'
    },
    {
      prop: 'displayStatus',
      label: '执行状态',
      width: 108,
      align: 'center',
      dict: { code: 'pmisTaskStatus', display: 'tag' }
    },
    {
      prop: 'completedAt',
      label: '完成时间',
      width: 164,
      formatter: (row) =>
        row.completedAt ? dayjs(row.completedAt).format('YYYY-MM-DD HH:mm') : '—'
    },
    {
      prop: 'operation',
      label: '操作',
      width: managedTask.value ? 246 : props.mode === 'task' ? 176 : 86,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            permission={viewPermission.value}
            type="view"
            onClick={() => void showDetail(row)}
          />
          {props.mode === 'task' && row.status === 'pending' ? (
            <ArtButtonTable
              permission={permissions.value.execute}
              type="more"
              icon="ri:play-circle-line"
              label={`执行${kindLabel.value}`}
              onClick={() => openExecution(row)}
            />
          ) : null}
          {managedTask.value && row.status === 'pending' && row.taskSource !== 'scheduled' ? (
            <ArtButtonTable
              permission={permissions.value.edit}
              type="edit"
              onClick={() => openEditor(row)}
            />
          ) : null}
          {props.kind === 'maintenance' &&
          props.mode === 'task' &&
          row.status === 'pending_confirm' ? (
            <ArtButtonTable
              permission={permissions.value.confirm}
              type="more"
              icon="ri:shield-check-line"
              label="确认"
              onClick={() => void confirmTask(row)}
            />
          ) : null}
          {managedTask.value ? (
            <ArtButtonMore
              list={rowMoreActions(row)}
              onClick={(item) =>
                item.key === 'copy' ? openEditor(row, true) : void removeRows([row])
              }
            />
          ) : null}
        </BusinessTableRowActions>
      )
    }
  ]
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    ...(managedTask.value
      ? [
          {
            type: 'add',
            label: `新增${kindLabel.value}任务`,
            permission: permissions.value.add,
            onClick: () => openEditor()
          } as ArtTableQueryHeaderAction
        ]
      : []),
    { type: 'export', permission: exportPermission.value, exportFilename: title.value },
    ...(managedTask.value
      ? [
          {
            type: 'delete',
            permission: permissions.value.delete,
            selectionRequired: true,
            content: '确定删除选中的临时任务吗？',
            onClick: async ({ selectedRows }) => removeRows(selectedRows as PmisTask[])
          } as ArtTableQueryHeaderAction
        ]
      : [])
  ])
  const excelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'taskNo', title: '任务单号' },
    { key: 'plannedDate', title: '计划日期' },
    { key: 'displayStatus', title: '执行状态' },
    { key: 'completedAt', title: '完成时间' }
  ]
  const taskDescriptions = computed(() =>
    detailRow.value
      ? [
          { key: 'taskNo', label: '任务单号', value: detailRow.value.taskNo },
          {
            key: 'status',
            label: '执行状态',
            value: detailRow.value.displayStatus,
            dictCode: 'pmisTaskStatus'
          },
          { key: 'plan', label: '方案名称', value: detailRow.value.plan.planName },
          { key: 'date', label: '计划日期', value: detailRow.value.plannedDate },
          {
            key: 'equipment',
            label: '设备',
            value: `${detailRow.value.equipment.equipmentName} · ${detailRow.value.equipment.equipmentCode}`
          },
          {
            key: 'department',
            label: '部门 / 产线',
            value: detailRow.value.equipment.department?.departmentName || '待分配'
          },
          {
            key: 'responsible',
            label: '负责人',
            value: detailRow.value.responsible?.employeeName || '—'
          },
          {
            key: 'completedAt',
            label: '完成时间',
            value: detailRow.value.completedAt
              ? dayjs(detailRow.value.completedAt).format('YYYY-MM-DD HH:mm')
              : '—'
          }
        ]
      : []
  )
</script>

<style scoped lang="scss">
  .pmis-task-workspace {
    &__body {
      display: flex;
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    &__results {
      display: flex;
      flex: 1 1 0;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      min-height: 0;
      overflow: hidden;
    }

    :deep(.pmis-task-workspace__link) {
      padding: 0;
      font: inherit;
      font-weight: 600;
      color: var(--theme-color);
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--theme-color) 45%, transparent);
      text-underline-offset: 3px;
      cursor: pointer;
      background: transparent;
      border: 0;
    }

    :deep(.pmis-task-workspace__link:focus-visible) {
      outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
      outline-offset: 3px;
    }

    :deep(.pmis-task-workspace__link.is-static) {
      color: var(--el-text-color-primary);
      cursor: default;
    }

    &__result-list {
      display: grid;
    }

    &__result-list article {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px 0;
    }

    &__result-list article + article {
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__result-list article > span {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
    }

    &__result-list .is-ok {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }

    &__result-list .is-ng {
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
    }

    &__result-list .is-exempt {
      color: var(--el-text-color-secondary);
      background: var(--art-gray-100);
    }

    &__result-list strong,
    &__result-list small {
      display: block;
    }

    &__result-list small {
      margin-top: 3px;
      color: var(--el-text-color-secondary);
    }
  }
</style>
