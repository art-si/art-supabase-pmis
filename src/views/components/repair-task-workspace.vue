<template>
  <div class="pmis-repair art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="FAULT REPAIR CONTROL"
      title="维修任务"
      description="集中跟踪故障报修、派工、维修处置和结果确认，逾期工单优先暴露。"
      icon="ri:tools-line"
      :tags="[
        { label: '异常自动转单', type: 'primary' },
        { label: '移动端可用', type: 'success' },
        { label: `${overdue} 单逾期`, type: overdue ? 'danger' : 'info' }
      ]"
      :metrics="metrics"
      ><template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template
    ></BusinessWorkspaceHeader>
    <section class="pmis-repair__body"
      ><ArtWorkspaceSplitter
        primary-size="288px"
        primary-min="248px"
        primary-max="400px"
        :breakpoint="900"
        stacked-primary-size="300px"
        ><template #primary><PmisDepartmentNavigator @change="changeDepartment" /></template
        ><main class="pmis-repair__content"
          ><ArtTableQuery
            ref="tableRef"
            v-model="search"
            :api-fn="fetchData"
            :columns-factory="columnsFactory"
            :search-items="searchItems"
            :search-bar-props="{ span: 8, labelPosition: 'top', showExpand: false, isExpand: true }"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :excel-columns="excelColumns"
            :table-props="{ rowKey: 'id', tableLayout: 'fixed' }"
            :empty-config="{
              title: '暂无维修任务',
              description: '点击新增维修工单，或由检查异常自动生成维修任务。'
            }"
            focusable
            focus-scope-selector=".pmis-repair__body"
            show-focus-mode /></main></ArtWorkspaceSplitter
    ></section>
    <PmisRepairTaskDialog ref="dialogRef" @success="refresh" />
    <ArtDrawer ref="drawerRef" title="维修工单详情" size="lg"
      ><PmisDetailDrawerSections v-if="detail"
        ><ArtSectionCard title="工单摘要" subtitle="设备、人员与维修时效"
          ><ArtDescriptions :columns="2" :data="detail" :items="descriptions" /></ArtSectionCard
        ><ArtSectionCard title="故障与处置" subtitle="完整记录故障分析、原因与解决方案"
          ><div class="pmis-repair__narrative"
            ><article
              ><small>故障现象</small><p>{{ detail.faultSymptom }}</p></article
            ><article
              ><small>故障分析</small><p>{{ detail.faultAnalysis || '—' }}</p></article
            ><article
              ><small>故障原因</small><p>{{ detail.faultCause || '—' }}</p></article
            ><article
              ><small>维修方案</small><p>{{ detail.solution || '—' }}</p></article
            ></div
          ></ArtSectionCard
        ></PmisDetailDrawerSections
      ></ArtDrawer
    >
  </div>
</template>
<script setup lang="tsx">
  import dayjs from 'dayjs'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExcelColumn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { deletePmisRepairTasks, fetchPmisRepairTasks, type PmisRepairTask } from '@pmis/api'
  import PmisDetailDrawerSections from './detail-drawer-sections.vue'
  import PmisDepartmentNavigator from './department-navigator.vue'
  import PmisRepairTaskDialog, { type RepairDialogOpenData } from './repair-task-dialog.vue'
  import { pmisRepairTaskPermissions } from './business-permissions'
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<{ handleOpen: (data: RepairDialogOpenData) => Promise<void> }>()
  const drawerRef = ref<ArtDrawerExpose<PmisRepairTask>>()
  const detail = shallowRef<PmisRepairTask>()
  const rows = shallowRef<PmisRepairTask[]>([])
  const total = ref(0)
  const departments = ref<string[]>([])
  const search = ref<Record<string, unknown>>({ keyword: '', dateRange: [], status: '' })
  const { confirmAction } = useArtFeedback()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const scope = useTenantScopeStore()
  const { effectiveTenantId } = storeToRefs(scope)
  const overdue = computed(() => rows.value.filter((r) => r.displayStatus === 'overdue').length)
  const completed = computed(() => rows.value.filter((r) => r.status === 'completed').length)
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '维修工单',
      value: total.value,
      description: '当前可见范围',
      icon: 'ri:file-list-3-line'
    },
    {
      label: '维修中',
      value: rows.value.filter((r) => r.status === 'in_progress').length,
      description: '正在处置',
      icon: 'ri:loader-4-line',
      tone: 'primary'
    },
    {
      label: '已完成',
      value: completed.value,
      description: '本页已闭环',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '已逾期',
      value: overdue.value,
      description: '优先处理',
      icon: 'ri:alarm-warning-line',
      tone: overdue.value ? 'danger' : 'info'
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '工单 / 现象',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索工单号或故障现象' }
    },
    {
      label: '报修日期',
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
      label: '维修状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        options: getDictMap.value.pmisRepairStatus ?? []
      }
    }
  ])
  const fetchData = async (params: Record<string, unknown>) => {
    const range = Array.isArray(params.dateRange) ? params.dateRange.map(String) : []
    const result = await fetchPmisRepairTasks({
      current: Number(params.current || 1),
      size: Number(params.size || 20),
      keyword: String(params.keyword || ''),
      status: String(params.status || '') || undefined,
      dateFrom: range[0],
      dateTo: range[1],
      departmentIds: departments.value
    })
    rows.value = result.data
    total.value = result.total
    return result
  }
  const refresh = () => void tableRef.value?.refreshData()
  const changeDepartment = (ids: string[]) => {
    departments.value = ids
    void tableRef.value?.refreshContext()
  }
  const open = (row?: PmisRepairTask, copy = false) =>
    void dialogRef.value?.handleOpen({
      row,
      copy,
      tenantId: row?.tenantId || effectiveTenantId.value || undefined
    })
  const show = async (row: PmisRepairTask) => {
    detail.value = row
    await nextTick()
    await drawerRef.value?.handleOpen(row, {
      showFooter: false,
      contentHeight: 'calc(100vh - 90px)'
    })
  }
  const remove = async (row: PmisRepairTask) => {
    await confirmAction(`确定删除维修工单 ${row.workOrderNo} 吗？`, '删除维修工单', {
      type: 'warning'
    })
    await deletePmisRepairTasks([row.id])
    refresh()
  }
  const columnsFactory = (): ColumnOption<PmisRepairTask>[] => [
    { type: 'globalIndex', label: '序号', width: 70, fixed: 'left' },
    {
      prop: 'workOrderNo',
      label: '维修工单',
      minWidth: 180,
      fixed: 'left',
      formatter: (r) => (
        <button class="pmis-repair__link" onClick={() => void show(r)}>
          {r.workOrderNo}
        </button>
      )
    },
    {
      prop: 'urgency',
      label: '紧急程度',
      width: 100,
      align: 'center',
      dict: { code: 'pmisRepairUrgency', display: 'auto' }
    },
    {
      prop: 'equipment',
      label: '设备',
      minWidth: 190,
      formatter: (r) => (
        <BusinessTableIdentityCell
          primary={r.equipment.equipmentName}
          secondary={r.equipment.equipmentCode}
        />
      )
    },
    { prop: 'faultSymptom', label: '故障现象', minWidth: 240, showOverflowTooltip: true },
    {
      prop: 'reporter',
      label: '报修人',
      width: 110,
      formatter: (r) => r.reporter?.employeeName || '—'
    },
    {
      prop: 'reportedAt',
      label: '报修时间',
      width: 164,
      formatter: (r) => dayjs(r.reportedAt).format('YYYY-MM-DD HH:mm')
    },
    {
      prop: 'repairer',
      label: '维修人员',
      width: 120,
      formatter: (r) => r.repairer?.employeeName || '待派工'
    },
    {
      prop: 'displayStatus',
      label: '状态',
      width: 108,
      align: 'center',
      dict: { code: 'pmisRepairStatus', display: 'auto' }
    },
    {
      prop: 'completedAt',
      label: '完成时间',
      width: 164,
      formatter: (r) => (r.completedAt ? dayjs(r.completedAt).format('YYYY-MM-DD HH:mm') : '—')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 216,
      fixed: 'right',
      formatter: (r) => (
        <div>
          <ArtButtonTable
            permission={pmisRepairTaskPermissions.view}
            type="view"
            onClick={() => void show(r)}
          />
          <ArtButtonTable
            permission={pmisRepairTaskPermissions.edit}
            type="edit"
            onClick={() => open(r)}
          />
          <ArtButtonTable
            permission={pmisRepairTaskPermissions.copy}
            type="more"
            icon="ri:file-copy-line"
            label="复制"
            onClick={() => open(r, true)}
          />
          <ArtButtonTable
            permission={pmisRepairTaskPermissions.delete}
            type="delete"
            onClick={() => void remove(r)}
          />
        </div>
      )
    }
  ]
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增维修工单',
      permission: pmisRepairTaskPermissions.add,
      onClick: () => open()
    },
    {
      type: 'export',
      permission: pmisRepairTaskPermissions.export,
      exportFilename: '维修任务'
    }
  ]
  const excelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'workOrderNo', title: '维修工单' },
    { key: 'urgency', title: '紧急程度' },
    { key: 'faultSymptom', title: '故障现象' },
    { key: 'displayStatus', title: '状态' },
    { key: 'reportedAt', title: '报修时间' }
  ]
  const descriptions = computed(() =>
    detail.value
      ? [
          { key: 'no', label: '维修工单', value: detail.value.workOrderNo },
          {
            key: 'status',
            label: '维修状态',
            value: detail.value.displayStatus,
            dictCode: 'pmisRepairStatus'
          },
          {
            key: 'equipment',
            label: '设备',
            value: `${detail.value.equipment.equipmentName} · ${detail.value.equipment.equipmentCode}`
          },
          {
            key: 'urgency',
            label: '紧急程度',
            value: detail.value.urgency,
            dictCode: 'pmisRepairUrgency'
          },
          { key: 'reporter', label: '报修人', value: detail.value.reporter?.employeeName || '—' },
          {
            key: 'repairer',
            label: '维修人员',
            value: detail.value.repairer?.employeeName || '待派工'
          },
          {
            key: 'reported',
            label: '报修时间',
            value: dayjs(detail.value.reportedAt).format('YYYY-MM-DD HH:mm')
          },
          {
            key: 'confirmed',
            label: '确认时间',
            value: detail.value.confirmedAt
              ? dayjs(detail.value.confirmedAt).format('YYYY-MM-DD HH:mm')
              : '—'
          }
        ]
      : []
  )
  void Promise.all(
    ['pmisRepairUrgency', 'pmisRepairStatus'].map((code) => userStore.ensureDictLoaded(code))
  )
</script>
<style scoped lang="scss">
  .pmis-repair__body,
  .pmis-repair__content {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .pmis-repair__content {
    width: 100%;
    overflow: hidden;
  }

  :deep(.pmis-repair__link) {
    padding: 0;
    font: inherit;
    font-weight: 650;
    color: var(--theme-color);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--theme-color) 45%, transparent);
    text-underline-offset: 3px;
    cursor: pointer;
    background: none;
    border: 0;
  }

  :deep(.pmis-repair__link:focus-visible) {
    outline: 2px solid var(--theme-color);
    outline-offset: 3px;
  }

  .pmis-repair__narrative {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .pmis-repair__narrative article {
    padding: 14px;
    background: var(--el-fill-color-lighter);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .pmis-repair__narrative small {
    color: var(--el-text-color-secondary);
  }

  .pmis-repair__narrative p {
    margin: 6px 0 0;
    white-space: pre-wrap;
  }

  @media (width<=640px) {
    .pmis-repair__narrative {
      grid-template-columns: 1fr;
    }
  }
</style>
