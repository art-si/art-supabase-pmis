<template>
  <div class="pmis-analysis art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      :eyebrow="`${config.eyebrow} · INSIGHT`"
      :title="`${kindLabel}分析`"
      :description="`按产线与设备识别${kindLabel}缺失和延误聚集区，优先处理高风险机台。`"
      :icon="config.icon"
      :tags="[
        { label: dateCaption, type: 'primary' },
        { label: '异常优先排序', type: overdue ? 'danger' : 'success' }
      ]"
      :metrics="metrics"
    >
      <template #actions>
        <ArtExcelExport
          v-auth="exportPermission"
          :data="exportRows"
          :columns="exportColumns"
          :filename="`${kindLabel}分析`"
          sheet-name="缺失统计"
          button-text="导出分析"
          type="warning"
          :disable-when-empty="false"
          plain
          auto-index
          ><ArtSvgIcon icon="ri:file-excel-2-line" />导出分析</ArtExcelExport
        >
      </template>
    </BusinessWorkspaceHeader>

    <ElScrollbar class="pmis-analysis__scroll">
      <div class="pmis-analysis__body">
        <ArtSearchBar
          :model-value="query"
          @update:model-value="replaceReactiveModel(query, $event)"
          :items="searchItems"
          :span="8"
          :label-width="72"
          :show-expand="false"
          :is-expand="true"
          :disabled-search="state.loading"
          @search="load"
          @reset="reset"
        />

        <div class="pmis-analysis__grid">
          <ArtSectionCard
            title="各产线缺失情况"
            subtitle="按延误次数降序，完成率低的产线优先"
            :loading="state.loading"
            :error="state.error"
            :empty="!state.loading && !state.error && departments.length === 0"
            empty-title="暂无产线统计"
            empty-description="当前筛选范围内还没有可汇总的任务。"
            :min-height="380"
            @retry="load"
          >
            <template #actions>
              <ElTag type="primary" effect="plain" round>{{ departments.length }} 个范围</ElTag>
            </template>
            <div class="pmis-analysis__ranking">
              <article v-for="(item, index) in departments" :key="item.id">
                <span class="pmis-analysis__rank">{{ String(index + 1).padStart(2, '0') }}</span>
                <div class="pmis-analysis__identity"
                  ><strong>{{ item.label }}</strong
                  ><small>{{ item.description }}</small></div
                >
                <div class="pmis-analysis__progress">
                  <ElProgress
                    :percentage="item.completionRate"
                    :stroke-width="8"
                    :show-text="false"
                  />
                  <small>{{ item.completionRate }}% 完成 · {{ item.overdue }} 项延误</small>
                </div>
                <div class="pmis-analysis__facts">
                  <span
                    ><small>已完成</small><strong>{{ item.completed }}</strong></span
                  >
                  <span
                    ><small>计划中</small><strong>{{ item.pending }}</strong></span
                  >
                  <span :class="{ 'is-risk': item.overdue > 0 }"
                    ><small>已延误</small><strong>{{ item.overdue }}</strong></span
                  >
                </div>
              </article>
            </div>
          </ArtSectionCard>

          <ArtSectionCard
            :title="secondaryTitle"
            :subtitle="secondarySubtitle"
            :loading="state.loading"
            :error="state.error"
            :empty="!state.loading && !state.error && equipment.length === 0"
            empty-title="暂无设备统计"
            empty-description="绑定设备并生成任务后会形成设备级分析。"
            :min-height="380"
            @retry="load"
          >
            <template #actions>
              <ElTag type="primary" effect="plain" round>{{ equipment.length }} 个对象</ElTag>
            </template>
            <div class="pmis-analysis__ranking">
              <article v-for="(item, index) in equipment" :key="item.id">
                <span class="pmis-analysis__rank">{{ String(index + 1).padStart(2, '0') }}</span>
                <div class="pmis-analysis__identity"
                  ><strong>{{ item.label }}</strong
                  ><small>{{ item.description }}</small></div
                >
                <div class="pmis-analysis__progress">
                  <ElProgress
                    :percentage="item.completionRate"
                    :stroke-width="8"
                    :show-text="false"
                  />
                  <small>{{ item.completionRate }}% 完成 · 共 {{ item.total }} 项任务</small>
                </div>
                <div class="pmis-analysis__facts">
                  <span
                    ><small>已完成</small><strong>{{ item.completed }}</strong></span
                  >
                  <span
                    ><small>计划中</small><strong>{{ item.pending }}</strong></span
                  >
                  <span :class="{ 'is-risk': item.overdue > 0 }"
                    ><small>已延误</small><strong>{{ item.overdue }}</strong></span
                  >
                </div>
              </article>
            </div>
          </ArtSectionCard>
        </div>
      </div>
    </ElScrollbar>
  </div>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import dayjs from 'dayjs'
  import ArtExcelExport from '@/components/core/forms/art-excel-export/index.vue'
  import ArtSearchBar, {
    type SearchFormItem
  } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    analyzePmisTasks,
    fetchPmisTaskSnapshot,
    summarizePmisTasks,
    type PmisAnalysisItem,
    type PmisPlanKind,
    type PmisTask
  } from '@pmis/api'
  import { pmisKindConfig } from './business-config'
  import { pmisAnalysisPermissions } from './business-permissions'

  const props = defineProps<{ kind: PmisPlanKind }>()
  const tenantScopeStore = useTenantScopeStore()
  interface AnalysisQuery {
    dateRange: string[]
  }
  const initialQuery = (): AnalysisQuery => ({
    dateRange: [
      dayjs().startOf('month').format('YYYY-MM-DD'),
      dayjs().endOf('month').format('YYYY-MM-DD')
    ]
  })
  const query = reactive<AnalysisQuery>(initialQuery())
  const state = reactive<{ loading: boolean; error: string; rows: PmisTask[] }>({
    loading: false,
    error: '',
    rows: []
  })
  const config = computed(() => pmisKindConfig(props.kind))
  const kindLabel = computed(() => config.value.label)
  const exportPermission = computed(() => pmisAnalysisPermissions[props.kind])
  const dateCaption = computed(
    () => `${query.dateRange[0] || '不限'} 至 ${query.dateRange[1] || '不限'}`
  )
  const overview = computed(() => summarizePmisTasks(state.rows))
  const overdue = computed(() => overview.value.overdue)
  const departments = computed(() => analyzePmisTasks(state.rows, 'department').slice(0, 12))
  const usePeopleDimension = computed(() => ['maintenance', 'preventive'].includes(props.kind))
  const equipment = computed(() =>
    analyzePmisTasks(state.rows, usePeopleDimension.value ? 'responsible' : 'equipment').slice(
      0,
      12
    )
  )
  const secondaryTitle = computed(() =>
    usePeopleDimension.value ? '人员逾期排行' : '各设备缺失情况'
  )
  const secondarySubtitle = computed(() =>
    usePeopleDimension.value ? '定位逾期任务集中的责任人员' : '定位经常未完成检查的具体机台'
  )
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '计划任务',
      value: overview.value.total,
      description: dateCaption.value,
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
      description: '优先处理',
      icon: 'ri:alarm-warning-line',
      tone: overview.value.overdue ? 'danger' : 'info'
    }
  ])
  const searchItems: SearchFormItem[] = [
    {
      label: '统计日期',
      key: 'dateRange',
      type: 'daterange',
      props: {
        valueFormat: 'YYYY-MM-DD',
        rangeSeparator: '至',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期'
      }
    }
  ]
  let loadVersion = 0
  const load = async (): Promise<void> => {
    const version = ++loadVersion
    state.loading = true
    state.error = ''
    state.rows = []
    try {
      const rows = await fetchPmisTaskSnapshot(props.kind, {
        dateFrom: query.dateRange[0],
        dateTo: query.dateRange[1]
      })
      if (version === loadVersion) state.rows = rows
    } catch {
      if (version === loadVersion) state.error = `${kindLabel.value}分析加载失败，请重试。`
    } finally {
      if (version === loadVersion) state.loading = false
    }
  }
  const reset = (): void => {
    Object.assign(query, initialQuery())
    void load()
  }
  const exportRows = computed(() =>
    departments.value
      .map((item: PmisAnalysisItem) => ({
        dimension: '部门 / 产线',
        name: item.label,
        total: item.total,
        completed: item.completed,
        pending: item.pending,
        overdue: item.overdue,
        completionRate: `${item.completionRate}%`
      }))
      .concat(
        equipment.value.map((item) => ({
          dimension: usePeopleDimension.value ? '责任人' : '设备',
          name: item.label,
          total: item.total,
          completed: item.completed,
          pending: item.pending,
          overdue: item.overdue,
          completionRate: `${item.completionRate}%`
        }))
      )
  )
  const exportColumns = {
    dimension: { title: '统计维度' },
    name: { title: '名称', width: 24 },
    total: { title: '任务数' },
    completed: { title: '已完成' },
    pending: { title: '计划中' },
    overdue: { title: '已延误' },
    completionRate: { title: '完成率' }
  }
  watch(
    () => tenantScopeStore.revision,
    () => void load()
  )
  void load()
</script>

<style scoped lang="scss">
  .pmis-analysis {
    &__scroll {
      flex: 1;
      min-height: 0;
    }

    &__body {
      display: grid;
      gap: 16px;
      min-width: 0;
      padding-bottom: 4px;
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    &__ranking {
      display: grid;
      gap: var(--art-space-3);
    }

    &__ranking article {
      display: grid;
      grid-template-columns: 38px minmax(150px, 1fr) minmax(150px, 0.9fr) auto;
      gap: var(--art-space-4);
      align-items: center;
      padding: var(--art-space-4);
      background: color-mix(in srgb, var(--theme-color) 2.5%, var(--el-bg-color));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__rank {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      font-size: 12px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);
    }

    &__identity strong,
    &__identity small,
    &__progress small,
    &__facts strong,
    &__facts small {
      display: block;
    }

    &__identity small,
    &__progress small,
    &__facts small {
      margin-top: 3px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    &__facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(52px, auto));
      gap: var(--art-space-3);
      padding-left: var(--art-space-4);
      border-left: 1px solid var(--el-border-color-lighter);
    }

    &__facts span {
      text-align: right;
    }

    &__facts strong {
      margin-top: 2px;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-primary);
    }

    &__facts .is-risk strong {
      color: var(--el-color-danger);
    }
  }

  @media (width <= 1280px) {
    .pmis-analysis__ranking article {
      grid-template-columns: 38px minmax(0, 1fr) auto;
    }

    .pmis-analysis__progress {
      grid-column: 2 / -1;
    }
  }

  @media (width <= 980px) {
    .pmis-analysis__grid {
      grid-template-columns: 1fr;
    }
  }

  @media (width <= 640px) {
    .pmis-analysis__ranking article {
      grid-template-columns: 34px minmax(0, 1fr);
      gap: var(--art-space-3);
    }

    .pmis-analysis__progress,
    .pmis-analysis__facts {
      grid-column: 1 / -1;
    }

    .pmis-analysis__facts {
      padding: var(--art-space-3) 0 0;
      border-top: 1px solid var(--el-border-color-lighter);
      border-left: 0;
    }
  }
</style>
