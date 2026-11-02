<div align="center">
  <h1>Yiqi Workshop PMIS</h1>
  <p><strong>Equipment inspection, patrol, maintenance, repair, and preventive maintenance</strong></p>
  <p>Connect equipment, production lines, plans, tasks, execution results, exceptions, and operational analysis.</p>

  <p>
    <a href="https://gitee.com/art-si/art-supabase-pmis">Gitee</a>
    ·
    <a href="https://github.com/art-si/art-supabase-pmis">GitHub</a>
    ·
    <a href="https://gitee.com/art-si/art-supabase-pro">Platform</a>
    ·
    <a href="https://art-si.github.io/art-supabase-doc/modules/pmis">Documentation</a>
    ·
    <a href="./README.md">简体中文</a>
  </p>
</div>

## Purpose

PMIS manages day-to-day production-equipment operations. It uses existing equipment, organization/line, and employee identities to connect maintenance plans, tasks, check items, execution results, exceptions, and analysis.

This repository owns domain pages, APIs, types, and equipment-task rules. [`art-supabase-pro`](https://gitee.com/art-si/art-supabase-pro) provides authentication, tenancy, dynamic menus, action permissions, themes, layout, shared components, and the common Supabase runtime. Equipment inspection and patrol retain their distinct business meanings and menus.

## Current Capabilities

| Area | Coverage |
| --- | --- |
| Operations workbench | Five business domains and their task flow and platform boundaries |
| Equipment inspection | Inspection sheets, plans, details, reports, analysis, and an inspection dashboard |
| Equipment patrol | Plans, tasks, details, reports, and analysis |
| Maintenance | Department settings, plans, tasks, details, reports, and analysis |
| Fault repair | Repair-person settings, repair tasks, execution, and analysis |
| Preventive maintenance | Plans, tasks, details, and analysis |
| Task handling | Create, edit, reference-copy, execute, confirm, and inspect records with distinct permissions |
| Scope and analysis | Department/line trees, calendar views, equipment/responsible-person summaries, pending/completed/overdue/exempt states, and completion rates |

Analysis and calendars read actual tasks. Completion rates exclude exempt tasks. Details reload the record identity and preserve equipment, organization, personnel, and result context. Available actions depend on both exact permissions and task state.

## Recent Improvements

- Plans, tasks, and repair workspaces share department navigation, record identities, details, filtering, and query-error feedback.
- Plan items, task editing/execution, repair, and department settings use platform configuration-driven forms and shared selectors.
- Domain-owned analysis rules keep calendar and analysis scopes explicit; dashboards derive status from actual tasks.
- Single and bulk deletion use `MasterDataDeleteGuard` before confirmation. Failed or unauthorized reference checks block deletion and provide retry feedback.
- Shared workspaces reuse platform loading, empty, error/retry, scrolling, and theme behavior in both hosted and standalone development.

## Suggested Workflow

```text
Check equipment, department/line, and personnel
  → maintain inspection / patrol / maintenance / preventive plans
  → handle tasks and on-site execution
  → record results, exceptions, and repairs
  → confirm and inspect records
  → review calendars, dashboards, and analysis
```

Plans, execution, confirmation, and repair use their business pages. Analysis displays derived results and does not directly edit task or equipment states. Configure authoritative equipment, personnel, and plans first rather than duplicating identities by name.

## Integration and Ownership

MES execution can link equipment and PMIS tasks. Production reporting and equipment maintenance retain separate states, permissions, and audit trails; investigate their actual record links rather than matching equipment names alone.

Shared utilities and runtime belong to the platform. Cross-domain data uses minimum-field, tenant-isolated API/RPC contracts instead of copying or importing another module's source. Push module changes before updating the platform's `modules/art-supabase-pmis` gitlink.

## Local Development

Requirements: Node.js `>= 22.13.0`, pnpm `>= 11.28.2`.

```powershell
pnpm install
pnpm dev
```

Default URL: `http://localhost:3020`. Develop under `modules/art-supabase-pmis` or install the pinned platform dependency for a standalone clone. `ART_SUPABASE_PLATFORM_ROOT` can select a local platform checkout.

The shared Vite factory merges platform and application environments. Configure your backend and public path; keep server credentials out of browser variables.

| Command               | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `pnpm boundary:audit` | Check module ownership and dependencies      |
| `pnpm typecheck`      | Run the shared module typecheck              |
| `pnpm check`          | Boundary/UI audits, types, and ESLint        |
| `pnpm build`          | Typecheck and write static output to `docs/` |
| `pnpm preview`        | Preview the build                            |

`VITE_BASE_URL` controls the public path. Server-provided menu paths align with `src/views/**/index.vue`, and entries depend on role grants.

## Permissions and Data Security

Ordinary users and tenant administrators remain within their authenticated tenant and authorized data. Platform-super all/selected-tenant behavior follows the platform contract; existing tasks retain their owning tenant and parent/child writes use the correct target.

Viewing, configuration, creation, editing, execution, confirmation, and deletion retain distinct permissions and server checks. UI visibility does not replace RLS. Referenced or state-protected records cannot be deleted, and completed equipment history is not automatically removed.

## License

See the platform [MulanPSL-2.0 license](https://gitee.com/art-si/art-supabase-pro/blob/master/LICENSE).
