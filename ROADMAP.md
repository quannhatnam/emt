# EMT Dashboard - Feature Roadmap & Architecture Guide

> **Purpose**: This document serves as the source of truth for planned features, current architecture, and implementation guidance. It is designed to be consumed by both humans and AI coding assistants (Copilot, Claude Code, Cursor, etc.).

---

## Current State (v1.0)

### Stack
- **Backend**: Python 3.9+, FastAPI, SQLAlchemy (async), SQLite (aiosqlite), APScheduler
- **Frontend**: React 18, TypeScript, MUI v6, Recharts
- **Auth**: HTTP Basic Auth (hardcoded admin/admin)
- **Providers**: Microsoft Intune (Graph API), Kandji (REST API), Qualys (XML API)

### Existing Pages
| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Executive overview: health score, KPIs, compliance trend, vulnerability trend, OS distribution, stale devices, data freshness |
| Devices | `/devices` | Filterable/sortable device list with search, CSV export |
| Device Detail | `/devices/:id` | Single device info, installed apps, vulnerabilities |
| Applications | `/applications` | Fleet-wide app inventory, managed vs unmanaged, search/filter |
| Settings | `/settings` | Provider credentials, sync schedules, sync logs |

### Existing API Endpoints (all under `/api/v1`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dashboard/summary` | KPI aggregations |
| GET | `/dashboard/os-distribution` | OS version breakdown |
| GET | `/dashboard/vulnerability-summary` | Vuln counts by severity |
| GET | `/dashboard/compliance-trend?days=30` | Compliance over time (mock) |
| GET | `/dashboard/vulnerability-trend?days=30` | Vulns over time (mock) |
| GET | `/devices` | Paginated device list with filters |
| GET | `/devices/stale` | Devices not checked in 7+ days |
| GET | `/devices/:id` | Device detail with apps & vulns |
| GET | `/devices/:id/apps` | Apps for a device |
| GET | `/devices/:id/vulnerabilities` | Vulns for a device |
| GET | `/apps/summary` | Fleet-wide app stats |
| GET | `/apps` | Aggregated app list across fleet |
| GET/POST/DELETE | `/credentials` | Provider credential CRUD |
| POST | `/credentials/:provider/test` | Test provider connection |
| POST | `/sync/:provider` | Trigger sync for one provider |
| POST | `/sync/all` | Trigger sync for all providers |
| GET | `/sync/logs` | Sync history |
| GET/PUT | `/sync/schedule` | Sync schedule config |

### Key Files
```
backend/
  app/
    main.py                          # FastAPI app, lifespan, CORS, router registration
    config.py                        # Pydantic BaseSettings (env vars)
    database.py                      # SQLAlchemy async engine + session
    auth/basic.py                    # HTTP Basic Auth (hardcoded admin/admin)
    models/
      device.py                      # Device model (source, source_id, compliance_status, etc.)
      app.py                         # App model (name, version, is_managed, device_id FK)
      vulnerability.py               # Vulnerability model (qid, cve_id, severity 1-5, status)
      credential.py                  # Encrypted provider credentials
      sync_log.py                    # Sync audit trail
    schemas/                         # Pydantic response/request models
      device.py, app.py, vulnerability.py, dashboard.py, credential.py, sync_log.py
    api/routes/
      dashboard.py                   # Dashboard aggregation endpoints
      devices.py                     # Device CRUD + per-device apps/vulns
      apps.py                        # Fleet-wide app aggregation
      credentials.py                 # Provider credential management
      sync.py                        # Sync triggers + logs + schedule
    adapters/
      base.py                        # BaseAdapter ABC (sync_devices, sync_apps, sync_vulnerabilities)
      intune.py                      # Microsoft Graph API adapter
      kandji.py                      # Kandji API adapter
      qualys.py                      # Qualys VM API adapter (XML)
    services/
      sync_service.py                # Core sync logic (identity resolution, upsert, audit)
      scheduler.py                   # APScheduler wrapper (interval jobs)

frontend/
  src/
    App.tsx                          # Routes + PrivateRoute wrapper
    services/api.ts                  # Axios client, type definitions, all API functions
    components/Layout.tsx            # Sidebar nav + top bar
    pages/
      LoginPage.tsx                  # Basic auth login form
      DashboardPage.tsx              # Executive overview with charts
      DevicesPage.tsx                # Device list with DataGrid
      DeviceDetailPage.tsx           # Single device view
      ApplicationsPage.tsx           # Fleet app inventory
      SettingsPage.tsx               # Credentials + sync config
```

---

## Recommended Features (Priority Order)

### P0 - Critical (Security & Data Integrity)

#### 1. Real Authentication & RBAC
**Why**: Current auth is hardcoded admin/admin. A VP/manager dashboard needs role-based access.

**Backend changes**:
- File: `backend/app/auth/` - Replace `basic.py` with JWT-based auth
- Add `User` model to `backend/app/models/user.py`:
  ```
  Table: users
  - id (UUID PK)
  - email (unique, indexed)
  - password_hash (bcrypt)
  - full_name
  - role (admin | manager | viewer)
  - is_active (bool)
  - created_at, updated_at
  ```
- Add routes: `POST /auth/login` (returns JWT), `GET /auth/me`, `POST /auth/register` (admin only)
- Add `get_current_user()` dependency that decodes JWT and checks role
- Add `require_role(role)` dependency for route-level RBAC

**Frontend changes**:
- File: `frontend/src/services/api.ts` - Store JWT in localStorage, attach as Bearer token
- File: `frontend/src/pages/LoginPage.tsx` - Update to use JWT flow
- Add: `frontend/src/pages/UsersPage.tsx` - Admin user management
- Update: `frontend/src/components/Layout.tsx` - Show/hide nav items by role

**Roles**:
- `admin`: Full access (credentials, sync, user management)
- `manager`: Dashboard, devices, apps, reports (read-only settings)
- `viewer`: Dashboard only (executive view)

#### 2. Historical Data Snapshots (Replace Mock Trends)
**Why**: Compliance and vulnerability trends currently return mock data. Real historical tracking is essential for executive reporting.

**Backend changes**:
- Add `DailySnapshot` model to `backend/app/models/snapshot.py`:
  ```
  Table: daily_snapshots
  - id (UUID PK)
  - date (Date, unique, indexed)
  - total_devices (int)
  - compliant_count (int)
  - non_compliant_count (int)
  - unknown_count (int)
  - critical_vulns (int)
  - high_vulns (int)
  - medium_vulns (int)
  - low_vulns (int)
  - managed_apps (int)
  - unmanaged_apps (int)
  - stale_devices (int)
  - created_at (datetime)
  ```
- Add snapshot job in `backend/app/services/scheduler.py` - runs daily at midnight UTC
- Add snapshot service in `backend/app/services/snapshot_service.py` - queries current state, inserts row
- Update `backend/app/api/routes/dashboard.py`:
  - `GET /dashboard/compliance-trend?days=30` - query `daily_snapshots` instead of generating mock data
  - `GET /dashboard/vulnerability-trend?days=30` - same

**Frontend changes**: None needed - API contract stays the same.

---

### P1 - High Value (Executive Visibility)

#### 3. Reporting & Export
**Why**: Managers need to share reports with stakeholders, auditors, and leadership.

**Backend changes**:
- Add `backend/app/api/routes/reports.py`:
  - `GET /reports/compliance` - Generate compliance report data (JSON)
  - `GET /reports/vulnerability` - Vulnerability report data
  - `GET /reports/inventory` - Full device/app inventory
  - `GET /reports/executive-summary` - Combined KPIs + trends
  - Each endpoint supports `?format=json|csv` query param
- Add `backend/app/services/report_service.py` - Report generation logic

**Frontend changes**:
- Add: `frontend/src/pages/ReportsPage.tsx`:
  - Report type selector (Compliance, Vulnerability, Inventory, Executive Summary)
  - Date range picker
  - Preview table
  - Download buttons (CSV, PDF)
- Update: `frontend/src/components/Layout.tsx` - Add "Reports" nav item (icon: `AssessmentIcon`)
- Update: `frontend/src/App.tsx` - Add `/reports` route

#### 4. Alerts & Notifications
**Why**: Proactive alerting when compliance drops, critical vulns appear, or devices go stale.

**Backend changes**:
- Add `AlertRule` model to `backend/app/models/alert.py`:
  ```
  Table: alert_rules
  - id (UUID PK)
  - name (str)
  - condition_type (compliance_drop | critical_vuln | stale_device | custom)
  - threshold (JSON) - e.g., {"compliance_pct_below": 80}
  - severity (critical | warning | info)
  - is_enabled (bool)
  - notification_channels (JSON) - ["email", "webhook"]
  - created_by (FK to users)
  - created_at, updated_at
  ```
- Add `Alert` model to `backend/app/models/alert.py`:
  ```
  Table: alerts
  - id (UUID PK)
  - rule_id (FK)
  - title (str)
  - message (str)
  - severity (critical | warning | info)
  - status (open | acknowledged | resolved)
  - triggered_at (datetime)
  - acknowledged_at (datetime, nullable)
  - resolved_at (datetime, nullable)
  ```
- Add routes: `backend/app/api/routes/alerts.py`:
  - `GET /alerts` - List alerts (filterable by status, severity)
  - `PUT /alerts/:id/acknowledge` - Acknowledge alert
  - `PUT /alerts/:id/resolve` - Resolve alert
  - `GET /alerts/rules` - List alert rules
  - `POST /alerts/rules` - Create rule
  - `PUT /alerts/rules/:id` - Update rule
  - `DELETE /alerts/rules/:id` - Delete rule
- Add `backend/app/services/alert_service.py` - Evaluate rules after each sync
- Hook into `backend/app/services/sync_service.py` - Call alert evaluation after successful sync

**Frontend changes**:
- Add: `frontend/src/pages/AlertsPage.tsx` - Alert list with filters, acknowledge/resolve actions
- Update: `frontend/src/components/Layout.tsx` - Add "Alerts" nav with badge count (icon: `NotificationsIcon`)
- Update: `frontend/src/pages/DashboardPage.tsx` - Add recent alerts card
- Update: `frontend/src/App.tsx` - Add `/alerts` route

#### 5. Device Groups & Tags
**Why**: Organize devices by department, location, cost center for filtered views and reporting.

**Backend changes**:
- Add `DeviceGroup` model:
  ```
  Table: device_groups
  - id (UUID PK)
  - name (str, unique)
  - description (str, nullable)
  - type (department | location | custom)
  - created_at
  ```
- Add `device_group_membership` association table (device_id, group_id)
- Add `Tag` model:
  ```
  Table: tags
  - id (UUID PK)
  - key (str) - e.g., "environment"
  - value (str) - e.g., "production"
  ```
- Add `device_tags` association table (device_id, tag_id)
- Update `Device` model with relationships
- Add routes: `GET/POST/PUT/DELETE /device-groups`, `POST /devices/:id/tags`
- Update: `GET /devices` - Add `group` and `tag` query params
- Update: `GET /dashboard/summary` - Accept `group_id` filter

**Frontend changes**:
- Update: `DevicesPage.tsx` - Add group/tag filter dropdowns
- Add: Group management section in Settings or standalone page
- Update: Dashboard - Optional group filter for all KPIs

---

### P2 - Medium Value (Operational Efficiency)

#### 6. Compliance Policies Engine
**Why**: Define what "compliant" means beyond what the MDM reports - custom rules.

**Backend changes**:
- Add `CompliancePolicy` model:
  ```
  Table: compliance_policies
  - id (UUID PK)
  - name (str)
  - description (str)
  - rules (JSON) - e.g., [
      {"field": "encryption_enabled", "operator": "equals", "value": true},
      {"field": "os_version", "operator": "version_gte", "value": "14.0"},
      {"field": "last_checkin", "operator": "within_days", "value": 7}
    ]
  - severity (critical | warning | info)
  - is_enabled (bool)
  - applies_to (JSON) - {"platforms": ["macos"], "sources": ["kandji"]}
  ```
- Add `backend/app/services/compliance_engine.py`:
  - Evaluate devices against policies after each sync
  - Store results per device-policy pair
  - Calculate custom compliance score
- Add routes: CRUD for policies, `GET /compliance/evaluate` to trigger evaluation

**Frontend changes**:
- Add: `frontend/src/pages/CompliancePage.tsx` - Policy list, create/edit forms, evaluation results
- Update: Dashboard - Show custom compliance score alongside provider compliance

#### 7. Patch Management View
**Why**: Track which devices need OS/app updates and identify outdated software.

**Backend changes**:
- Add to `GET /dashboard/summary` - `patch_compliance_pct` field
- Add `GET /apps/outdated` - Apps with multiple versions (oldest installs)
- Add `GET /devices/outdated-os` - Devices below latest OS per platform
- Track "latest known version" per app (derived from fleet data)

**Frontend changes**:
- Add: `frontend/src/pages/PatchManagementPage.tsx`:
  - OS version distribution by platform (which devices are behind)
  - App version matrix (app name vs versions, device counts)
  - "Needs Update" device list
- Update: Dashboard KPI - Add "Patch Compliance %" card

#### 8. User/Employee View
**Why**: See all devices and apps assigned to a specific user for helpdesk and audit use cases.

**Backend changes**:
- Add `GET /users` - Aggregate unique assigned_user + assigned_user_email from devices
- Add `GET /users/:email/devices` - All devices for a user
- Add `GET /users/:email/apps` - All apps across user's devices

**Frontend changes**:
- Add: `frontend/src/pages/UsersPage.tsx` - User list with device count, compliance status
- Add: `frontend/src/pages/UserDetailPage.tsx` - User's devices and apps
- Update: Layout nav - Add "Users" item (icon: `PeopleIcon`)

#### 9. Audit Log
**Why**: Track who triggered syncs, changed credentials, modified settings for compliance.

**Backend changes**:
- Add `AuditLog` model:
  ```
  Table: audit_logs
  - id (UUID PK)
  - user_id (FK, nullable)
  - action (str) - e.g., "sync.trigger", "credential.create", "credential.delete"
  - resource_type (str) - e.g., "credential", "sync", "device"
  - resource_id (str, nullable)
  - details (JSON)
  - ip_address (str, nullable)
  - created_at (datetime)
  ```
- Add `backend/app/services/audit_service.py` - `log_action(user, action, resource, details)`
- Instrument all write endpoints (sync triggers, credential changes, schedule updates)
- Add routes: `GET /audit-logs` with date range, action type, user filters

**Frontend changes**:
- Add: Audit Log viewer in Settings page or standalone page
- Table: timestamp, user, action, details

---

### P3 - Nice to Have (Future Enhancements)

#### 10. Webhook Integrations (Slack/Teams/Email)
- Notify on alert triggers, sync failures, compliance changes
- Add `Webhook` model with URL, events, secret
- Add `backend/app/services/webhook_service.py`
- Webhook management UI in Settings

#### 11. Software License Tracking
- Map apps to known license counts
- Identify over/under-provisioned software
- Add `License` model (app_name, total_licenses, cost_per_license)
- License utilization dashboard

#### 12. Remediation Actions
- Push actions back to Intune/Kandji (lock device, send message, trigger update)
- Add adapter methods: `lock_device()`, `wipe_device()`, `send_message()`
- Confirmation dialog in UI with audit logging

#### 13. Multi-Tenant Support
- Separate data by organization/tenant
- Add `tenant_id` to all models
- Tenant-scoped API queries

#### 14. Database Migration to PostgreSQL
- Replace SQLite with PostgreSQL for production
- Add Alembic for schema migrations
- Update `DATABASE_URL` in config
- Replace SQLite-specific functions (`group_concat` → `string_agg`, etc.)
- Update `backend/app/api/routes/apps.py` - Uses `group_concat` and `max(case(...))` for SQLite compatibility

#### 15. Dark Mode
- Add theme toggle in Layout header
- Use MUI's `createTheme` with dark palette
- Persist preference in localStorage

---

## Implementation Notes for AI Assistants

### Patterns to Follow
1. **New backend route**: Create file in `backend/app/api/routes/`, add Pydantic schemas in `backend/app/schemas/`, register router in `backend/app/main.py` with `app.include_router(router, prefix="/api/v1")`
2. **New model**: Create in `backend/app/models/`, tables auto-create via `create_tables()` at startup (no migrations needed for SQLite)
3. **New frontend page**: Create in `frontend/src/pages/`, add route in `App.tsx`, add nav item in `Layout.tsx`
4. **New API function**: Add TypeScript interface + function in `frontend/src/services/api.ts`
5. **All endpoints require auth**: Use `_user: dict = Depends(get_current_user)` in route params
6. **SQLite compatibility**: Use `group_concat` not `string_agg`, `max(case(...))` not `bool_or`, `func.julianday` for date math
7. **Async everywhere**: All DB operations use `await`, all adapters use `httpx.AsyncClient`
8. **Error handling**: Sync sub-tasks (apps, vulns) log warnings on failure but don't block device sync

### Testing the Backend
```bash
# Start backend
cd backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Test endpoints
curl -u admin:admin http://localhost:8000/api/v1/dashboard/summary
curl -u admin:admin http://localhost:8000/api/v1/apps/summary
curl -u admin:admin "http://localhost:8000/api/v1/dashboard/compliance-trend?days=7"
```

### Testing the Frontend
```bash
cd frontend && npm start
# Runs on http://localhost:3000
# Login: admin / admin
```

### Environment Variables
```
# Backend
DATABASE_URL=sqlite+aiosqlite:///./devices.db
SYNC_INTERVAL_MINUTES=30
SECRET_KEY=change-me-in-production
CORS_ORIGINS=["*"]

# Frontend
REACT_APP_API_URL=http://localhost:8000/api/v1
```
