<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="pmis-setting-dialog">
      <ArtEntitySummary spaced>
        <template #icon
          ><ArtSvgIcon :icon="kind === 'maintenance' ? 'ri:tools-line' : 'ri:user-settings-line'"
        /></template>
        <strong>{{ form.departmentId ? title : '选择业务部门' }}</strong
        ><small>按部门配置默认人员、确认职责与通知升级规则</small>
      </ArtEntitySummary>
      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #responsibleEmployeeIds
          ><ArtEmployeeSelect
            v-model:model-values="form.responsibleEmployeeIds"
            v-model:selected-data="selectedResponsible"
            multiple
            :tenant-id="form.tenantId"
        /></template>
        <template #confirmerEmployeeIds
          ><ArtEmployeeSelect
            v-model:model-values="form.confirmerEmployeeIds"
            v-model:selected-data="selectedConfirmers"
            multiple
            :tenant-id="form.tenantId"
        /></template>
        <template #repairerEmployeeIds
          ><ArtEmployeeSelect
            v-model:model-values="form.repairerEmployeeIds"
            v-model:selected-data="selectedRepairers"
            multiple
            :tenant-id="form.tenantId"
        /></template>
        <template #notifyEmployeeIds
          ><ArtEmployeeSelect
            v-model:model-values="form.notifyEmployeeIds"
            v-model:selected-data="selectedNotifiers"
            multiple
            :tenant-id="form.tenantId"
        /></template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import type { FormRules } from 'element-plus'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { resolveEmployeeSelectedData } from './business-records'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchPmisDepartmentTree,
    savePmisDepartmentSetting,
    type PmisDepartmentSetting,
    type PmisSettingKind
  } from '@pmis/api'

  export interface SettingDialogOpenData {
    kind: PmisSettingKind
    row?: PmisDepartmentSetting
    tenantId?: string
  }
  interface FormModel {
    id?: string
    tenantId: string
    departmentId: string
    requireAlbumPhoto: boolean
    notificationMethods: string[]
    responsibleEmployeeIds: string[]
    confirmerEmployeeIds: string[]
    repairerEmployeeIds: string[]
    notifyEmployeeIds: string[]
    escalationMinutes: number
    normalHours: number
    urgentHours: number
    expediteHours: number
    emergencyHours: number
  }
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<SettingDialogOpenData>>()
  const formRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const kind = ref<PmisSettingKind>('maintenance')
  const departmentOptions = shallowRef<Awaited<ReturnType<typeof fetchPmisDepartmentTree>>>([])
  let loadController: AbortController | undefined
  onScopeDispose(() => loadController?.abort())
  watch(
    () => tenantScopeStore.revision,
    () => {
      loadController?.abort()
      void dialogRef.value?.handleClose()
    },
    { flush: 'sync' }
  )
  const selectedResponsible = shallowRef<EmployeeIntegrationItem[]>([])
  const selectedConfirmers = shallowRef<EmployeeIntegrationItem[]>([])
  const selectedRepairers = shallowRef<EmployeeIntegrationItem[]>([])
  const selectedNotifiers = shallowRef<EmployeeIntegrationItem[]>([])
  const initial = (): FormModel => ({
    id: undefined,
    tenantId: '',
    departmentId: '',
    requireAlbumPhoto: false,
    notificationMethods: ['wechat'],
    responsibleEmployeeIds: [],
    confirmerEmployeeIds: [],
    repairerEmployeeIds: [],
    notifyEmployeeIds: [],
    escalationMinutes: 60,
    normalHours: 24,
    urgentHours: 8,
    expediteHours: 4,
    emergencyHours: 2
  })
  const form = reactive<FormModel>(initial())
  const title = computed(() => (kind.value === 'maintenance' ? '保养设置' : '维修人员设置'))
  const notifyOptions = computed(() => getDictMap.value.pmisNotificationMethod ?? [])
  const items = computed<FormItem[]>(() => [
    { label: '基础配置', key: 'basic', type: 'divider', span: 24 },
    {
      label: '部门 / 产线',
      key: 'departmentId',
      type: 'treeSelect',
      options: departmentOptions.value,
      labelField: 'departmentName',
      valueField: 'id',
      childrenField: 'children',
      props: {
        props: { value: 'id', label: 'departmentName', children: 'children' },
        nodeKey: 'id',
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        disabled: Boolean(form.id),
        placeholder: '请选择部门 / 产线'
      }
    },
    {
      label: '通知方式',
      key: 'notificationMethods',
      type: 'select',
      options: notifyOptions.value,
      props: { multiple: true, collapseTags: true, collapseTagsTooltip: true }
    },
    ...(kind.value === 'maintenance'
      ? [
          {
            label: '保养执行人',
            key: 'responsibleEmployeeIds',
            type: 'slot',
            span: 12
          } as FormItem,
          { label: '保养确认人', key: 'confirmerEmployeeIds', type: 'slot', span: 12 } as FormItem,
          {
            label: '相册照片必填',
            key: 'requireAlbumPhoto',
            type: 'switch',
            help: '开启后，保养任务提交前必须上传作业前后图片。'
          } as FormItem
        ]
      : [
          { label: '维修人员', key: 'repairerEmployeeIds', type: 'slot', span: 12 } as FormItem,
          { label: '维修确认人', key: 'confirmerEmployeeIds', type: 'slot', span: 12 } as FormItem,
          {
            label: '普通完成时限（小时）',
            key: 'normalHours',
            type: 'number',
            props: { min: 1, max: 720, precision: 0, class: '!w-full' }
          } as FormItem,
          {
            label: '紧急完成时限（小时）',
            key: 'urgentHours',
            type: 'number',
            props: { min: 1, max: 720, precision: 0, class: '!w-full' }
          } as FormItem,
          {
            label: '加急完成时限（小时）',
            key: 'expediteHours',
            type: 'number',
            props: { min: 1, max: 720, precision: 0, class: '!w-full' }
          } as FormItem,
          {
            label: '特急完成时限（小时）',
            key: 'emergencyHours',
            type: 'number',
            props: { min: 1, max: 720, precision: 0, class: '!w-full' }
          } as FormItem
        ]),
    { label: '超时升级', key: 'escalation', type: 'divider', span: 24 },
    {
      label: '超时分钟数',
      key: 'escalationMinutes',
      type: 'number',
      props: { min: 1, max: 43200, precision: 0, class: '!w-full' }
    },
    { label: '升级通知人员', key: 'notifyEmployeeIds', type: 'slot', span: 12 }
  ])
  const rules: FormRules = {
    departmentId: [{ required: true, message: '请选择部门 / 产线', trigger: 'change' }]
  }
  const employeeIds = (row: PmisDepartmentSetting, role: string) =>
    row.employees
      .filter((item) => item.role === role)
      .map((item) => item.employee?.id)
      .filter((id): id is string => Boolean(id))
  const employeeRows = (row: PmisDepartmentSetting, role: string) =>
    row.employees
      .filter((item) => item.role === role)
      .flatMap((item) => employeeReferenceSelection(item.employee, row.tenantId))
  const submit = async () => {
    await formRef.value?.validate()
    await savePmisDepartmentSetting(
      {
        tenantId: form.tenantId || undefined,
        settingKind: kind.value,
        departmentId: form.departmentId,
        requireAlbumPhoto: form.requireAlbumPhoto,
        notificationMethods: form.notificationMethods,
        urgencyRules: [
          { urgency: 'normal', requiredHours: form.normalHours },
          { urgency: 'urgent', requiredHours: form.urgentHours },
          { urgency: 'expedite', requiredHours: form.expediteHours },
          { urgency: 'emergency', requiredHours: form.emergencyHours }
        ],
        responsibleEmployeeIds: form.responsibleEmployeeIds,
        confirmerEmployeeIds: form.confirmerEmployeeIds,
        repairerEmployeeIds: form.repairerEmployeeIds,
        escalationRules: [
          {
            delayMinutes: form.escalationMinutes,
            notificationMethods: form.notificationMethods,
            notifyEmployeeIds: form.notifyEmployeeIds
          }
        ]
      },
      form.id
    )
    emit('success')
    return true
  }
  const handleOpen = async (data: SettingDialogOpenData) => {
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    kind.value = data.kind
    Object.assign(form, initial(), { tenantId: data.tenantId || '' })
    selectedResponsible.value = []
    selectedConfirmers.value = []
    selectedRepairers.value = []
    selectedNotifiers.value = []
    if (data.row) {
      Object.assign(form, {
        id: data.row.id,
        tenantId: data.row.tenantId,
        departmentId: data.row.departmentId,
        requireAlbumPhoto: data.row.requireAlbumPhoto,
        notificationMethods: data.row.notificationMethods,
        responsibleEmployeeIds: employeeIds(data.row, 'responsible'),
        confirmerEmployeeIds: employeeIds(data.row, 'confirmer'),
        repairerEmployeeIds: employeeIds(data.row, 'repairer'),
        notifyEmployeeIds: data.row.escalationRules[0]?.notifyEmployeeIds || [],
        escalationMinutes: data.row.escalationRules[0]?.delayMinutes || 60,
        normalHours:
          data.row.urgencyRules.find((item) => item.urgency === 'normal')?.requiredHours || 24,
        urgentHours:
          data.row.urgencyRules.find((item) => item.urgency === 'urgent')?.requiredHours || 8,
        expediteHours:
          data.row.urgencyRules.find((item) => item.urgency === 'expedite')?.requiredHours || 4,
        emergencyHours:
          data.row.urgencyRules.find((item) => item.urgency === 'emergency')?.requiredHours || 2
      })
      selectedResponsible.value = employeeRows(data.row, 'responsible')
      selectedConfirmers.value = employeeRows(data.row, 'confirmer')
      selectedRepairers.value = employeeRows(data.row, 'repairer')
      selectedNotifiers.value = employeeRows(data.row, 'notifier')
    }
    departmentOptions.value = []
    await dialogRef.value?.handleOpen(data, {
      title: `${data.row ? '编辑' : '新增'}${title.value}`,
      subtitle: '同一部门仅保留一套有效配置',
      confirmText: '保存设置',
      loading: true,
      loadingText: '正在加载部门与通知方式…',
      onOpen: async (_openData, api) => {
        const isCurrent = () => !controller.signal.aborted && api.visible.value
        await nextTick()
        if (!isCurrent()) return
        formRef.value?.clearValidate()
        try {
          const options = { signal: controller.signal, showErrorMessage: false }
          const [departments, resolvedNotifiers] = await Promise.all([
            fetchPmisDepartmentTree(form.tenantId || undefined, options),
            data.row && selectedNotifiers.value.length !== form.notifyEmployeeIds.length
              ? resolveEmployeeSelectedData(data.row.tenantId, form.notifyEmployeeIds, options)
              : Promise.resolve(selectedNotifiers.value),
            userStore.ensureDictLoaded('pmisNotificationMethod')
          ])
          if (isCurrent()) {
            departmentOptions.value = departments
            selectedNotifiers.value = resolvedNotifiers
          }
        } catch (error) {
          if (!isCurrent()) return
          notifyFriendlyError(error, '部门设置选项加载失败，请重新打开后重试')
          await api.handleClose()
        } finally {
          if (isCurrent()) api.setLoading(false)
          if (loadController === controller) loadController = undefined
        }
      },
      onClose: () => controller.abort(),
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss"></style>
