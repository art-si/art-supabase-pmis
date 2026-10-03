<template>
  <div class="pmis-repair-analysis art-page-view business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="REPAIR PERFORMANCE"
      title="维修分析"
      description="按维修人员汇总任务量、闭环率和逾期风险，识别需要支援的人员与部门。"
      icon="ri:bar-chart-grouped-line"
      :tags="[
        { label: dateCaption, type: 'primary' },
        { label: '逾期优先', type: overdue ? 'danger' : 'success' }
      ]"
      :metrics="metrics"
    >
      <template #actions>
        <ArtExcelExport
          v-auth="pmisRepairAnalysisPermission"
          :data="exportRows"
          :columns="exportColumns"
          filename="维修分析"
          :sheet-name="dateCaption"
          button-text="导出分析"
          type="warning"
          :disable-when-empty="false"
          plain
          auto-index
        >
          <ArtSvgIcon icon="ri:file-excel-2-line" />导出分析
        </ArtExcelExport>
      </template>
    </BusinessWorkspaceHeader>
    <ElScrollbar class="pmis-repair-analysis__scroll"
      ><div class="pmis-repair-analysis__body"
        ><ArtSearchBar
          v-model="query"
          :items="searchItems"
          :span="8"
          :label-width="72"
          :show-expand="false"
          :is-expand="true"
          :disabled-search="loading"
          @search="load"
          @reset="reset" /><div class="pmis-repair-analysis__grid"
          ><ArtSectionCard
            title="维修人员任务排行"
            subtitle="按任务总量降序，结合闭环率与逾期负荷识别支援对象"
            :loading="loading"
            :error="error"
            :empty="!loading && !error && ranking.length === 0"
            empty-title="暂无人员绩效数据"
            empty-description="当前统计周期内没有维修工单，调整日期后可重新查询。"
            :min-height="380"
            @retry="load"
            ><template #actions
              ><ElTag type="primary" effect="plain" round
                >{{ ranking.length }} 名人员</ElTag
              ></template
            ><div class="pmis-repair-analysis__ranking"
              ><article v-for="(item, index) in ranking" :key="item.id"
                ><span class="pmis-repair-analysis__rank">{{
                  String(index + 1).padStart(2, '0')
                }}</span
                ><div class="pmis-repair-analysis__identity"
                  ><strong>{{ item.label }}</strong
                  ><small>{{ item.total }} 单任务 · {{ item.completed }} 单闭环</small></div
                ><div class="pmis-repair-analysis__progress"
                  ><ElProgress :percentage="item.rate" :stroke-width="8" :show-text="false" /><small
                    >{{ item.rate }}% 闭环率</small
                  ></div
                ><div class="pmis-repair-analysis__facts"
                  ><span
                    ><small>处理中</small><strong>{{ item.active }}</strong></span
                  ><span :class="{ 'is-risk': item.overdue }"
                    ><small>已逾期</small><strong>{{ item.overdue }}</strong></span
                  ></div
                ></article
              ></div
            ></ArtSectionCard
          ><ArtSectionCard
            title="维修状态分布"
            subtitle="当前统计周期内的工单结构与占比"
            :loading="loading"
            :error="error"
            :empty="!loading && !error && rows.length === 0"
            empty-title="暂无状态分布"
            empty-description="维修工单进入当前周期后，将在这里形成状态结构。"
            :min-height="380"
            @retry="load"
            ><template #actions
              ><ElTag :type="overdue ? 'danger' : 'success'" effect="plain" round>{{
                overdue ? `${overdue} 单逾期` : '暂无逾期'
              }}</ElTag></template
            ><div class="pmis-repair-analysis__status"
              ><article v-for="item in statusCards" :key="item.status" :class="`is-${item.status}`"
                ><span class="pmis-repair-analysis__status-icon"
                  ><ArtSvgIcon :icon="item.icon" /></span
                ><div
                  ><small
                    ><ArtDictDisplay
                      dict-code="pmisRepairStatus"
                      :value="item.status"
                      display="text" /></small
                  ><strong>{{ item.value }}</strong></div
                ><div class="pmis-repair-analysis__status-share"
                  ><span>{{ item.percentage }}%</span
                  ><i
                    ><b
                      :style="{ width: `${item.percentage}%` }"
                    ></b></i></div></article></div></ArtSectionCard></div></div
    ></ElScrollbar>
  </div>
</template>
<script setup lang="ts">
  import dayjs from 'dayjs'
  import ArtSearchBar, {
    type SearchFormItem
  } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtExcelExport from '@/components/core/forms/art-excel-export/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { fetchPmisRepairTaskSnapshot, type PmisRepairTask } from '@pmis/api'
  import { pmisRepairAnalysisPermission } from './business-permissions'
  const initial = () => ({
    dateRange: [
      dayjs().startOf('month').format('YYYY-MM-DD'),
      dayjs().endOf('month').format('YYYY-MM-DD')
    ]
  })
  const query = reactive(initial())
  const rows = shallowRef<PmisRepairTask[]>([])
  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const loading = ref(false)
  const error = ref('')
  const dateCaption = computed(() => `${query.dateRange[0]} 至 ${query.dateRange[1]}`)
  const overdue = computed(() => rows.value.filter((r) => r.displayStatus === 'overdue').length)
  const completed = computed(() => rows.value.filter((r) => r.status === 'completed').length)
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '维修任务',
      value: rows.value.length,
      description: dateCaption.value,
      icon: 'ri:file-list-3-line'
    },
    {
      label: '已完成',
      value: completed.value,
      description: `闭环率 ${rows.value.length ? Math.round((completed.value / rows.value.length) * 100) : 0}%`,
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '维修中',
      value: rows.value.filter((r) => r.status === 'in_progress').length,
      description: '当前负荷',
      icon: 'ri:loader-4-line',
      tone: 'primary'
    },
    {
      label: '已逾期',
      value: overdue.value,
      description: '需要优先处理',
      icon: 'ri:alarm-warning-line',
      tone: overdue.value ? 'danger' : 'info'
    }
  ])
  const searchItems: SearchFormItem[] = [
    {
      label: '统计日期',
      key: 'dateRange',
      type: 'daterange',
      props: { valueFormat: 'YYYY-MM-DD', rangeSeparator: '至' }
    }
  ]
  const ranking = computed(() => {
    const groups = new Map<string, PmisRepairTask[]>()
    rows.value.forEach((r) => {
      const key = r.repairer?.id || 'unassigned'
      groups.set(key, [...(groups.get(key) || []), r])
    })
    return [...groups.entries()]
      .map(([id, list]) => {
        const done = list.filter((r) => r.status === 'completed').length
        return {
          id,
          label: list[0]?.repairer?.employeeName || '未派工',
          total: list.length,
          completed: done,
          active: list.filter((r) =>
            ['reported', 'in_progress', 'pending_confirm'].includes(r.status)
          ).length,
          overdue: list.filter((r) => r.displayStatus === 'overdue').length,
          rate: Math.round((done / list.length) * 100)
        }
      })
      .sort((a, b) => b.total - a.total || b.overdue - a.overdue)
  })
  const statusCards = computed(() => [
    {
      status: 'reported',
      value: rows.value.filter((r) => r.status === 'reported').length,
      icon: 'ri:inbox-archive-line',
      percentage: percentageOf(rows.value.filter((r) => r.status === 'reported').length)
    },
    {
      status: 'in_progress',
      value: rows.value.filter((r) => r.status === 'in_progress').length,
      icon: 'ri:tools-line',
      percentage: percentageOf(rows.value.filter((r) => r.status === 'in_progress').length)
    },
    {
      status: 'pending_confirm',
      value: rows.value.filter((r) => r.status === 'pending_confirm').length,
      icon: 'ri:shield-check-line',
      percentage: percentageOf(rows.value.filter((r) => r.status === 'pending_confirm').length)
    },
    {
      status: 'completed',
      value: completed.value,
      icon: 'ri:checkbox-circle-line',
      percentage: percentageOf(completed.value)
    }
  ])
  const exportRows = computed(() =>
    ranking.value.map((item) => ({
      repairer: item.label,
      total: item.total,
      completed: item.completed,
      overdue: item.overdue,
      completionRate: `${item.rate}%`
    }))
  )
  const exportColumns = {
    repairer: { title: '维修人员', width: 20 },
    total: { title: '任务数', width: 12 },
    completed: { title: '已完成', width: 12 },
    overdue: { title: '已逾期', width: 12 },
    completionRate: { title: '闭环率', width: 14 }
  }
  let loadVersion = 0
  const load = async () => {
    const version = ++loadVersion
    loading.value = true
    error.value = ''
    rows.value = []
    try {
      const result = await fetchPmisRepairTaskSnapshot({
        dateFrom: query.dateRange[0],
        dateTo: query.dateRange[1]
      })
      if (version === loadVersion) rows.value = result
    } catch {
      if (version === loadVersion) error.value = '维修分析加载失败，请重试。'
    } finally {
      if (version === loadVersion) loading.value = false
    }
  }
  const reset = () => {
    Object.assign(query, initial())
    void load()
  }
  function percentageOf(value: number): number {
    return rows.value.length ? Math.round((value / rows.value.length) * 100) : 0
  }
  void userStore.ensureDictLoaded('pmisRepairStatus')
  watch(
    () => tenantScopeStore.revision,
    () => void load()
  )
  void load()
</script>
<style scoped lang="scss">
  .pmis-repair-analysis__scroll {
    flex: 1;
    min-height: 0;
  }

  .pmis-repair-analysis__body {
    display: grid;
    gap: 16px;
  }

  .pmis-repair-analysis__grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    gap: 16px;
  }

  .pmis-repair-analysis__ranking,
  .pmis-repair-analysis__status {
    display: grid;
    gap: 10px;
  }

  .pmis-repair-analysis__ranking article {
    display: grid;
    grid-template-columns: 40px minmax(150px, 1fr) minmax(130px, 0.9fr) auto;
    gap: 14px;
    align-items: center;
    padding: 14px;
    background: color-mix(in srgb, var(--art-gray-100) 52%, var(--default-box-color));
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--custom-radius);
    transition:
      border-color 0.18s ease,
      transform 0.18s ease;
  }

  .pmis-repair-analysis__ranking article:hover {
    border-color: color-mix(in srgb, var(--theme-color) 35%, var(--el-border-color-lighter));
    transform: translateY(-1px);
  }

  .pmis-repair-analysis__rank {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
    border-radius: var(--el-border-radius-base);
  }

  .pmis-repair-analysis__identity small,
  .pmis-repair-analysis__progress small,
  .pmis-repair-analysis__facts small {
    display: block;
    margin-top: 3px;
    color: var(--el-text-color-secondary);
  }

  .pmis-repair-analysis__progress {
    display: grid;
    gap: 5px;
  }

  .pmis-repair-analysis__facts {
    display: flex;
    gap: var(--art-space-4);
  }

  .pmis-repair-analysis__facts > span {
    min-width: 52px;
  }

  .pmis-repair-analysis__facts strong {
    display: block;
    margin-top: 2px;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }

  .pmis-repair-analysis__facts .is-risk {
    color: var(--el-color-danger);
  }

  .pmis-repair-analysis__status article {
    display: grid;
    grid-template-columns: 44px minmax(80px, 1fr) minmax(90px, 0.8fr);
    gap: 12px;
    align-items: center;
    padding: 16px;
    background: color-mix(in srgb, var(--art-gray-100) 56%, var(--default-box-color));
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--custom-radius);
  }

  .pmis-repair-analysis__status-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
    border-radius: var(--el-border-radius-base);
  }

  .pmis-repair-analysis__status-icon > :first-child {
    width: 21px;
    height: 21px;
  }

  .pmis-repair-analysis__status small,
  .pmis-repair-analysis__status strong {
    display: block;
  }

  .pmis-repair-analysis__status strong {
    margin-top: 3px;
    font-size: 22px;
  }

  .pmis-repair-analysis__status-share {
    display: grid;
    gap: 7px;
    color: var(--el-text-color-secondary);
    text-align: right;
  }

  .pmis-repair-analysis__status-share i {
    display: block;
    width: 100%;
    height: 5px;
    overflow: hidden;
    background: var(--el-fill-color);
    border-radius: 999px;
  }

  .pmis-repair-analysis__status-share b {
    display: block;
    height: 100%;
    background: var(--theme-color);
    border-radius: inherit;
  }

  @media (width<=980px) {
    .pmis-repair-analysis__grid {
      grid-template-columns: 1fr;
    }
  }

  @media (width<=640px) {
    .pmis-repair-analysis__ranking article {
      grid-template-columns: 34px 1fr;
    }

    .pmis-repair-analysis__ranking article > :nth-child(n + 3) {
      grid-column: 1/-1;
    }
  }
</style>
