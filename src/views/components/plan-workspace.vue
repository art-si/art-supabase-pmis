<template>
  <div class="pmis-plan-workspace art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      :eyebrow="config.eyebrow"
      :title="`${kindLabel}方案`"
      :description="description"
      :icon="config.icon"
      :tags="[
        { label: '设备主档联动', type: 'primary' },
        { label: '任务自动生成', type: 'success' },
        { label: '租户隔离', type: 'info' }
      ]"
      :metrics="metrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableRef"
      v-model="searchModel"
      :api-fn="fetchData"
      :columns-factory="columnsFactory"
      :search-items="searchItems"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :excel-columns="excelColumns"
      :search-bar-props="{ span: 8, labelWidth: 72, showExpand: false, isExpand: true }"
      :table-props="{ rowKey: 'id', tableLayout: 'fixed' }"
      :empty-config="{
        title: `暂无${kindLabel}方案`,
        description: `点击新增方案，配置适用设备、执行频次与${kindLabel}项目。`
      }"
      focusable
      show-focus-mode
    />

    <PmisPlanDialog ref="dialogRef" @success="refresh" />
    <ArtDrawer ref="drawerRef" :title="`${kindLabel}方案详情`" size="lg">
      <PmisDetailDrawerSections v-if="detailRow">
        <ArtSectionCard title="方案摘要" subtitle="执行节奏与责任范围">
          <ArtDescriptions :columns="2" :data="detailRow" :items="detailDescriptions" />
        </ArtSectionCard>
        <ArtSectionCard
          :title="itemNoun"
          :subtitle="`共 ${detailRow.items.length} 项，按现场执行顺序展示`"
          :empty="detailRow.items.length === 0"
          :empty-description="`该方案尚未配置${itemNoun}。`"
        >
          <ol class="pmis-plan-workspace__item-list">
            <li v-for="item in detailRow.items" :key="item.id || item.sort">
              <span>{{ String(item.sort / 10).padStart(2, '0') }}</span>
              <div
                ><strong>{{ item.itemName }}</strong
                ><small>{{ item.requirement }}</small></div
              >
              <ElTag v-if="item.requirePhoto" size="small" type="warning" effect="plain"
                >需图片</ElTag
              >
            </li>
          </ol>
        </ArtSectionCard>
      </PmisDetailDrawerSections>
    </ArtDrawer>
  </div>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExcelColumn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import {
    deletePmisPlans,
    fetchPmisPlans,
    savePmisPlan,
    type PmisPlan,
    type PmisPlanFrequency,
    type PmisPlanKind
  } from '@pmis/api'
  import PmisPlanDialog, { type PmisPlanDialogOpenData } from './plan-dialog.vue'
  import { pmisKindConfig } from './business-config'
  import { pmisPlanPermissions } from './business-permissions'
  import PmisDetailDrawerSections from './detail-drawer-sections.vue'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  const props = defineProps<{ kind: PmisPlanKind }>()
  interface DialogExpose {
    handleOpen: (data: PmisPlanDialogOpenData) => Promise<void>
  }
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions } = storeToRefs(tenantScopeStore)
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const tableRef = ref<ArtTableQueryExpose>()
  const searchModel = ref<Record<string, unknown>>({ keyword: '', status: '' })
  const dialogRef = ref<DialogExpose>()
  const drawerRef = ref<ArtDrawerExpose<PmisPlan>>()
  const detailRow = shallowRef<PmisPlan>()
  const total = ref(0)
  const rows = shallowRef<PmisPlan[]>([])
  const config = computed(() => pmisKindConfig(props.kind))
  const kindLabel = computed(() => config.value.label)
  const itemNoun = computed(() =>
    ['maintenance', 'preventive'].includes(props.kind) ? '作业项目' : '检查项目'
  )
  const permissions = computed(() => pmisPlanPermissions[props.kind])
  const description = computed(() => config.value.description)
  const enabledCount = computed(() => rows.value.filter((row) => row.status === 'enabled').length)
  const boundEquipmentCount = computed(
    () =>
      new Set(rows.value.flatMap((row) => row.equipmentBindings.map((item) => item.equipment?.id)))
        .size
  )
  const itemCount = computed(() => rows.value.reduce((sum, row) => sum + row.items.length, 0))
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '方案总数',
      value: total.value,
      description: '当前可见范围',
      icon: 'ri:file-list-3-line'
    },
    {
      label: '启用方案',
      value: enabledCount.value,
      description: '正在生成任务',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '覆盖设备',
      value: boundEquipmentCount.value,
      description: '去重设备数量',
      icon: 'ri:tools-line',
      tone: 'primary'
    },
    {
      label: itemNoun.value,
      value: itemCount.value,
      description: '当前页项目总数',
      icon: 'ri:list-check-3',
      tone: 'info'
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '方案名称',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: `搜索${kindLabel.value}方案名称` }
    },
    {
      label: '方案状态',
      key: 'status',
      type: 'select',
      props: { clearable: true, options: getDictMap.value.commonEnabledStatus ?? [] }
    }
  ])
  void userStore.ensureDictLoaded('commonEnabledStatus')
  const fetchData = async (params: Record<string, unknown>) => {
    const result = await fetchPmisPlans(props.kind, {
      current: Number(params.current || 1),
      size: Number(params.size || 20),
      keyword: String(params.keyword || ''),
      status: String(params.status || '') || undefined
    })
    total.value = result.total
    rows.value = result.data
    return result
  }
  watch(
    () => tenantScopeStore.revision,
    () => {
      rows.value = []
      total.value = 0
      void tableRef.value?.refreshContext()
    }
  )
  const dialogData = (row?: PmisPlan, copy = false): PmisPlanDialogOpenData => {
    const targetTenantId = row?.tenantId || effectiveTenantId.value || undefined
    const availableTenants = targetTenantId
      ? tenantOptions.value.filter((item) => item.id === targetTenantId)
      : tenantOptions.value
    return {
      kind: props.kind,
      row,
      copy,
      targetTenantId,
      tenantOptions: availableTenants.map((item) => ({
        label: item.tenantName || item.tenantCode,
        value: item.id
      }))
    }
  }
  const openDialog = (row?: PmisPlan, copy = false): void =>
    void dialogRef.value?.handleOpen(dialogData(row, copy))
  const refresh = (): void => void tableRef.value?.refreshData()
  const showDetail = async (row: PmisPlan): Promise<void> => {
    detailRow.value = row
    await nextTick()
    await drawerRef.value?.handleOpen(row, {
      showFooter: false,
      contentHeight: 'calc(100vh - 90px)'
    })
  }
  const removeRows = async (selected: PmisPlan[]): Promise<void> => {
    await confirmAction(
      `确定删除选中的 ${selected.length} 个${kindLabel.value}方案吗？仍绑定设备的方案不能删除。`,
      `删除${kindLabel.value}方案`,
      { type: 'warning' }
    )
    await deletePmisPlans(
      selected.map((row) => row.id),
      props.kind
    )
    refresh()
  }
  const frequencyMap: Record<string, PmisPlanFrequency> = {
    daily: 'daily',
    weekly: 'weekly',
    tenday: 'tenday',
    monthly: 'monthly',
    quarterly: 'quarterly',
    yearly: 'yearly',
    每日: 'daily',
    每周: 'weekly',
    每旬: 'tenday',
    每月: 'monthly',
    每季度: 'quarterly',
    每年: 'yearly'
  }
  const importRows = async (importedRows: Record<string, unknown>[]): Promise<void> => {
    for (const [index, row] of importedRows.entries()) {
      const tenantSource = String(row['目标租户'] || row['租户'] || '').trim()
      const matchedTenant = tenantOptions.value.find(
        (item) =>
          item.id === tenantSource ||
          item.tenantCode === tenantSource ||
          item.tenantName === tenantSource
      )
      const targetTenantId =
        effectiveTenantId.value ||
        (tenantOptions.value.length === 1 ? tenantOptions.value[0]?.id : matchedTenant?.id)
      if (!targetTenantId)
        throw new Error(
          `第 ${index + 2} 行缺少有效的目标租户；全部租户范围导入时请填写“目标租户”列`
        )
      const planName = String(row['方案名称'] || '').trim()
      const itemName = String(
        row['检查内容'] || row['点检内容'] || row['巡检内容'] || '基础检查'
      ).trim()
      const requirement = String(row['检查要求'] || row['检查标准'] || '按设备标准完成检查').trim()
      const frequencySource = String(row['频次'] || row['执行频次'] || 'daily').trim()
      const frequency = frequencyMap[frequencySource]
      if (!planName) throw new Error(`第 ${index + 2} 行缺少方案名称`)
      if (!frequency) throw new Error(`第 ${index + 2} 行执行频次无效`)

      await savePmisPlan({
        tenantId: targetTenantId,
        planKind: props.kind,
        planName,
        frequency,
        frequencyValue: null,
        advanceDays: 0,
        requiredDays: Math.max(Number(row['完成时长（天）'] || 1), 1),
        holidayPolicy: 'postpone',
        notificationRules: [],
        requirePhoto: false,
        sopFiles: [],
        status: 'disabled',
        remark: String(row['方案说明'] || 'Excel 导入；请绑定设备和负责人后启用'),
        items: [
          {
            itemName,
            requirement,
            judgmentRule: String(row['判定规则'] || ''),
            requirePhoto: false,
            sort: 10
          }
        ],
        equipmentIds: [],
        responsibleEmployeeIds: []
      })
    }
    refresh()
  }
  const moreActions = (): ButtonMoreItem[] => [
    { key: 'copy', label: '复制方案', icon: 'ri:file-copy-line', auth: permissions.value.copy },
    {
      key: 'delete',
      label: '删除',
      icon: 'ri:delete-bin-6-line',
      color: 'var(--el-color-danger)',
      auth: permissions.value.delete
    }
  ]
  const columnsFactory = (): ColumnOption<PmisPlan>[] => [
    { type: 'selection', width: 48 },
    { type: 'globalIndex', label: '序号', width: 70, fixed: 'left' },
    {
      prop: 'planName',
      label: '方案名称',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) =>
        hasAuth(permissions.value.view) ? (
          <button
            type="button"
            class="pmis-plan-workspace__link"
            onClick={() => void showDetail(row)}
          >
            <strong>{row.planName}</strong>
            <small>设备{pmisKindConfig(row.planKind).label}</small>
          </button>
        ) : (
          <span class="pmis-plan-workspace__link is-static">
            <strong>{row.planName}</strong>
            <small>设备{pmisKindConfig(row.planKind).label}</small>
          </span>
        )
    },
    {
      prop: 'frequency',
      label: '频次',
      width: 100,
      align: 'center',
      dict: { code: 'pmisPlanFrequency', display: 'tag' }
    },
    {
      prop: 'responsibleBindings',
      label: '负责人',
      minWidth: 150,
      formatter: (row) =>
        row.responsibleBindings
          .map((item) => item.employee?.employeeName)
          .filter(Boolean)
          .join('、') || '—'
    },
    {
      prop: 'equipmentBindings',
      label: '适用设备',
      width: 110,
      align: 'center',
      formatter: (row) => `${row.equipmentBindings.length} 台`
    },
    {
      prop: 'items',
      label: itemNoun.value,
      width: 100,
      align: 'center',
      formatter: (row) => `${row.items.length} 项`
    },
    {
      prop: 'requiredDays',
      label: '完成时长',
      width: 110,
      align: 'center',
      formatter: (row) => `${row.requiredDays} 天`
    },
    {
      prop: 'status',
      label: '状态',
      width: 96,
      align: 'center',
      dict: { code: 'commonEnabledStatus', display: 'tag' }
    },
    {
      prop: 'updateTime',
      label: '最近维护',
      width: 164,
      formatter: (row) => formatTableDateTime(row.updateTime)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 176,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            permission={permissions.value.view}
            type="view"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            permission={permissions.value.edit}
            type="edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonMore
            list={moreActions()}
            onClick={(item) =>
              item.key === 'copy' ? openDialog(row, true) : void removeRows([row])
            }
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${kindLabel.value}方案`,
      permission: permissions.value.add,
      onClick: () => openDialog()
    },
    {
      type: 'import',
      permission: permissions.value.import,
      onImportSuccess: importRows
    },
    {
      type: 'export',
      permission: permissions.value.export,
      exportFilename: `${kindLabel.value}方案`
    },
    {
      type: 'delete',
      permission: permissions.value.delete,
      selectionRequired: true,
      content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
        `确定删除选中的 ${selectedCount} 个方案吗？`,
      onClick: async ({ selectedRows }) => removeRows(selectedRows as PmisPlan[])
    }
  ])
  const excelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'planName', title: '方案名称' },
    { key: 'frequency', title: '频次' },
    { key: 'requiredDays', title: '完成时长（天）' },
    { key: 'status', title: '状态' },
    { key: 'updateTime', title: '最近维护时间' }
  ]
  const detailDescriptions = computed(() =>
    detailRow.value
      ? [
          { key: 'name', label: '方案名称', value: detailRow.value.planName },
          {
            key: 'frequency',
            label: '执行频次',
            value: detailRow.value.frequency,
            dictCode: 'pmisPlanFrequency'
          },
          {
            key: 'equipment',
            label: '适用设备',
            value:
              detailRow.value.equipmentBindings
                .map((item) => item.equipment?.equipmentName)
                .filter(Boolean)
                .join('、') || '—'
          },
          {
            key: 'responsible',
            label: '负责人',
            value:
              detailRow.value.responsibleBindings
                .map((item) => item.employee?.employeeName)
                .filter(Boolean)
                .join('、') || '—'
          },
          {
            key: 'requiredDays',
            label: '要求完成时长',
            value: `${detailRow.value.requiredDays} 天`
          },
          { key: 'remark', label: '方案说明', value: detailRow.value.remark || '—', span: 2 }
        ]
      : []
  )
</script>

<style scoped lang="scss">
  .pmis-plan-workspace {
    :deep(.pmis-plan-workspace__link) {
      display: grid;
      gap: 3px;
      width: 100%;
      padding: 0;
      font: inherit;
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: 0;

      strong {
        color: var(--theme-color);
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, var(--theme-color) 45%, transparent);
        text-underline-offset: 3px;
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
        outline-offset: 3px;
      }

      &.is-static {
        color: var(--el-text-color-primary);
        cursor: default;
      }
    }

    &__item-list {
      display: grid;
      gap: 0;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 12px 0;
      }

      li + li {
        border-top: 1px solid var(--el-border-color-lighter);
      }

      li > span {
        font-variant-numeric: tabular-nums;
        color: var(--theme-color);
      }

      strong,
      small {
        display: block;
      }

      small {
        margin-top: 3px;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>
