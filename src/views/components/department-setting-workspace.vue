<template>
  <div class="pmis-setting art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      :eyebrow="kind === 'maintenance' ? 'MAINTENANCE SETTINGS' : 'REPAIR TEAM SETTINGS'"
      :title="title"
      :description="description"
      :icon="kind === 'maintenance' ? 'ri:settings-3-line' : 'ri:user-settings-line'"
      :tags="[
        { label: '部门级默认值', type: 'primary' },
        { label: '超时升级', type: 'warning' },
        { label: '租户隔离', type: 'info' }
      ]"
      :metrics="metrics"
    >
      <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
    </BusinessWorkspaceHeader>
    <section class="pmis-setting__body">
      <ArtWorkspaceSplitter
        primary-size="288px"
        primary-min="248px"
        primary-max="400px"
        :breakpoint="900"
        stacked-primary-size="300px"
      >
        <template #primary><PmisDepartmentNavigator @change="changeDepartment" /></template>
        <main class="pmis-setting__content">
          <ArtTableQuery
            ref="tableRef"
            :api-fn="fetchData"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :table-props="{ rowKey: 'id', tableLayout: 'fixed' }"
            :empty-config="{
              title: `暂无${title}`,
              description: '点击新增设置，为部门配置默认人员与通知升级规则。'
            }"
            focusable
            focus-scope-selector=".pmis-setting__body"
            show-focus-mode
          />
        </main>
      </ArtWorkspaceSplitter>
    </section>
    <PmisDepartmentSettingDialog ref="dialogRef" @success="refresh" />
    <ArtDrawer ref="drawerRef" :title="`${title}详情`" size="lg">
      <PmisDetailDrawerSections v-if="detailRow">
        <ArtSectionCard title="部门配置" subtitle="默认人员、通知方式与现场要求">
          <ArtDescriptions :columns="2" :data="detailRow" :items="detailDescriptions" />
        </ArtSectionCard>
        <ArtSectionCard
          title="超时升级规则"
          :subtitle="`共 ${detailRow.escalationRules.length} 条规则`"
          :empty="detailRow.escalationRules.length === 0"
          empty-description="当前部门未配置超时升级通知。"
        >
          <ol class="pmis-setting__rule-list">
            <li v-for="(rule, index) in detailRow.escalationRules" :key="rule.id">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div>
                <strong>超时 {{ rule.delayMinutes }} 分钟后通知</strong>
                <small class="pmis-setting__dict-list">
                  <ArtDictDisplay
                    v-for="method in rule.notificationMethods"
                    :key="method"
                    dict-code="pmisNotificationMethod"
                    :value="method"
                    display="text"
                  />
                  <template v-if="rule.notificationMethods.length === 0">未配置通知方式</template>
                </small>
              </div>
              <ElTag effect="plain">{{ rule.notifyEmployeeIds.length }} 人</ElTag>
            </li>
          </ol>
        </ArtSectionCard>
      </PmisDetailDrawerSections>
    </ArtDrawer>
  </div>
</template>

<script setup lang="tsx">
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import {
    deletePmisDepartmentSettings,
    fetchPmisDepartmentSettings,
    type PmisDepartmentSetting,
    type PmisSettingKind
  } from '@pmis/api'
  import PmisDepartmentNavigator from './department-navigator.vue'
  import PmisDepartmentSettingDialog, {
    type SettingDialogOpenData
  } from './department-setting-dialog.vue'
  import { pmisSettingPermissions } from './business-permissions'
  import PmisDetailDrawerSections from './detail-drawer-sections.vue'

  const props = defineProps<{ kind: PmisSettingKind }>()
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<{ handleOpen: (data: SettingDialogOpenData) => Promise<void> }>()
  const drawerRef = ref<ArtDrawerExpose<PmisDepartmentSetting>>()
  const detailRow = shallowRef<PmisDepartmentSetting>()
  const departmentIds = ref<string[]>([])
  const rows = shallowRef<PmisDepartmentSetting[]>([])
  const total = ref(0)
  const tenantScope = useTenantScopeStore()
  const { effectiveTenantId } = storeToRefs(tenantScope)
  const { confirmAction } = useArtFeedback()
  const userStore = useUserStore()
  const title = computed(() => (props.kind === 'maintenance' ? '保养设置' : '设置维修人员'))
  const description = computed(() =>
    props.kind === 'maintenance'
      ? '按部门维护保养执行人、确认人、照片规则和超时升级通知。'
      : '按部门维护维修人员、确认人、通知渠道与超时升级规则。'
  )
  const permissions = computed(() => pmisSettingPermissions[props.kind])
  const notificationDisplay = (values: string[]) =>
    values.length ? (
      <div class="pmis-setting__dict-list">
        {values.map((value) => (
          <ArtDictDisplay
            key={value}
            dictCode="pmisNotificationMethod"
            value={value}
            display="tag"
          />
        ))}
      </div>
    ) : (
      '未配置'
    )
  const people = (row: PmisDepartmentSetting, role: string) =>
    row.employees
      .filter((item) => item.role === role)
      .map((item) => item.employee?.employeeName)
      .filter(Boolean)
      .join('、') || '—'
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '已配置部门',
      value: total.value,
      description: '当前可见范围',
      icon: 'ri:building-2-line'
    },
    {
      label: '执行人员',
      value: new Set(
        rows.value.flatMap((row) => row.employees.map((item) => item.employee?.id).filter(Boolean))
      ).size,
      description: '去重人员',
      icon: 'ri:team-line',
      tone: 'primary'
    },
    {
      label: '升级规则',
      value: rows.value.reduce((sum, row) => sum + row.escalationRules.length, 0),
      description: '启用中的通知规则',
      icon: 'ri:alarm-warning-line',
      tone: 'warning'
    }
  ])
  const fetchData = async () => {
    const result = await fetchPmisDepartmentSettings(props.kind, {
      departmentIds: departmentIds.value
    })
    rows.value = result.data
    total.value = result.total
    return result
  }
  const refresh = () => void tableRef.value?.refreshData()
  const changeDepartment = (ids: string[]) => {
    departmentIds.value = ids
    void tableRef.value?.refreshContext()
  }
  const open = (row?: PmisDepartmentSetting) =>
    void dialogRef.value?.handleOpen({
      kind: props.kind,
      row,
      tenantId: row?.tenantId || effectiveTenantId.value || undefined
    })
  const show = async (row: PmisDepartmentSetting) => {
    detailRow.value = row
    await nextTick()
    await drawerRef.value?.handleOpen(row, {
      showFooter: false,
      contentHeight: 'calc(100vh - 90px)'
    })
  }
  const remove = async (row: PmisDepartmentSetting) => {
    await confirmAction(
      `确定删除 ${row.department?.departmentName || '该部门'} 的${title.value}吗？`,
      `删除${title.value}`,
      { type: 'warning' }
    )
    await deletePmisDepartmentSettings([row.id], props.kind)
    refresh()
  }
  const columnsFactory = (): ColumnOption<PmisDepartmentSetting>[] => [
    { type: 'globalIndex', label: '序号', width: 70, fixed: 'left' },
    {
      prop: 'department',
      label: '部门 / 产线',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => (
        <div>
          <button type="button" class="pmis-setting__link" onClick={() => void show(row)}>
            {row.department?.departmentName || '—'}
          </button>
          <small class="pmis-setting__sub">{row.department?.departmentCode}</small>
        </div>
      )
    },
    {
      prop: 'responsible',
      label: props.kind === 'maintenance' ? '保养执行人' : '维修人员',
      minWidth: 180,
      formatter: (row) => people(row, props.kind === 'maintenance' ? 'responsible' : 'repairer')
    },
    {
      prop: 'confirmer',
      label: '确认人',
      minWidth: 160,
      formatter: (row) => people(row, 'confirmer')
    },
    {
      prop: 'notificationMethods',
      label: '通知方式',
      minWidth: 150,
      formatter: (row) => notificationDisplay(row.notificationMethods)
    },
    {
      prop: 'escalationRules',
      label: '超时升级',
      minWidth: 140,
      formatter: (row) =>
        row.escalationRules.length ? `${row.escalationRules[0].delayMinutes} 分钟` : '未配置'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 150,
      fixed: 'right',
      formatter: (row) => (
        <div>
          <ArtButtonTable
            permission={permissions.value.view}
            type="view"
            onClick={() => void show(row)}
          />
          <ArtButtonTable
            permission={permissions.value.edit}
            type="edit"
            onClick={() => open(row)}
          />
          <ArtButtonTable
            permission={permissions.value.delete}
            type="delete"
            onClick={() => void remove(row)}
          />
        </div>
      )
    }
  ]
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permissions.value.add,
      onClick: () => open()
    },
    { type: 'export', permission: permissions.value.export, exportFilename: title.value }
  ])
  const detailDescriptions = computed(() =>
    detailRow.value
      ? [
          {
            key: 'department',
            label: '部门 / 产线',
            value: detailRow.value.department?.departmentName || '—'
          },
          {
            key: 'responsible',
            label: props.kind === 'maintenance' ? '保养执行人' : '维修人员',
            value: people(
              detailRow.value,
              props.kind === 'maintenance' ? 'responsible' : 'repairer'
            )
          },
          { key: 'confirmer', label: '确认人', value: people(detailRow.value, 'confirmer') },
          {
            key: 'notification',
            label: '通知方式',
            render: () => notificationDisplay(detailRow.value?.notificationMethods ?? [])
          },
          {
            key: 'photo',
            label: '作业相册',
            value: detailRow.value.requireAlbumPhoto ? '必须上传作业前后图片' : '按方案要求上传'
          },
          {
            key: 'urgency',
            label: '维修完成时限',
            render: () =>
              props.kind === 'repair' && detailRow.value?.urgencyRules.length ? (
                <div class="pmis-setting__rule-summary">
                  {detailRow.value.urgencyRules.map((rule) => (
                    <span key={rule.urgency}>
                      <ArtDictDisplay
                        dictCode="pmisRepairUrgency"
                        value={rule.urgency}
                        display="text"
                      />
                      {` ${rule.requiredHours} 小时`}
                    </span>
                  ))}
                </div>
              ) : (
                '—'
              ),
            span: 2
          }
        ]
      : []
  )
  void Promise.all(
    ['pmisNotificationMethod', 'pmisRepairUrgency'].map((code) => userStore.ensureDictLoaded(code))
  )
</script>

<style scoped lang="scss">
  .pmis-setting__body,
  .pmis-setting__content {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .pmis-setting__content {
    width: 100%;
    overflow: hidden;
  }

  :deep(.pmis-setting__sub) {
    display: block;
    margin-top: 3px;
    color: var(--el-text-color-secondary);
  }

  :deep(.pmis-setting__link) {
    padding: 0;
    font: inherit;
    font-weight: 650;
    color: var(--theme-color);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--theme-color) 45%, transparent);
    text-underline-offset: 3px;
    cursor: pointer;
    background: transparent;
    border: 0;
  }

  :deep(.pmis-setting__link:focus-visible) {
    outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
    outline-offset: 3px;
  }

  .pmis-setting__dict-list,
  .pmis-setting__rule-summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2);
    align-items: center;
  }

  .pmis-setting__rule-list {
    display: grid;
    gap: var(--art-space-2);
    padding: 0;
    margin: 0;
    list-style: none;

    li {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: var(--art-space-3);
      align-items: center;
      padding: var(--art-space-3) 0;
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
</style>
