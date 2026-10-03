import dayjs from 'dayjs'
import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks'
import TreeUtils from '@/utils/tree'
import { resolveTenantScopeId } from '@/utils/tenant-scope-context'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  PmisAnalysisItem,
  PmisDepartmentOption,
  PmisDepartmentTreeOption,
  PmisDepartmentSetting,
  PmisDepartmentSettingInput,
  PmisEquipmentOption,
  PmisPageQuery,
  PmisPlan,
  PmisPlanInput,
  PmisPlanKind,
  PmisRepairTask,
  PmisRepairTaskInput,
  PmisTask,
  PmisTaskExecutionInput,
  PmisTaskInput,
  PmisTaskOverview,
  PmisTaskStatus
} from './types'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()
const snapshotPageSize = 500

const equipmentSelect = `
  id, tenant_id, equipment_code, equipment_name, production_department_id,
  operation_status, status,
  department:mdm_production_department!mdm_equipment_production_department_fkey(
    id, tenant_id, parent_id, department_code:code, department_name:name
  )
`

const taskSelect = `
  id, tenant_id, task_no, planned_date, shift_name, status, completed_at, execution_summary,
  task_source, due_date, delegated_at, before_photo_files, after_photo_files, confirmed_at,
  plan:pmis_plan!pmis_task_plan_fkey!inner(
    id, plan_kind, plan_name, required_days, require_photo,
    items:pmis_plan_item(id,item_name,requirement,judgment_rule,require_photo,sort)
  ),
  equipment:mdm_equipment!pmis_task_equipment_fkey!inner(${equipmentSelect}),
  responsible:mdm_employee!pmis_task_employee_fkey(id, employee_no, employee_name),
  delegate:mdm_employee!pmis_task_delegate_employee_fkey(id, employee_no, employee_name),
  confirmer:mdm_employee!pmis_task_confirmer_employee_fkey(id, employee_no, employee_name),
  results:pmis_task_result(
    id, result_status, result_value, photo_files, inspected_at, remark,
    item:pmis_plan_item!pmis_task_result_item_fkey(id, item_name, requirement, judgment_rule, require_photo, sort),
    inspector:mdm_employee!pmis_task_result_employee_fkey(id, employee_no, employee_name)
  )
`

const displayStatus = (
  task: Pick<PmisTask, 'status' | 'plannedDate' | 'completedAt' | 'dueDate'>
): PmisTaskStatus =>
  task.status === 'pending' && dayjs(task.plannedDate).isBefore(dayjs(), 'day')
    ? 'overdue'
    : task.status === 'completed' &&
        task.completedAt &&
        task.dueDate &&
        dayjs(task.completedAt).isAfter(dayjs(task.dueDate), 'day')
      ? 'completed_overdue'
      : task.status

const normalizeTask = (task: PmisTask): PmisTask => ({
  ...task,
  displayStatus: displayStatus(task)
})

export async function fetchPmisDepartments(tenantId?: string): Promise<PmisDepartmentOption[]> {
  const scopedTenantId = resolveTenantScopeId(tenantId)
  const result = await responseHandle<PmisDepartmentOption[]>(
    () => {
      let query = supabase
        .from('mdm_production_department')
        .select('id,tenant_id,parent_id,department_code:code,department_name:name')
        .eq('enabled', true)
        .order('sort')
        .order('name')
      if (scopedTenantId) query = query.eq('tenant_id', scopedTenantId)
      return query
    },
    { showErrorMessage: true, errorMessage: '部门与产线加载失败，请重试' }
  )
  return result.data ?? []
}

export async function fetchPmisDepartmentTree(
  tenantId?: string
): Promise<PmisDepartmentTreeOption[]> {
  const departments = await fetchPmisDepartments(tenantId)
  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  return treeUtils.listToTree(departments) as PmisDepartmentTreeOption[]
}

export async function fetchPmisEquipmentOptions(params: PmisPageQuery = {}) {
  const scopedTenantId = resolveTenantScopeId(params.tenantId)
  const from = Math.max(((params.current ?? 1) - 1) * (params.size ?? 20), 0)
  const to = from + (params.size ?? 20) - 1
  let query = supabase
    .from('mdm_equipment')
    .select(equipmentSelect, { count: 'exact' })
    .eq('status', 'enabled')
    .order('equipment_code')
    .order('id')
    .range(from, to)
  if (params.keyword?.trim())
    query = query.or(
      buildOrIlikeFilter(['equipment_code', 'equipment_name'], params.keyword.trim())
    )
  if (params.departmentId) query = query.eq('production_department_id', params.departmentId)
  if (scopedTenantId) query = query.eq('tenant_id', scopedTenantId)
  const result = await responseHandle<PmisEquipmentOption[]>(() => query, {
    showErrorMessage: true,
    errorMessage: '设备列表加载失败，请重试'
  })
  return { data: result.data ?? [], total: result.total ?? 0 }
}

export async function fetchPmisPlans(kind: PmisPlanKind, params: PmisPageQuery = {}) {
  const scopedTenantId = resolveTenantScopeId(params.tenantId)
  const from = Math.max(((params.current ?? 1) - 1) * (params.size ?? 20), 0)
  const to = from + (params.size ?? 20) - 1
  let query = supabase
    .from('pmis_plan')
    .select(
      `
        *,
        items:pmis_plan_item(id,item_name,requirement,judgment_rule,require_photo,sort),
        equipment_bindings:pmis_plan_equipment(
          equipment:mdm_equipment!pmis_plan_equipment_equipment_fkey(${equipmentSelect})
        ),
        responsible_bindings:pmis_plan_responsible(
          employee:mdm_employee!pmis_plan_responsible_employee_fkey(
            id, tenant_id, employee_no, employee_name
          )
        )
      `,
      { count: 'exact' }
    )
    .eq('plan_kind', kind)
    .order('update_time', { ascending: false })
    .order('id')
    .range(from, to)
  if (params.keyword?.trim()) query = query.ilike('plan_name', `%${params.keyword.trim()}%`)
  if (scopedTenantId) query = query.eq('tenant_id', scopedTenantId)
  if (params.status) query = query.eq('status', params.status)
  const result = await responseHandle<PmisPlan[]>(() => query, {
    showErrorMessage: true,
    errorMessage: `${planKindLabel(kind)}方案加载失败，请重试`
  })
  return { data: result.data ?? [], total: result.total ?? 0 }
}

export async function savePmisPlan(input: PmisPlanInput, id?: string) {
  await responseHandle<string>(
    () =>
      supabase.rpc('pmis_save_plan_secure', {
        p_id: id ?? null,
        p_payload: keysToSnakeDeep(omit(input, ['id']))
      }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: id ? '方案已更新' : '方案已创建',
      errorMessage: '方案保存失败，请检查名称、项目和适用设备'
    }
  )
}

export async function deletePmisPlans(ids: string[], kind: PmisPlanKind) {
  await responseHandle<number>(
    () => supabase.rpc('pmis_delete_plans_secure', { p_ids: ids, p_kind: kind }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: '方案已删除',
      errorMessage: '方案删除失败，请先解除适用设备或保留已有执行记录'
    }
  )
}

export async function fetchPmisTasks(kind: PmisPlanKind, params: PmisPageQuery = {}) {
  const scopedTenantId = resolveTenantScopeId(params.tenantId)
  const from = Math.max(((params.current ?? 1) - 1) * (params.size ?? 20), 0)
  const to = from + (params.size ?? 20) - 1
  let query = supabase
    .from('pmis_task')
    .select(taskSelect, { count: 'exact' })
    .eq('plan.plan_kind', kind)
    .order('planned_date', { ascending: false })
    .order('task_no')
    .order('id')
    .range(from, to)
  if (params.keyword?.trim()) query = query.ilike('task_no', `%${params.keyword.trim()}%`)
  if (scopedTenantId) query = query.eq('tenant_id', scopedTenantId)
  if (params.equipmentId) query = query.eq('equipment_id', params.equipmentId)
  if (params.departmentIds?.length)
    query = query.in('equipment.production_department_id', params.departmentIds)
  if (params.departmentId)
    query = query.eq('equipment.production_department_id', params.departmentId)
  if (params.planId) query = query.eq('plan_id', params.planId)
  if (params.dateFrom) query = query.gte('planned_date', params.dateFrom)
  if (params.dateTo) query = query.lte('planned_date', params.dateTo)
  if (params.status === 'overdue')
    query = query.eq('status', 'pending').lt('planned_date', dayjs().format('YYYY-MM-DD'))
  else if (params.status === 'pending')
    query = query.eq('status', 'pending').gte('planned_date', dayjs().format('YYYY-MM-DD'))
  else if (params.status) query = query.eq('status', params.status)
  const result = await responseHandle<PmisTask[]>(() => query, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: `${planKindLabel(kind)}任务加载失败，请重试`
  })
  return {
    data: (result.data ?? []).map(normalizeTask),
    total: result.total ?? 0
  }
}

export const planKindLabel = (kind: PmisPlanKind): string =>
  ({ inspection: '点检', patrol: '巡检', maintenance: '保养', preventive: '预防维修' })[kind]

export async function savePmisTask(input: PmisTaskInput, id?: string): Promise<void> {
  await responseHandle<string>(
    () =>
      supabase.rpc('pmis_save_task_secure', {
        p_id: id ?? null,
        p_payload: keysToSnakeDeep(input)
      }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: id ? '任务已更新' : '任务已创建',
      errorMessage: '任务保存失败，请检查方案、设备和负责人'
    }
  )
}

export async function deletePmisTasks(ids: string[], kind: PmisPlanKind): Promise<void> {
  await responseHandle<number>(
    () => supabase.rpc('pmis_delete_tasks_secure', { p_ids: ids, p_kind: kind }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: '任务已删除',
      errorMessage: '任务删除失败，仅未执行任务可删除'
    }
  )
}

export async function confirmPmisTask(taskId: string): Promise<void> {
  await responseHandle<string>(
    () => supabase.rpc('pmis_confirm_task_secure', { p_task_id: taskId }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: '保养结果已确认',
      errorMessage: '确认失败，请检查权限和任务状态'
    }
  )
}

export async function fetchPmisDepartmentSettings(
  kind: 'maintenance' | 'repair',
  params: PmisPageQuery = {}
) {
  const scopedTenantId = resolveTenantScopeId(params.tenantId)
  let query = supabase
    .from('pmis_department_setting')
    .select(
      `*,department:mdm_production_department!pmis_department_setting_department_fkey(id,tenant_id,parent_id,department_code:code,department_name:name),employees:pmis_department_setting_employee(role,employee:mdm_employee!pmis_department_setting_employee_employee_fkey(id,employee_no,employee_name)),escalation_rules:pmis_escalation_rule(id,delay_minutes,notification_methods,notify_employee_ids)`,
      { count: 'exact' }
    )
    .eq('setting_kind', kind)
    .order('update_time', { ascending: false })
  if (params.departmentId) query = query.eq('department_id', params.departmentId)
  if (scopedTenantId) query = query.eq('tenant_id', scopedTenantId)
  if (params.departmentIds?.length) query = query.in('department_id', params.departmentIds)
  const result = await responseHandle<PmisDepartmentSetting[]>(() => query, {
    showErrorMessage: true,
    errorMessage: '部门设置加载失败，请重试'
  })
  return { data: result.data ?? [], total: result.total ?? 0 }
}

export async function savePmisDepartmentSetting(
  input: PmisDepartmentSettingInput,
  id?: string
): Promise<void> {
  await responseHandle<string>(
    () =>
      supabase.rpc('pmis_save_department_setting_secure', {
        p_id: id ?? null,
        p_payload: keysToSnakeDeep(input)
      }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: '部门设置已保存',
      errorMessage: '部门设置保存失败'
    }
  )
}

export async function deletePmisDepartmentSettings(
  ids: string[],
  kind: 'maintenance' | 'repair'
): Promise<void> {
  await responseHandle<number>(
    () => supabase.rpc('pmis_delete_department_settings_secure', { p_ids: ids, p_kind: kind }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: '部门设置已删除',
      errorMessage: '部门设置删除失败'
    }
  )
}

const repairSelect = `id,tenant_id,work_order_no,urgency,fault_symptom,fault_photo_files,fault_analysis,fault_cause,solution,repair_photo_files,status,reported_at,required_complete_at,completed_at,confirmed_at,equipment:mdm_equipment!pmis_repair_task_equipment_fkey!inner(${equipmentSelect}),reporter:mdm_employee!pmis_repair_task_reporter_fkey(id,employee_no,employee_name),repairer:mdm_employee!pmis_repair_task_repairer_fkey(id,employee_no,employee_name),confirmer:mdm_employee!pmis_repair_task_confirmer_fkey(id,employee_no,employee_name)`

export async function fetchPmisRepairTasks(params: PmisPageQuery = {}) {
  const scopedTenantId = resolveTenantScopeId(params.tenantId)
  const from = Math.max(((params.current ?? 1) - 1) * (params.size ?? 20), 0)
  let query = supabase
    .from('pmis_repair_task')
    .select(repairSelect, { count: 'exact' })
    .order('reported_at', { ascending: false })
    .order('id')
    .range(from, from + (params.size ?? 20) - 1)
  if (params.keyword?.trim())
    query = query.or(buildOrIlikeFilter(['work_order_no', 'fault_symptom'], params.keyword.trim()))
  if (scopedTenantId) query = query.eq('tenant_id', scopedTenantId)
  if (params.equipmentId) query = query.eq('equipment_id', params.equipmentId)
  if (params.departmentIds?.length)
    query = query.in('equipment.production_department_id', params.departmentIds)
  if (params.dateFrom) query = query.gte('reported_at', `${params.dateFrom}T00:00:00`)
  if (params.dateTo) query = query.lte('reported_at', `${params.dateTo}T23:59:59`)
  if (params.status === 'overdue')
    query = query.neq('status', 'completed').lt('required_complete_at', new Date().toISOString())
  else if (params.status) query = query.eq('status', params.status)
  const result = await responseHandle<PmisRepairTask[]>(() => query, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '维修工单加载失败，请重试'
  })
  const rows = (result.data ?? []).map((row) => ({
    ...row,
    displayStatus:
      row.status !== 'completed' &&
      row.requiredCompleteAt &&
      dayjs(row.requiredCompleteAt).isBefore(dayjs())
        ? ('overdue' as const)
        : row.status
  }))
  return { data: rows, total: result.total ?? 0 }
}

export async function savePmisRepairTask(input: PmisRepairTaskInput, id?: string): Promise<void> {
  await responseHandle<string>(
    () =>
      supabase.rpc('pmis_save_repair_task_secure', {
        p_id: id ?? null,
        p_payload: keysToSnakeDeep(input)
      }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: id ? '维修工单已更新' : '维修工单已创建',
      errorMessage: '维修工单保存失败'
    }
  )
}

export async function deletePmisRepairTasks(ids: string[]): Promise<void> {
  await responseHandle<number>(
    () => supabase.rpc('pmis_delete_repair_tasks_secure', { p_ids: ids }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: '维修工单已删除',
      errorMessage: '维修工单删除失败'
    }
  )
}

export async function completePmisTask(input: PmisTaskExecutionInput): Promise<void> {
  await responseHandle<string>(
    () =>
      supabase.rpc('pmis_complete_task_secure', {
        p_task_id: input.taskId,
        p_payload: keysToSnakeDeep(omit(input, ['taskId']))
      }),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: true,
      message: '任务已提交完成',
      errorMessage: '任务提交失败，请检查执行人、项目结果和现场图片'
    }
  )
}

export async function fetchPmisTaskSnapshot(kind: PmisPlanKind, params: PmisPageQuery = {}) {
  const result = await fetchAllRangePages<PmisTask>(
    async ({ from, to }) => {
      const { data, total } = await fetchPmisTasks(kind, {
        ...params,
        current: Math.floor(from / snapshotPageSize) + 1,
        size: to - from + 1
      })
      return { data, total, error: null }
    },
    { pageSize: snapshotPageSize }
  )
  if (result.error) throw result.error
  return result.data ?? []
}

export async function fetchPmisRepairTaskSnapshot(params: PmisPageQuery = {}) {
  const result = await fetchAllRangePages<PmisRepairTask>(
    async ({ from, to }) => {
      const { data, total } = await fetchPmisRepairTasks({
        ...params,
        current: Math.floor(from / snapshotPageSize) + 1,
        size: to - from + 1
      })
      return { data, total, error: null }
    },
    { pageSize: snapshotPageSize }
  )
  if (result.error) throw result.error
  return result.data ?? []
}

export function summarizePmisTasks(tasks: PmisTask[]): PmisTaskOverview {
  const completed = tasks.filter((item) => item.displayStatus === 'completed').length
  const pending = tasks.filter((item) => item.displayStatus === 'pending').length
  const overdue = tasks.filter((item) => item.displayStatus === 'overdue').length
  const exempt = tasks.filter((item) => item.displayStatus === 'exempt').length
  const denominator = Math.max(tasks.length - exempt, 0)
  return {
    total: tasks.length,
    completed,
    pending,
    overdue,
    exempt,
    completionRate: denominator ? Math.round((completed / denominator) * 1000) / 10 : 0
  }
}

export function analyzePmisTasks(
  tasks: PmisTask[],
  dimension: 'department' | 'equipment' | 'responsible'
) {
  const groups = new Map<string, PmisTask[]>()
  tasks.forEach((task) => {
    const key =
      dimension === 'department'
        ? task.equipment.department?.id || 'unassigned'
        : dimension === 'responsible'
          ? task.responsible?.id || 'unassigned'
          : task.equipment.id
    groups.set(key, [...(groups.get(key) ?? []), task])
  })
  return [...groups.entries()]
    .map(([id, rows]): PmisAnalysisItem => {
      const overview = summarizePmisTasks(rows)
      const equipment = rows[0]?.equipment
      return {
        id,
        label:
          dimension === 'department'
            ? equipment?.department?.departmentName || '未分配产线'
            : dimension === 'responsible'
              ? rows[0]?.responsible?.employeeName || '未分配人员'
              : equipment?.equipmentName || '未知设备',
        description:
          dimension === 'department'
            ? `${new Set(rows.map((row) => row.equipment.id)).size} 台设备`
            : dimension === 'responsible'
              ? rows[0]?.responsible?.employeeNo
              : equipment?.equipmentCode,
        ...overview
      }
    })
    .sort(
      (left, right) => right.overdue - left.overdue || left.completionRate - right.completionRate
    )
}
