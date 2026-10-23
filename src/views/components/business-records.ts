import {
  fetchEmployeeSelectorList,
  type EmployeeIntegrationItem
} from '@/api/integration/employees'
import { uniq } from 'lodash-es'

/** The selector RPC also serves account managers who cannot read the employee table. */
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
    if (result.error) throw result.error
    total = result.total
    for (const employee of result.data) {
      if (selectedIds.has(employee.id)) matched.set(employee.id, employee)
    }
    if (result.data.length === 0) break
    offset += pageSize
  }
  return uniqueIds
    .map((id) => matched.get(id))
    .filter((item): item is EmployeeIntegrationItem => Boolean(item))
}
