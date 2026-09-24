<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="pmis-task-editor">
      <ArtEntitySummary spaced>
        <template #icon><ArtSvgIcon :icon="config.icon" /></template>
        <small>MANUAL TASK</small><strong>{{ kindLabel }}临时任务</strong
        ><p>临时任务使用统一方案项目和执行标准，保存后进入同一任务闭环。</p>
      </ArtEntitySummary>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #equipmentId
          ><PmisEquipmentSelect
            v-model="form.equipmentId"
            v-model:selected-data="selectedEquipment"
            :tenant-id="form.tenantId"
        /></template>
        <template #responsibleId
          ><ArtEmployeeSelect
            v-model="form.responsibleId"
            v-model:selected-data="selectedResponsible"
            :tenant-id="form.tenantId"
        /></template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { normalizeNullableText } from '@/utils/form/normalize'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import {
    fetchPmisPlans,
    savePmisTask,
    type PmisPlan,
    type PmisPlanKind,
    type PmisEquipmentOption,
    type PmisTask
  } from '@pmis/api'
  import PmisEquipmentSelect from './equipment-select.vue'
  import { toEmployeeSelectedData } from './business-records'
  import { pmisKindConfig } from './business-config'
  export interface TaskEditorOpenData {
    kind: PmisPlanKind
    row?: PmisTask
    copy?: boolean
  }
  interface FormModel {
    id?: string
    tenantId: string
    planId: string
    equipmentId?: string
    plannedDate: string
    responsibleId?: string
    executionSummary: string
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<TaskEditorOpenData>>()
  const formRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const kind = ref<PmisPlanKind>('maintenance')
  const plans = shallowRef<PmisPlan[]>([])
  const selectedEquipment = shallowRef<PmisEquipmentOption[]>([])
  const selectedResponsible = shallowRef<EmployeeIntegrationItem[]>([])
  const initial = (): FormModel => ({
    tenantId: '',
    planId: '',
    equipmentId: undefined,
    plannedDate: new Date().toISOString().slice(0, 10),
    responsibleId: undefined,
    executionSummary: ''
  })
  const form = reactive<FormModel>(initial())
  const config = computed(() => pmisKindConfig(kind.value))
  const kindLabel = computed(() => config.value.label)
  const items = computed<FormItem[]>(() => [
    {
      label: '任务方案',
      key: 'planId',
      type: 'select',
      options: plans.value.map((p) => ({ label: p.planName, value: p.id })),
      props: { filterable: true, placeholder: `选择${kindLabel.value}方案` }
    },
    {
      label: '计划日期',
      key: 'plannedDate',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', clearable: false }
    },
    { label: '执行设备', key: 'equipmentId', type: 'slot', span: 12 },
    { label: '负责人', key: 'responsibleId', type: 'slot', span: 12 },
    {
      label: '任务说明',
      key: 'executionSummary',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 1000, showWordLimit: true, resize: 'none' }
    }
  ])
  const rules: FormRules = {
    planId: [{ required: true, message: '请选择任务方案', trigger: 'change' }],
    plannedDate: [{ required: true, message: '请选择计划日期', trigger: 'change' }],
    equipmentId: [{ required: true, message: '请选择一台执行设备', trigger: 'change' }]
  }
  watch(
    () => form.planId,
    (id) => {
      const plan = plans.value.find((p) => p.id === id)
      if (plan && form.tenantId !== plan.tenantId) {
        form.tenantId = plan.tenantId
        form.equipmentId = undefined
        form.responsibleId = undefined
        selectedEquipment.value = []
        selectedResponsible.value = []
      }
    }
  )
  const submit = async () => {
    await formRef.value?.validate()
    if (!form.equipmentId) return false
    await savePmisTask(
      {
        tenantId: form.tenantId,
        planId: form.planId,
        equipmentId: form.equipmentId,
        plannedDate: form.plannedDate,
        responsibleEmployeeId: form.responsibleId || null,
        taskSource: 'manual',
        executionSummary: normalizeNullableText(form.executionSummary)
      },
      form.id
    )
    emit('success')
    return true
  }
  const handleOpen = async (data: TaskEditorOpenData) => {
    kind.value = data.kind
    plans.value = []
    Object.assign(form, initial())
    selectedEquipment.value = []
    selectedResponsible.value = []
    if (data.row) {
      Object.assign(form, {
        id: data.copy ? undefined : data.row.id,
        tenantId: data.row.tenantId,
        planId: data.row.plan.id,
        equipmentId: data.row.equipment.id,
        plannedDate: data.row.plannedDate,
        responsibleId: data.row.responsible?.id,
        executionSummary: data.copy
          ? `${data.row.executionSummary || ''}（复制）`
          : data.row.executionSummary || ''
      })
      selectedEquipment.value = [data.row.equipment]
      selectedResponsible.value = toEmployeeSelectedData(data.row.tenantId, [data.row.responsible])
    }
    await dialogRef.value?.handleOpen(data, {
      title: `${data.copy ? '复制' : data.row ? '编辑' : '新增'}${kindLabel.value}任务`,
      subtitle: data.row?.taskNo || '系统将生成月度三位流水任务号',
      confirmText: '保存任务',
      loading: true,
      loadingText: '正在加载可用计划…',
      onOpen: async (_openData, api) => {
        await nextTick()
        formRef.value?.clearValidate()
        try {
          plans.value = (
            await fetchPmisPlans(data.kind, { current: 1, size: 500, status: 'enabled' })
          ).data
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss"></style>
