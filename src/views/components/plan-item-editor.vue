<template>
  <div class="plan-item-editor">
    <div class="plan-item-editor__toolbar">
      <div
        ><strong>{{ itemNoun }}</strong
        ><small>配置内容、要求与判定规则，拖动序号可调整执行顺序。</small></div
      >
      <ElButton type="primary" plain @click="addItem">
        <ArtSvgIcon icon="ri:add-line" />添加项目
      </ElButton>
    </div>
    <ArtTable
      ref="tableRef"
      :data="modelValue"
      :columns="columns"
      :pagination="false"
      :show-table-header="true"
    />
  </div>
</template>

<script setup lang="tsx">
  import { ElButton, ElInput, ElSwitch } from 'element-plus'
  import ArtTable, {
    type ArtTableExpose,
    type ArtTableValidationResult
  } from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ColumnOption } from '@/types'
  import type { PmisPlanItem } from '@pmis/api'

  defineOptions({ name: 'PmisPlanItemEditor' })
  const props = withDefaults(defineProps<{ modelValue: PmisPlanItem[]; itemNoun?: string }>(), {
    itemNoun: '检查项目'
  })
  const emit = defineEmits<{ 'update:modelValue': [value: PmisPlanItem[]] }>()
  const tableRef = ref<ArtTableExpose>()
  const commit = (): void => emit('update:modelValue', [...props.modelValue])
  const addItem = (): void =>
    emit('update:modelValue', [
      ...props.modelValue,
      {
        itemName: '',
        requirement: '',
        judgmentRule: '',
        requirePhoto: false,
        sort: (props.modelValue.length + 1) * 10
      }
    ])
  const removeItem = (index: number): void =>
    emit(
      'update:modelValue',
      props.modelValue.filter((_, itemIndex) => itemIndex !== index)
    )

  const validate = (): Promise<ArtTableValidationResult> => tableRef.value!.validate()
  const clearValidate = (): void => tableRef.value?.clearValidate()
  const moveItem = (index: number, offset: number): void => {
    const target = index + offset
    if (target < 0 || target >= props.modelValue.length) return
    const next = [...props.modelValue]
    ;[next[index], next[target]] = [next[target], next[index]]
    emit(
      'update:modelValue',
      next.map((item, itemIndex) => ({ ...item, sort: (itemIndex + 1) * 10 }))
    )
  }
  const columns: ColumnOption<PmisPlanItem>[] = [
    { type: 'globalIndex', label: '序号', width: 64 },
    {
      prop: 'itemName',
      label: '检查内容',
      minWidth: 180,
      required: true,
      requiredMessage: ({ rowIndex }) => `第 ${rowIndex + 1} 行“检查内容”不能为空`,
      formatter: (row: PmisPlanItem) => (
        <ElInput
          v-model={row.itemName}
          maxlength={120}
          placeholder="如 检查润滑油位"
          onInput={commit}
        />
      )
    },
    {
      prop: 'requirement',
      label: '检查要求',
      minWidth: 220,
      formatter: (row: PmisPlanItem) => (
        <ElInput
          v-model={row.requirement}
          maxlength={300}
          placeholder="描述合格标准或执行要求"
          onInput={commit}
        />
      )
    },
    {
      prop: 'judgmentRule',
      label: '判定规则',
      minWidth: 180,
      formatter: (row: PmisPlanItem) => (
        <ElInput
          v-model={row.judgmentRule}
          maxlength={200}
          placeholder="留空为 OK / NG"
          onInput={commit}
        />
      )
    },
    {
      prop: 'requirePhoto',
      label: '必传图片',
      width: 98,
      align: 'center',
      formatter: (row: PmisPlanItem) => <ElSwitch v-model={row.requirePhoto} onChange={commit} />
    },
    {
      prop: 'operation',
      label: '操作',
      width: 160,
      fixed: 'right',
      formatter: (row: PmisPlanItem) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="more"
            icon="ri:arrow-up-line"
            disabled={props.modelValue.indexOf(row) === 0}
            label="上移"
            onClick={() => moveItem(props.modelValue.indexOf(row), -1)}
          />
          <ArtButtonTable
            type="more"
            icon="ri:arrow-down-line"
            disabled={props.modelValue.indexOf(row) === props.modelValue.length - 1}
            label="下移"
            onClick={() => moveItem(props.modelValue.indexOf(row), 1)}
          />
          <ArtButtonTable
            type="delete"
            label="删除项目"
            disabled={props.modelValue.length === 1}
            onClick={() => removeItem(props.modelValue.indexOf(row))}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  defineExpose({ validate, clearValidate })
</script>

<style scoped lang="scss">
  .plan-item-editor {
    min-width: 0;

    &__toolbar {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;

      strong,
      small {
        display: block;
      }

      small {
        margin-top: 3px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  @media (width <= 720px) {
    .plan-item-editor__toolbar {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
