# EMT Dashboard — Endpoint Management Tool

A unified dashboard for managing endpoint devices across Microsoft Intune, Kandji, and Qualys. Built for managers/VPs needing an executive overview of endpoint health, compliance, and security posture.

## Features

- **Unified Device View** — Aggregate devices from Intune, Kandji, and Qualys
- **Dashboard** — KPI cards, compliance trends, vulnerability summary, OS currency, security posture
- **Application Inventory** — Fleet-wide app tracking with managed/unmanaged breakdown
- **Automated Sync** — Scheduled background sync with configurable intervals
- **CSV Reports** — Generate reports saved to `~/emt` folder
- **SSO with Microsoft Entra ID** — Configure in-app via Settings (no env vars needed)
- **RBAC** — Owner / Admin / Read-Only roles with route-level protection
- **Encrypted Credentials** — Fernet encryption for stored API keys

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- npm

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

On first startup, a default admin user is created: `admin@local` / `admin`

### Frontend

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000 and sign in with `admin@local` / `admin`.

## Configuration

### API Credentials (Intune, Kandji, Qualys)

Configure via **Settings** page in the app. Credentials are encrypted and stored in the local SQLite database.

### Microsoft SSO (Entra ID)

Configure via **Settings > Microsoft Entra ID (SSO)** in the app:

1. Register an app in Azure Portal > App Registrations
2. Set redirect URI to your app URL (e.g., `http://localhost:3000`)
3. Add API permission: `User.Read` (Microsoft Graph)
4. Copy the **Application (Client) ID** and **Directory (Tenant) ID**
5. Paste them into the SSO Configuration section in Settings

### Environment Variables (optional)

Create `backend/.env` for custom settings:

```env
SECRET_KEY=your-production-secret-key
DATABASE_URL=sqlite+aiosqlite:///./devices.db
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

## Roles

| Role | Dashboard | Devices | Apps | Settings | Users |
|------|-----------|---------|------|----------|-------|
| **Owner** | View | View | View | Full | Full |
| **Admin** | View | View | View | Full | - |
| **Read-Only** | View | View | View | - | - |

## Tech Stack

- **Backend**: Python 3.9, FastAPI, SQLAlchemy (async), SQLite, APScheduler
- **Frontend**: React 18, TypeScript, MUI v6, Recharts
- **Auth**: JWT (python-jose), MSAL (@azure/msal-browser), RBAC
- **Encryption**: Fernet (cryptography library)
