import {
  fetchEmployeeSelectorList,
  type EmployeeIntegrationItem
} from '@/api/integration/employees'
import type { PmisEmployeeReference } from '@pmis/api'
import { uniq } from 'lodash-es'

export const toEmployeeSelectedData = (
  tenantId: string,
  employees: Array<PmisEmployeeReference | null | undefined>
): EmployeeIntegrationItem[] =>
  employees
    .filter((employee): employee is PmisEmployeeReference => Boolean(employee))
    .map((employee) => ({
      ...employee,
      tenantId,
      employmentStatus: 'active'
    }))

export async function resolveEmployeeSelectedData(
  tenantId: string,
  employeeIds: string[]
): Promise<EmployeeIntegrationItem[]> {
  const uniqueIds = uniq(employeeIds.filter(Boolean))
  if (!tenantId || uniqueIds.length === 0) return []

  const selectedIds = new Set(uniqueIds)

  const matched = new Map<string, EmployeeIntegrationItem>()
  const pageSize = 200
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  while (offset < total && matched.size < uniqueIds.length) {
    const result = await fetchEmployeeSelectorList({
      tenantId,
      from: offset,
      to: offset + pageSize - 1
    })
    total = result.total
    result.data.forEach((employee) => {
      if (selectedIds.has(employee.id)) matched.set(employee.id, employee)
    })
    if (result.data.length === 0) break
    offset += pageSize
  }

  return uniqueIds
    .map((id) => matched.get(id))
    .filter((item): item is EmployeeIntegrationItem => Boolean(item))
}
