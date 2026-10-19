<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div v-if="task" class="pmis-task-execution">
      <ArtEntitySummary
        :icon="taskIcon"
        :eyebrow="`${kindLabel}任务`"
        :title="task.taskNo"
        :description="`${task.equipment.equipmentName} · ${task.plan.planName} · 计划日期 ${task.plannedDate}`"
        spaced
      >
        <template #aside>
          <span class="pmis-task-execution__progress">
            {{ completedCount }} / {{ form.model.results.length }}
          </span>
        </template>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items"
        :rules="rules"
        :span="12"
        :gutter="22"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #executorEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.executorEmployeeId"
            v-model:selected-data="executorSelection"
            :tenant-id="task.tenantId"
            title="选择实际执行人"
            subtitle="执行人必须属于任务所在租户"
          />
        </template>

        <template #results>
          <div class="pmis-task-execution__items">
            <article
              v-for="(result, index) in form.model.results"
              :key="result.planItemId"
              :data-result="result.resultStatus || 'pending'"
            >
              <header>
                <span>{{ String(index + 1).padStart(2, '0') }}</span>
                <div>
                  <strong>{{ task.plan.items[index]?.itemName }}</strong>
                  <small>{{ task.plan.items[index]?.requirement }}</small>
                </div>
                <ElRadioGroup v-model="result.resultStatus" size="small">
                  <ElRadioButton
                    v-for="option in resultStatusOptions"
                    :key="option.value"
                    :value="option.value"
                    >{{ option.label }}</ElRadioButton
                  >
                </ElRadioGroup>
              </header>

              <div class="pmis-task-execution__item-fields">
                <div class="pmis-task-execution__item-copy">
                  <ElInput
                    v-model="result.resultValue"
                    maxlength="200"
                    clearable
                    placeholder="记录读数、观察值或检查结论（选填）"
                  />
                  <ElInput
                    v-model="result.remark"
                    type="textarea"
                    :rows="3"
                    maxlength="1000"
                    show-word-limit
                    resize="none"
                    :placeholder="
                      result.resultStatus === 'ng'
                        ? '请描述异常位置、现象与建议处置方式'
                        : '补充本项检查说明（选填）'
                    "
                  />
                </div>
                <div class="pmis-task-execution__photos">
                  <div>
                    <strong>现场图片</strong>
                    <small v-if="requiresPhoto(index)">此项目必须上传</small>
                    <small v-else>最多 4 张（选填）</small>
                  </div>
                  <ArtUploadImage
                    v-model="result.photoFiles"
                    :resource-tenant-id="task.tenantId"
                    multiple
                    :limit="4"
                    :size="84"
                    title="上传现场图片"
                  />
                </div>
              </div>
            </article>
          </div>
        </template>
      </ArtForm>
      <section v-if="task.plan.planKind === 'maintenance'" class="pmis-task-execution__album">
        <div
          ><strong>作业前图片</strong><small>记录保养前设备状态</small
          ><ArtUploadImage
            v-model="form.model.beforePhotoFiles"
            :resource-tenant-id="task.tenantId"
            multiple
            :limit="6"
            :size="84"
            title="上传作业前图片"
        /></div>
        <div
          ><strong>作业后图片</strong><small>记录保养完成后的设备状态</small
          ><ArtUploadImage
            v-model="form.model.afterPhotoFiles"
            :resource-tenant-id="task.tenantId"
            multiple
            :limit="6"
            :size="84"
            title="上传作业后图片"
        /></div>
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { ElMessage, type FormRules } from 'element-plus'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import { completePmisTask, type PmisTask, type PmisTaskExecutionResultInput } from '@pmis/api'
  import { pmisKindConfig } from './business-config'

  export interface PmisTaskExecutionDialogOpenData {
    task: PmisTask
  }

  type ExecutionResultStatus = PmisTaskExecutionResultInput['resultStatus'] | ''

  interface ExecutionResultForm {
    planItemId: string
    resultStatus: ExecutionResultStatus
    resultValue: string
    photoFiles: string[]
    remark: string
  }

  interface ExecutionFormModel {
    executorEmployeeId: string
    executionSummary: string
    beforePhotoFiles: string[]
    afterPhotoFiles: string[]
    results: ExecutionResultForm[]
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<PmisTaskExecutionDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const task = shallowRef<PmisTask>()
  const configuredResultStatusOptions = useDictionaryOptions('pmisTaskExecutionResult')
  const resultStatusOptions = computed(() =>
    configuredResultStatusOptions.filter((option) => ['ok', 'ng', 'exempt'].includes(option.value))
  )
  const executorSelection = shallowRef<EmployeeIntegrationItem[]>([])
  const form = reactive<{ model: ExecutionFormModel; items: FormItem[] }>({
    model: {
      executorEmployeeId: '',
      executionSummary: '',
      beforePhotoFiles: [],
      afterPhotoFiles: [],
      results: []
    },
    items: [
      { label: '执行信息', key: 'executionSection', type: 'divider', span: 24 },
      { label: '实际执行人', key: 'executorEmployeeId', type: 'slot', span: 12 },
      {
        label: '执行总结',
        key: 'executionSummary',
        type: 'input',
        span: 12,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 1000,
          showWordLimit: true,
          resize: 'none',
          placeholder: '概述本次检查情况、异常与后续建议'
        }
      },
      { label: '逐项检查', key: 'resultSection', type: 'divider', span: 24 },
      { label: '', key: 'results', type: 'slot', span: 24 }
    ]
  })
  const rules: FormRules<ExecutionFormModel> = {
    executorEmployeeId: [{ required: true, message: '请选择实际执行人', trigger: 'change' }]
  }
  const kindLabel = computed(() =>
    task.value ? pmisKindConfig(task.value.plan.planKind).label : '设备'
  )
  const itemNoun = computed(() =>
    task.value && ['maintenance', 'preventive'].includes(task.value.plan.planKind)
      ? '作业项目'
      : '检查项目'
  )
  const taskIcon = computed(() =>
    task.value ? pmisKindConfig(task.value.plan.planKind).icon : 'ri:tools-line'
  )
  const completedCount = computed(
    () => form.model.results.filter((result) => Boolean(result.resultStatus)).length
  )

  const requiresPhoto = (index: number): boolean =>
    Boolean(task.value?.plan.requirePhoto || task.value?.plan.items[index]?.requirePhoto)

  const initialize = (value: PmisTask): void => {
    const existingByItem = new Map(
      value.results.flatMap((result) =>
        result.item?.id ? [[result.item.id, result] as const] : []
      )
    )
    Object.assign(form.model, {
      executorEmployeeId: value.responsible?.id || '',
      executionSummary: value.executionSummary || '',
      beforePhotoFiles: value.beforePhotoFiles.filter(
        (photo): photo is string => typeof photo === 'string'
      ),
      afterPhotoFiles: value.afterPhotoFiles.filter(
        (photo): photo is string => typeof photo === 'string'
      ),
      results: value.plan.items.flatMap((item) => {
        if (!item.id) return []
        const existing = existingByItem.get(item.id)
        return [
          {
            planItemId: item.id,
            resultStatus: existing?.resultStatus || '',
            resultValue: existing?.resultValue || '',
            photoFiles:
              existing?.photoFiles.filter(
                (photo): photo is string => typeof photo === 'string' && Boolean(photo)
              ) || [],
            remark: existing?.remark || ''
          }
        ]
      })
    })
    executorSelection.value = value.responsible
      ? [
          {
            id: value.responsible.id,
            tenantId: value.tenantId,
            employeeNo: value.responsible.employeeNo,
            employeeName: value.responsible.employeeName,
            employmentStatus: 'active'
          }
        ]
      : []
  }

  const isCompleteResult = (
    result: ExecutionResultForm
  ): result is ExecutionResultForm & {
    resultStatus: PmisTaskExecutionResultInput['resultStatus']
  } =>
    result.resultStatus === 'ok' || result.resultStatus === 'ng' || result.resultStatus === 'exempt'

  const handleSubmit = async (): Promise<boolean> => {
    if (!task.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (form.model.results.length !== task.value.plan.items.length) {
        ElMessage.warning(`任务${itemNoun.value}不完整，请刷新页面后重试`)
        return false
      }
      if (!form.model.results.every(isCompleteResult)) {
        ElMessage.warning(`提交完成前请填写全部${itemNoun.value}结果`)
        return false
      }
      const abnormalIndex = form.model.results.findIndex(
        (result) => result.resultStatus === 'ng' && !result.remark.trim()
      )
      if (abnormalIndex >= 0) {
        ElMessage.warning(`第 ${abnormalIndex + 1} 项为异常，请填写异常说明`)
        return false
      }
      const missingPhotoIndex = form.model.results.findIndex(
        (result, index) => requiresPhoto(index) && result.photoFiles.length === 0
      )
      if (missingPhotoIndex >= 0) {
        ElMessage.warning(`第 ${missingPhotoIndex + 1} 项必须上传现场图片`)
        return false
      }
    } catch (error) {
      notifyFriendlyError(error, '任务结果校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      await completePmisTask({
        taskId: task.value.id,
        executorEmployeeId: form.model.executorEmployeeId,
        executionSummary: normalizeNullableText(form.model.executionSummary),
        beforePhotoFiles: [...form.model.beforePhotoFiles],
        afterPhotoFiles: [...form.model.afterPhotoFiles],
        results: form.model.results.map((result) => ({
          planItemId: result.planItemId,
          resultStatus: result.resultStatus,
          resultValue: normalizeNullableText(result.resultValue),
          photoFiles: [...result.photoFiles],
          remark: normalizeNullableText(result.remark)
        }))
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '任务完成提交失败，请检查执行结果和网络后重试')
      return false
    }
  }

  const handleOpen = async (data: PmisTaskExecutionDialogOpenData): Promise<void> => {
    task.value = data.task
    initialize(data.task)
    await dialogRef.value?.handleOpen(data, {
      title: `执行${kindLabel.value}任务`,
      subtitle: `${data.task.taskNo} · ${data.task.equipment.equipmentName}`,
      confirmText: '提交并完成',
      contentMaxHeight: 'calc(100vh - 150px)',
      onOpen: async () => {
        await nextTick()
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .pmis-task-execution {
    min-width: 0;

    &__progress {
      padding: 6px 10px;
      font-variant-numeric: tabular-nums;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border-radius: 999px;
    }

    &__items {
      display: grid;
      gap: var(--art-space-3);
    }

    &__album {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-4);
      padding: var(--art-space-4);
      margin-top: var(--art-space-4);
      background: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      > div {
        display: grid;
        gap: var(--art-space-2);
        min-width: 0;
      }

      strong,
      small {
        display: block;
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__items article {
      min-width: 0;
      padding: var(--art-space-4);
      background: var(--default-box-color);
      border: 1px solid var(--el-border-color-lighter);
      border-left: 3px solid var(--el-border-color);
      border-radius: var(--el-border-radius-base);
    }

    &__items article[data-result='ok'] {
      border-left-color: var(--el-color-success);
    }

    &__items article[data-result='ng'] {
      border-left-color: var(--el-color-danger);
    }

    &__items article[data-result='exempt'] {
      border-left-color: var(--el-text-color-placeholder);
    }

    &__items header {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: var(--art-space-3);
      align-items: center;
      margin-bottom: var(--art-space-3);
    }

    &__items header > span {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      font-variant-numeric: tabular-nums;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    &__items header strong,
    &__items header small {
      display: block;
    }

    &__items header small {
      margin-top: 3px;
      color: var(--el-text-color-secondary);
    }

    &__item-fields {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: var(--art-space-4);
      align-items: start;
    }

    &__item-copy {
      display: grid;
      gap: var(--art-space-3);
      min-width: 0;
    }

    &__photos {
      display: grid;
      gap: var(--art-space-2);
      min-width: 0;

      > div strong,
      > div small {
        display: block;
      }

      > div small {
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  @media (width <= 760px) {
    .pmis-task-execution {
      &__items header,
      &__item-fields,
      &__album {
        grid-template-columns: minmax(0, 1fr);
      }

      &__items header > span {
        display: none;
      }
    }
  }
</style>
