<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="pmis-plan-dialog min-w-0">
      <ArtEntitySummary spaced>
        <template #icon><ArtSvgIcon :icon="config.icon" /></template>
        <small>{{ config.eyebrow }}</small>
        <strong>{{ form.planName || `新${kindLabel}方案` }}</strong>
        <p>方案保存后自动生成未来 62 天的设备任务，执行记录继续保留用于追溯。</p>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="formItems"
        :rules="rules"
        :span="12"
        :gutter="22"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #equipmentIds>
          <PmisEquipmentSelect
            v-model:model-values="form.equipmentIds"
            v-model:selected-data="selectedEquipment"
            multiple
            :tenant-id="form.tenantId"
          />
        </template>
        <template #responsibleEmployeeIds>
          <ArtEmployeeSelect
            v-model:model-values="form.responsibleEmployeeIds"
            v-model:selected-data="selectedEmployees"
            multiple
            :tenant-id="form.tenantId"
          />
        </template>
        <template #sopUrl>
          <ArtUploadFile
            v-model="form.sopUrl"
            :resource-tenant-id="form.tenantId"
            :disabled="!form.tenantId"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
            title="上传作业指导书"
            tip="支持 PDF、Office 文档或图片，作为现场执行依据"
          />
        </template>
        <template #items>
          <PmisPlanItemEditor ref="itemEditorRef" v-model="form.items" :item-noun="itemNoun" />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import type { FormRules } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    savePmisPlan,
    type PmisEquipmentOption,
    type PmisPlan,
    type PmisPlanFrequency,
    type PmisPlanInput,
    type PmisPlanKind
  } from '@pmis/api'
  import PmisEquipmentSelect from './equipment-select.vue'
  import PmisPlanItemEditor from './plan-item-editor.vue'
  import { pmisKindConfig } from './business-config'

  export interface PmisPlanDialogOpenData {
    kind: PmisPlanKind
    row?: PmisPlan
    copy?: boolean
    targetTenantId?: string
    tenantOptions: Array<{ label: string; value: string }>
  }
  interface PlanForm extends PmisPlanInput {
    id?: string
    sopUrl: string
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }
  interface PlanItemEditorExpose {
    validate: () => Promise<{ valid: boolean }>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<PmisPlanDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const itemEditorRef = ref<PlanItemEditorExpose>()
  const kind = ref<PmisPlanKind>('inspection')
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const selectedEquipment = shallowRef<PmisEquipmentOption[]>([])
  const selectedEmployees = shallowRef<EmployeeIntegrationItem[]>([])
  const config = computed(() => pmisKindConfig(kind.value))
  const kindLabel = computed(() => config.value.label)
  const itemNoun = computed(() =>
    ['maintenance', 'preventive'].includes(kind.value) ? '作业项目' : '检查项目'
  )
  const initialForm = (planKind: PmisPlanKind = 'inspection'): PlanForm => ({
    id: undefined,
    tenantId: '',
    planKind,
    planName: '',
    frequency: planKind === 'inspection' ? 'daily' : 'weekly',
    frequencyValue: planKind === 'inspection' ? null : 1,
    advanceDays: 0,
    requiredDays: 1,
    holidayPolicy: 'postpone',
    notificationRules: [],
    requirePhoto: false,
    sopFiles: [],
    sopUrl: '',
    status: 'enabled',
    remark: '',
    items: [
      {
        itemName: '',
        requirement: '',
        judgmentRule: '',
        requirePhoto: false,
        sort: 10
      }
    ],
    equipmentIds: [],
    responsibleEmployeeIds: []
  })
  const form = reactive<PlanForm>(initialForm())
  const dictOptions = (code: string) => getDictMap.value[code] ?? []
  const frequencyValueItem = computed<FormItem | null>(() => {
    if (form.frequency === 'weekly')
      return {
        label: '执行星期',
        key: 'frequencyValue',
        type: 'select',
        options: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => ({
          label,
          value: index + 1
        }))
      }
    if (form.frequency === 'monthly' || form.frequency === 'quarterly')
      return {
        label: '执行日期',
        key: 'frequencyValue',
        type: 'number',
        help: '按每月第几日执行，29—31 日请统一配置为 28 日。',
        props: { min: 1, max: 28, precision: 0, class: '!w-full' }
      }
    if (form.frequency === 'yearly')
      return {
        label: '执行月份',
        key: 'frequencyValue',
        type: 'number',
        props: { min: 1, max: 12, precision: 0, class: '!w-full' }
      }
    return null
  })
  const formItems = computed<FormItem[]>(() => [
    { label: '方案信息', key: 'basicSection', type: 'divider', span: 24 },
    ...(tenantOptions.value.length > 1
      ? [
          {
            label: '目标租户',
            key: 'tenantId',
            type: 'select',
            options: tenantOptions.value,
            props: { disabled: Boolean(form.id), filterable: true }
          } as FormItem
        ]
      : []),
    {
      label: `${kindLabel.value}方案名称`,
      key: 'planName',
      type: 'input',
      props: { maxlength: 120, clearable: true, placeholder: `请输入${kindLabel.value}方案名称` }
    },
    {
      label: '执行频次',
      key: 'frequency',
      type: 'select',
      options: dictOptions('pmisPlanFrequency')
    },
    ...(frequencyValueItem.value ? [frequencyValueItem.value] : []),
    {
      label: '提前生成天数',
      key: 'advanceDays',
      type: 'number',
      props: { min: 0, max: 365, precision: 0, class: '!w-full' }
    },
    {
      label: '要求完成时长（天）',
      key: 'requiredDays',
      type: 'number',
      props: { min: 1, max: 365, precision: 0, class: '!w-full' }
    },
    {
      label: '遇节假日',
      key: 'holidayPolicy',
      type: 'select',
      options: dictOptions('pmisHolidayPolicy')
    },
    {
      label: '方案状态',
      key: 'status',
      type: 'select',
      options: dictOptions('commonEnabledStatus')
    },
    {
      label: '任务必须附带图片',
      key: 'requirePhoto',
      type: 'switch',
      help: '开启后，现场提交任务前必须上传检查图片。'
    },
    {
      label: '方案说明',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 1000, showWordLimit: true, resize: 'none' }
    },
    { label: '执行对象', key: 'targetSection', type: 'divider', span: 24 },
    { label: '适用设备', key: 'equipmentIds', type: 'slot', span: 12 },
    { label: '负责人', key: 'responsibleEmployeeIds', type: 'slot', span: 12 },
    { label: 'SOP / 作业指导书', key: 'sopUrl', type: 'slot', span: 24 },
    { label: itemNoun.value, key: 'itemSection', type: 'divider', span: 24 },
    { label: '', key: 'items', type: 'slot', span: 24, hideLabel: true }
  ])
  const rules: FormRules = {
    tenantId: [{ required: true, message: '请选择目标租户', trigger: 'change' }],
    planName: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
    frequency: [{ required: true, message: '请选择执行频次', trigger: 'change' }],
    equipmentIds: [
      {
        type: 'array',
        required: true,
        min: 1,
        message: '请至少选择一台适用设备',
        trigger: 'change'
      }
    ],
    responsibleEmployeeIds: [
      { type: 'array', required: true, min: 1, message: '请至少选择一名负责人', trigger: 'change' }
    ]
  }
  const normalizeFrequencyValue = (): void => {
    const defaults: Partial<Record<PmisPlanFrequency, number | null>> = {
      daily: null,
      weekly: 1,
      tenday: null,
      monthly: 1,
      quarterly: 1,
      yearly: 1
    }
    form.frequencyValue = defaults[form.frequency] ?? null
  }
  watch(() => form.frequency, normalizeFrequencyValue)
  watch(
    () => form.tenantId,
    (value, previousValue) => {
      if (!previousValue || value === previousValue || form.id) return
      form.equipmentIds = []
      form.responsibleEmployeeIds = []
      selectedEquipment.value = []
      selectedEmployees.value = []
    }
  )

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const itemValidation = await itemEditorRef.value?.validate()
      if (itemValidation && !itemValidation.valid) return false
    } catch (error) {
      notifyFriendlyError(error, '计划校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      await savePmisPlan(
        {
          ...cloneDeep(form),
          planName: form.planName.trim(),
          remark: form.remark?.trim(),
          sopFiles: form.sopUrl ? [form.sopUrl] : [],
          items: form.items.map((item, index) => ({
            ...item,
            itemName: item.itemName.trim(),
            requirement: item.requirement.trim(),
            judgmentRule: normalizeNullableText(item.judgmentRule),
            sort: (index + 1) * 10
          }))
        },
        form.id
      )
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '计划保存失败，请检查项目和网络后重试')
      return false
    }
  }
  const handleOpen = async (data: PmisPlanDialogOpenData): Promise<void> => {
    kind.value = data.kind
    tenantOptions.value = data.tenantOptions
    Object.assign(form, initialForm(data.kind))
    selectedEquipment.value = []
    selectedEmployees.value = []
    if (data.row) {
      Object.assign(form, cloneDeep(data.row), {
        id: data.copy ? undefined : data.row.id,
        planName: data.copy ? `${data.row.planName}（副本）` : data.row.planName,
        sopUrl: String(data.row.sopFiles[0] || ''),
        equipmentIds: data.row.equipmentBindings
          .map((binding) => binding.equipment?.id)
          .filter((id): id is string => Boolean(id)),
        responsibleEmployeeIds: data.row.responsibleBindings
          .map((binding) => binding.employee?.id)
          .filter((id): id is string => Boolean(id))
      })
      selectedEquipment.value = data.row.equipmentBindings
        .map((binding) => binding.equipment)
        .filter((item): item is PmisEquipmentOption => Boolean(item))
      selectedEmployees.value = data.row.responsibleBindings
        .map((binding) => binding.employee)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => ({ ...item, employmentStatus: 'active' }))
    } else {
      form.tenantId =
        data.targetTenantId || (data.tenantOptions.length === 1 ? data.tenantOptions[0].value : '')
    }
    await dialogRef.value?.handleOpen(data, {
      title: `${data.copy ? '复制' : data.row ? '编辑' : '新增'}${kindLabel.value}方案`,
      subtitle: '统一维护执行节奏、责任人、适用设备与检查标准',
      confirmText: '保存方案',
      contentMaxHeight: 'calc(100vh - 156px)',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await Promise.all(
            ['pmisPlanFrequency', 'pmisHolidayPolicy', 'commonEnabledStatus'].map((code) =>
              userStore.ensureDictLoaded(code)
            )
          )
          await nextTick()
          formRef.value?.clearValidate()
          itemEditorRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }
  defineExpose({ handleOpen })
</script>
