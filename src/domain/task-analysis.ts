import { groupBy, uniqBy } from 'lodash-es'
import type { PmisAnalysisItem, PmisTask, PmisTaskOverview } from '../api/types'

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
): PmisAnalysisItem[] {
  const groups = groupBy(tasks, (task) =>
    dimension === 'department'
      ? task.equipment.department?.id || 'unassigned'
      : dimension === 'responsible'
        ? task.responsible?.id || 'unassigned'
        : task.equipment.id
  )
  return Object.entries(groups)
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
            ? `${uniqBy(rows, (row) => row.equipment.id).length} 台设备`
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
