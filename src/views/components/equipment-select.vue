<template>
  <ArtDataSelect
    mode="table"
    :multiple="multiple"
    :model-value="multiple ? modelValues : modelValue"
    :selected-data="selectedData"
    :api-fn="fetchOptions"
    :columns="columns"
    :title="multiple ? '选择适用设备' : '选择设备'"
    subtitle="数据来自生产设备主档，仅显示当前租户已启用设备"
    :placeholder="multiple ? '选择一台或多台生产设备' : '请选择一台生产设备'"
    search-placeholder="搜索设备编号或设备名称"
    row-key="id"
    :label-key="equipmentLabel"
    :description-key="equipmentDescription"
    empty-text="暂无可选设备"
    empty-description="请先在 MDM 生产设备中维护已启用设备及部门/产线归属。"
    show-pagination
    :page-size="10"
    :disabled="!tenantId"
    @update:model-value="updateValue"
    @update:selected-data="emit('update:selectedData', $event)"
  />
</template>

<script setup lang="ts">
  import { normalizeSingleStringKey, normalizeStringList } from '@/utils/form/normalize'

  import ArtDataSelect from '@/components/core/forms/art-data-select/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectKey
  } from '@/components/core/forms/art-data-select/types'
  import { fetchPmisEquipmentOptions, type PmisEquipmentOption } from '@pmis/api'

  defineOptions({ name: 'PmisEquipmentSelect' })
  const props = withDefaults(
    defineProps<{
      modelValue?: string
      modelValues?: string[]
      multiple?: boolean
      selectedData?: PmisEquipmentOption[]
      tenantId?: string | null
    }>(),
    {
      modelValue: undefined,
      modelValues: () => [],
      multiple: false,
      selectedData: () => [],
      tenantId: null
    }
  )
  const emit = defineEmits<{
    'update:modelValue': [value: string | undefined]
    'update:modelValues': [value: string[]]
    'update:selectedData': [rows: PmisEquipmentOption[]]
  }>()
  const equipmentLabel = (row: PmisEquipmentOption) => row.equipmentName || '未命名设备'
  const equipmentDescription = (row: PmisEquipmentOption) =>
    [row.equipmentCode, row.department?.departmentName].filter(Boolean).join(' · ')
  const columns: DataSelectColumn<PmisEquipmentOption>[] = [
    { prop: 'equipmentCode', label: '设备编号', minWidth: 150 },
    { prop: 'equipmentName', label: '设备名称', minWidth: 190 },
    {
      prop: 'department',
      label: '部门 / 产线',
      minWidth: 180,
      formatter: (row) => row.department?.departmentName || '待分配'
    },
    {
      prop: 'operationStatus',
      label: '运行状态',
      width: 110,
      dict: { code: 'mdmEquipmentOperationStatus', display: 'auto' }
    }
  ]
  const fetchOptions = async (params: DataSelectFetchParams) =>
    fetchPmisEquipmentOptions({
      current: params.page,
      size: params.pageSize,
      keyword: params.keyword,
      tenantId: props.tenantId || undefined
    })

  const updateValue = (value: DataSelectKey | DataSelectKey[] | undefined): void => {
    if (props.multiple) emit('update:modelValues', normalizeStringList(value))
    else emit('update:modelValue', normalizeSingleStringKey(value))
  }
</script>
