<template>
  <ArtDialog ref="dialogRef" size="xl" content-height="min(620px, 70vh)">
    <div class="pmis-repair-dialog">
      <ArtEntitySummary spaced>
        <template #icon><ArtSvgIcon icon="ri:tools-line" /></template>
        <small>REPAIR WORK ORDER</small><strong>{{ form.faultSymptom || '新维修工单' }}</strong
        ><p>记录报修现象、责任人员、维修分析与现场图片，完成后进入确认闭环。</p>
      </ArtEntitySummary>
      <ArtForm
        ref="formRef"
        v-model:active-tab="activeTab"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-position="top"
      >
        <template #equipmentId
          ><PmisEquipmentSelect
            v-model="form.equipmentId"
            v-model:selected-data="selectedEquipment"
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
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import {
    savePmisRepairTask,
    type PmisRepairStatus,
    type PmisRepairTask,
    type PmisEquipmentOption,
    type PmisRepairUrgency
  } from '@pmis/api'
  import PmisEquipmentSelect from './equipment-select.vue'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  export interface RepairDialogOpenData {
    row?: PmisRepairTask
    copy?: boolean
    tenantId?: string
  }
  interface FormModel {
    id?: string
    tenantId: string
    equipmentId?: string
    urgency: PmisRepairUrgency
    faultSymptom: string
    faultPhotoFiles: string[]
    reporterId?: string
    repairerId?: string
    confirmerId?: string
    faultAnalysis: string
    faultCause: string
    solution: string
    repairPhotoFiles: string[]
    status: Exclude<PmisRepairStatus, 'overdue'>
  }
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<RepairDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref('report')
  const initial = (): FormModel => ({
    id: undefined,
    tenantId: '',
    equipmentId: undefined,
    urgency: 'normal',
    faultSymptom: '',
    faultPhotoFiles: [],
    reporterId: undefined,
    repairerId: undefined,
    confirmerId: undefined,
    faultAnalysis: '',
    faultCause: '',
    solution: '',
    repairPhotoFiles: [],
    status: 'reported'
  })
  const form = ref<FormModel>(initial())
  const selectedEquipment = shallowRef<PmisEquipmentOption[]>([])
  const selectedReporters = shallowRef<EmployeeIntegrationItem[]>([])
  const selectedRepairers = shallowRef<EmployeeIntegrationItem[]>([])
  const selectedConfirmers = shallowRef<EmployeeIntegrationItem[]>([])
  const items = computed<FormItem[]>(() => [
    { label: '报修信息', key: 'report', type: 'tab' },
    { label: '设备', key: 'equipmentId', type: 'slot', span: 12 },
    {
      label: '紧急程度',
      key: 'urgency',
      type: 'select',
      options: getDictMap.value.pmisRepairUrgency ?? []
    },
    {
      label: '故障现象',
      key: 'faultSymptom',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 1000, showWordLimit: true, resize: 'none' }
    },
    {
      label: '故障图片',
      key: 'faultPhotoFiles',
      type: 'uploadImage',
      span: 24,
      props: {
        resourceTenantId: form.value.tenantId,
        multiple: true,
        limit: 6,
        title: '上传故障图片'
      }
    },
    {
      label: '报修人',
      key: 'reporterId',
      type: 'employeeSelect',
      span: 12,
      props: {
        selectedData: selectedReporters.value,
        'onUpdate:selectedData': (rows: EmployeeIntegrationItem[]) => {
          selectedReporters.value = rows
        },
        tenantId: form.value.tenantId
      }
    },
    {
      label: '维修人员',
      key: 'repairerId',
      type: 'employeeSelect',
      span: 12,
      props: {
        selectedData: selectedRepairers.value,
        'onUpdate:selectedData': (rows: EmployeeIntegrationItem[]) => {
          selectedRepairers.value = rows
        },
        tenantId: form.value.tenantId
      }
    },
    { label: '维修处置', key: 'repair', type: 'tab' },
    {
      label: '故障分析',
      key: 'faultAnalysis',
      type: 'input',
      span: 12,
      props: { type: 'textarea', rows: 3, resize: 'none' }
    },
    {
      label: '故障原因',
      key: 'faultCause',
      type: 'input',
      span: 12,
      props: { type: 'textarea', rows: 3, resize: 'none' }
    },
    {
      label: '维修方案',
      key: 'solution',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, resize: 'none' }
    },
    {
      label: '维修图片',
      key: 'repairPhotoFiles',
      type: 'uploadImage',
      span: 12,
      props: {
        resourceTenantId: form.value.tenantId,
        multiple: true,
        limit: 6,
        title: '上传维修图片'
      }
    },
    {
      label: '确认人',
      key: 'confirmerId',
      type: 'employeeSelect',
      span: 12,
      props: {
        selectedData: selectedConfirmers.value,
        'onUpdate:selectedData': (rows: EmployeeIntegrationItem[]) => {
          selectedConfirmers.value = rows
        },
        tenantId: form.value.tenantId
      }
    },
    {
      label: '工单状态',
      key: 'status',
      type: 'select',
      options: (getDictMap.value.pmisRepairStatus ?? []).filter((item) => item.value !== 'overdue')
    }
  ])
  const rules: FormRules = {
    equipmentId: [{ required: true, message: '请选择一台设备', trigger: 'change' }],
    reporterId: [{ required: true, message: '请选择报修人', trigger: 'change' }],
    faultSymptom: [{ required: true, message: '请输入故障现象', trigger: 'blur' }]
  }
  const submit = async () => {
    await formRef.value?.validate()
    if (!form.value.equipmentId || !form.value.reporterId) return false
    await savePmisRepairTask(
      {
        tenantId: form.value.tenantId || undefined,
        equipmentId: form.value.equipmentId,
        urgency: form.value.urgency,
        faultSymptom: form.value.faultSymptom.trim(),
        faultPhotoFiles: form.value.faultPhotoFiles,
        reporterEmployeeId: form.value.reporterId,
        repairerEmployeeId: form.value.repairerId || null,
        confirmerEmployeeId: form.value.confirmerId || null,
        faultAnalysis: normalizeNullableText(form.value.faultAnalysis),
        faultCause: normalizeNullableText(form.value.faultCause),
        solution: normalizeNullableText(form.value.solution),
        repairPhotoFiles: form.value.repairPhotoFiles,
        status: form.value.status
      },
      form.value.id
    )
    emit('success')
    return true
  }
  const handleOpen = async (data: RepairDialogOpenData) => {
    activeTab.value = 'report'
    Object.assign(form.value, initial(), {
      tenantId: data.tenantId || defaultWriteTenantId.value || ''
    })
    selectedEquipment.value = []
    selectedReporters.value = []
    selectedRepairers.value = []
    selectedConfirmers.value = []
    if (data.row) {
      Object.assign(form.value, {
        id: data.copy ? undefined : data.row.id,
        tenantId: data.row.tenantId,
        equipmentId: data.row.equipment.id,
        urgency: data.row.urgency,
        faultSymptom: data.copy ? `${data.row.faultSymptom}（复制）` : data.row.faultSymptom,
        faultPhotoFiles: data.row.faultPhotoFiles.filter((v): v is string => typeof v === 'string'),
        reporterId: data.row.reporter?.id,
        repairerId: data.row.repairer?.id,
        confirmerId: data.row.confirmer?.id,
        faultAnalysis: data.row.faultAnalysis || '',
        faultCause: data.row.faultCause || '',
        solution: data.row.solution || '',
        repairPhotoFiles: data.row.repairPhotoFiles.filter(
          (v): v is string => typeof v === 'string'
        ),
        status: data.copy ? 'reported' : data.row.status
      })
      selectedEquipment.value = [data.row.equipment]
      selectedReporters.value = employeeReferenceSelection(data.row.reporter, data.row.tenantId)
      selectedRepairers.value = employeeReferenceSelection(data.row.repairer, data.row.tenantId)
      selectedConfirmers.value = employeeReferenceSelection(data.row.confirmer, data.row.tenantId)
    }
    await dialogRef.value?.handleOpen(data, {
      title: `${data.copy ? '复制' : data.row ? '编辑' : '新增'}维修工单`,
      subtitle: data.row?.workOrderNo || '系统将在保存后生成月度流水工单号',
      confirmText: '保存工单',
      contentMaxHeight: 'calc(100vh - 150px)',
      loading: true,
      loadingText: '正在加载维修选项…',
      onOpen: async (_openData, api) => {
        await nextTick()
        formRef.value?.clearValidate()
        try {
          await Promise.all(
            ['pmisRepairUrgency', 'pmisRepairStatus'].map((code) =>
              userStore.ensureDictLoaded(code)
            )
          )
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
