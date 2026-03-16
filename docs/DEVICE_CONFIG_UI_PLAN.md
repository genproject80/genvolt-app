# Device Configuration UI - Implementation Plan

## Overview

This document outlines the implementation plan for adding a **Device Configuration** section to the Admin panel. This feature enables management of endpoint templates for IoT device configuration, with hierarchical access control.

---

## Feature Requirements Summary

### 1. Endpoint Templates
- Create HTTP Ingest endpoint templates
- Azure Key Vault integration for API keys/codes
- JSON validation in the UI
- Save templates globally or per-client

### 2. Permissions & Access Control
- RBAC permissions for create, edit, delete, and apply operations
- Apply templates at multiple levels: all devices, client-wise, device-wise
- Hierarchical restriction: users can only apply templates to devices within their hierarchy

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                              │
├──────────────────────────────────────────────────────────────────────┤
│  Admin Panel                                                          │
│  └── Device Configuration (New Tab)                                   │
│      ├── Endpoint Templates List                                      │
│      ├── Create/Edit Template Modal                                   │
│      │   ├── JSON Editor with validation                              │
│      │   └── Key Vault Secret Selector                                │
│      ├── Apply Template Modal                                         │
│      │   ├── Scope Selector (Global/Client/Device)                    │
│      │   └── Target Picker (hierarchy-filtered)                       │
│      └── Template Preview/Details Modal                               │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Backend (Express API)                         │
├──────────────────────────────────────────────────────────────────────┤
│  /api/endpoint-templates                                              │
│  ├── GET    /                    - List templates (with filters)      │
│  ├── GET    /:id                 - Get template details               │
│  ├── POST   /                    - Create template                    │
│  ├── PUT    /:id                 - Update template                    │
│  ├── DELETE /:id                 - Delete template                    │
│  ├── POST   /:id/apply           - Apply template to targets          │
│  └── GET    /:id/applications    - Get template application history   │
│                                                                       │
│  /api/keyvault-secrets                                                │
│  └── GET    /                    - List available secret names        │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Database (SQL Server)                         │
├──────────────────────────────────────────────────────────────────────┤
│  endpoint_template              - Template definitions                │
│  endpoint_template_application  - Application history/tracking        │
│  Permission (updated)           - New permissions added               │
│  device (existing)              - ingest_endpoint column              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

> **IMPORTANT:** Before implementing this feature, the following must be completed:
>
> 1. **Device table migration** from `DeviceConfig_DB/IMPLEMENTATION_PLAN.md`:
>    - Add `ingest_endpoint NVARCHAR(MAX)` column to `device` table
>    - Add `user_func_config NVARCHAR(MAX)` column to `device` table
>
> These columns store the actual device configuration that templates will populate.

---

## Existing Database Schema Reference

Based on database inspection (gendb_dev), the following conventions are used:

| Table | Primary Key | Notes |
|-------|-------------|-------|
| `device` | `id` (int) | Also has `device_id` (nvarchar) as unique identifier |
| `client` | `client_id` (int) | Has `parent_id` for hierarchy |
| `user` | `user_id` (int) | |
| `role` | `role_id` (int) | |
| `permissions` | `permission_id` (int) | Simple table: just id + name |
| `role_permission` | Composite (role_id, permission_id) | Junction table |
| `audit_log` | `audit_id` (bigint) | Existing audit trail |
| `client_device` | `id` (int) | Device transfer history |

**Existing Permissions (17 total):**
- User: Create User, Edit User, Delete User, View User, Reset Password
- Client: Create Client, Edit Client, Delete Client, View Client
- Device: Onboard Device, Onboard Channel Device, View Device, Edit Device, Remove Device, Transfer Device
- Role: Create Role, Edit Role

---

## Phase 1: Database Schema

### 1.1 New Tables

#### `endpoint_template`
Stores endpoint template definitions.

```sql
CREATE TABLE endpoint_template (
    id INT IDENTITY(1,1) PRIMARY KEY,

    -- Template identification
    template_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500) NULL,

    -- Scope: NULL = global, client_id = client-specific
    client_id INT NULL,

    -- Template content (JSON)
    endpoint_config NVARCHAR(MAX) NOT NULL,
    -- Example: {"endpoint_url": "https://...", "code_secret_name": "secret-name"}

    -- Metadata
    is_active BIT DEFAULT 1,
    created_by_user_id INT NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by_user_id INT NULL,
    updated_at DATETIME2 NULL,

    -- Constraints
    CONSTRAINT FK_endpoint_template_client
        FOREIGN KEY (client_id) REFERENCES client(client_id),
    CONSTRAINT FK_endpoint_template_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES [user](user_id),
    CONSTRAINT FK_endpoint_template_updated_by
        FOREIGN KEY (updated_by_user_id) REFERENCES [user](user_id),
    CONSTRAINT UQ_endpoint_template_name_client
        UNIQUE (template_name, client_id)
);

-- Indexes
CREATE INDEX IX_endpoint_template_client ON endpoint_template(client_id);
CREATE INDEX IX_endpoint_template_active ON endpoint_template(is_active);
CREATE INDEX IX_endpoint_template_name ON endpoint_template(template_name);
```

#### `endpoint_template_application`
Tracks template applications to devices (audit trail).

```sql
CREATE TABLE endpoint_template_application (
    id INT IDENTITY(1,1) PRIMARY KEY,

    -- Application details
    template_id INT NOT NULL,
    device_id INT NOT NULL,

    -- Previous config (for rollback capability)
    previous_config NVARCHAR(MAX) NULL,

    -- Application metadata
    applied_by_user_id INT NOT NULL,
    applied_at DATETIME2 DEFAULT GETUTCDATE(),

    -- Status
    status NVARCHAR(20) DEFAULT 'applied',
    -- Values: 'applied', 'rolled_back', 'superseded'

    notes NVARCHAR(500) NULL,

    -- Constraints
    CONSTRAINT FK_template_application_template
        FOREIGN KEY (template_id) REFERENCES endpoint_template(id),
    CONSTRAINT FK_template_application_device
        FOREIGN KEY (device_id) REFERENCES device(id),
    CONSTRAINT FK_template_application_applied_by
        FOREIGN KEY (applied_by_user_id) REFERENCES [user](user_id)
);

-- Indexes
CREATE INDEX IX_template_application_template ON endpoint_template_application(template_id);
CREATE INDEX IX_template_application_device ON endpoint_template_application(device_id);
CREATE INDEX IX_template_application_applied_at ON endpoint_template_application(applied_at DESC);
```

### 1.2 New Permissions

```sql
-- Add new permissions for endpoint template management
-- Note: permissions table only has (permission_id, permission_name) columns
INSERT INTO permissions (permission_name) VALUES
('View Endpoint Template'),
('Create Endpoint Template'),
('Edit Endpoint Template'),
('Delete Endpoint Template'),
('Apply Endpoint Template'),
('View Template Applications');

-- Get the new permission IDs (adjust based on actual inserted IDs)
-- You can verify with: SELECT * FROM permissions WHERE permission_name LIKE '%Template%';

-- Assign ALL new permissions to SYSTEM_ADMIN (role_id = 1)
INSERT INTO role_permission (role_id, permission_id)
SELECT 1, permission_id FROM permissions
WHERE permission_name IN (
    'View Endpoint Template',
    'Create Endpoint Template',
    'Edit Endpoint Template',
    'Delete Endpoint Template',
    'Apply Endpoint Template',
    'View Template Applications'
);

-- Assign ALL new permissions to SUPER_ADMIN (role_id = 2)
INSERT INTO role_permission (role_id, permission_id)
SELECT 2, permission_id FROM permissions
WHERE permission_name IN (
    'View Endpoint Template',
    'Create Endpoint Template',
    'Edit Endpoint Template',
    'Delete Endpoint Template',
    'Apply Endpoint Template',
    'View Template Applications'
);

-- Assign View/Apply permissions to CLIENT_ADMIN (role_id = 3)
INSERT INTO role_permission (role_id, permission_id)
SELECT 3, permission_id FROM permissions
WHERE permission_name IN (
    'View Endpoint Template',
    'Apply Endpoint Template',
    'View Template Applications'
);

-- Optionally assign View only to CLIENT_USER (role_id = 4)
INSERT INTO role_permission (role_id, permission_id)
SELECT 4, permission_id FROM permissions
WHERE permission_name = 'View Endpoint Template';
```

---

## Phase 2: Backend API

### 2.1 File Structure

```
server/
├── routes/
│   └── endpointTemplateRoutes.js    (NEW)
├── controllers/
│   └── endpointTemplateController.js (NEW)
├── models/
│   └── EndpointTemplate.js          (NEW)
├── middleware/
│   └── endpointTemplateValidation.js (NEW)
└── server.js                         (UPDATE - add route)
```

### 2.2 API Endpoints

#### `GET /api/endpoint-templates`
List all templates accessible to the user.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | int | Page number (default: 1) |
| limit | int | Items per page (default: 10, max: 100) |
| search | string | Search by name/description |
| client_id | int | Filter by client (null for global) |
| scope | string | 'global', 'client', 'all' |
| is_active | boolean | Filter by active status |

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": 1,
        "template_name": "Default HTTP Ingest",
        "description": "Standard endpoint for SICK sensors",
        "client_id": null,
        "client_name": null,
        "endpoint_config": {
          "endpoint_url": "https://func-iot-ingest.azurewebsites.net/api/ingest",
          "code_secret_name": "ingest-function-code"
        },
        "is_active": true,
        "created_by_user_id": 1,
        "created_by_name": "Admin User",
        "created_at": "2026-01-09T10:00:00Z",
        "application_count": 15
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  }
}
```

**Access Control:**
- SYSTEM_ADMIN/SUPER_ADMIN: See all templates
- CLIENT_ADMIN: See global templates + own client templates
- Users see templates based on hierarchy

---

#### `GET /api/endpoint-templates/:id`
Get single template details.

**Response:**
```json
{
  "success": true,
  "data": {
    "template": {
      "id": 1,
      "template_name": "Default HTTP Ingest",
      "description": "Standard endpoint for SICK sensors",
      "client_id": null,
      "endpoint_config": {
        "endpoint_url": "https://func-iot-ingest.azurewebsites.net/api/ingest",
        "code_secret_name": "ingest-function-code"
      },
      "is_active": true,
      "created_by_user_id": 1,
      "created_by_name": "Admin User",
      "created_at": "2026-01-09T10:00:00Z",
      "updated_by_user_id": null,
      "updated_at": null
    }
  }
}
```

---

#### `POST /api/endpoint-templates`
Create new template.

**Request Body:**
```json
{
  "template_name": "SICK Sensor Endpoint",
  "description": "HTTP ingest for SICK P2 sensors",
  "client_id": null,
  "endpoint_config": {
    "endpoint_url": "https://func-iot-ingest.azurewebsites.net/api/ingest",
    "code_secret_name": "ingest-function-code",
    "protocol_version": "P2"
  }
}
```

**Validation:**
- `template_name`: Required, 3-100 chars, unique per client scope
- `description`: Optional, max 500 chars
- `client_id`: Optional (null = global template)
- `endpoint_config`: Required, valid JSON, must contain `endpoint_url`

**Response (201):**
```json
{
  "success": true,
  "message": "Template created successfully",
  "data": {
    "template": { ... }
  }
}
```

---

#### `PUT /api/endpoint-templates/:id`
Update existing template.

**Request Body:** Same as POST (all fields optional except those being updated)

**Access Control:**
- Can only edit templates within hierarchy
- Global templates require SYSTEM_ADMIN

---

#### `DELETE /api/endpoint-templates/:id`
Soft-delete template (sets is_active = 0).

**Response:**
```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

---

#### `POST /api/endpoint-templates/:id/apply`
Apply template to device(s).

**Request Body:**
```json
{
  "scope": "devices",
  "target_ids": [1, 2, 3],
  "notes": "Applying new ingest endpoint for P2 upgrade"
}
```

**Scope Options:**
| Scope | target_ids | Description |
|-------|------------|-------------|
| `all` | null | Apply to all accessible devices |
| `client` | [client_id, ...] | Apply to all devices of specified clients |
| `devices` | [id, ...] | Apply to specific devices (uses internal `id`, not `device_id` string) |

> **Important:** The device table has two ID fields:
> - `id` (int): Internal primary key used in foreign keys and API
> - `device_id` (nvarchar): Human-readable unique identifier (e.g., "SICK_001")
>
> The apply endpoint uses the internal `id` for consistency with other APIs.

**Validation:**
- User must have access to ALL target devices (hierarchy check)
- Template must be accessible to user
- Cannot apply inactive templates

**Response:**
```json
{
  "success": true,
  "message": "Template applied to 15 devices",
  "data": {
    "applied_count": 15,
    "failed_count": 0,
    "details": [
      { "device_id": "SICK_001", "status": "success" },
      { "device_id": "SICK_002", "status": "success" }
    ]
  }
}
```

---

#### `GET /api/endpoint-templates/:id/applications`
Get application history for a template.

**Query Parameters:**
- `page`, `limit` - Pagination
- `device_id` - Filter by device
- `status` - Filter by status

**Response:**
```json
{
  "success": true,
  "data": {
    "applications": [
      {
        "id": 1,
        "device_id": 5,
        "device_identifier": "SICK_001",
        "client_name": "Client A",
        "applied_by_user_id": 1,
        "applied_by_name": "Admin User",
        "applied_at": "2026-01-09T10:00:00Z",
        "status": "applied",
        "notes": "Initial setup"
      }
    ],
    "pagination": { ... }
  }
}
```

**Note:** `device_id` is the internal integer ID, while `device_identifier` is the string device ID (e.g., "SICK_001").

---

#### `GET /api/keyvault-secrets`
List available Key Vault secrets (names only, not values).

**Response:**
```json
{
  "success": true,
  "data": {
    "secrets": [
      { "name": "ingest-function-code", "description": "IoT Ingest Function API Key" },
      { "name": "sick-api-key", "description": "SICK Sensor API Key" }
    ]
  }
}
```

**Note:** This endpoint returns metadata only. Actual secret values are never exposed to the UI.

---

### 2.3 Middleware & Validation

#### `endpointTemplateValidation.js`

```javascript
// Validation chains
export const createTemplateValidation = [
  body('template_name')
    .trim()
    .notEmpty().withMessage('Template name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 characters')
    .custom(async (value, { req }) => {
      // Check uniqueness within scope
      const exists = await EndpointTemplate.findByNameAndClient(value, req.body.client_id);
      if (exists) throw new Error('Template name already exists for this scope');
    }),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description max 500 characters'),

  body('client_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('Invalid client ID')
    .custom(async (value, { req }) => {
      if (value && !(await canAccessClient(req.user, value))) {
        throw new Error('Cannot create template for this client');
      }
    }),

  body('endpoint_config')
    .notEmpty().withMessage('Endpoint config is required')
    .custom((value) => {
      // Validate JSON structure
      if (typeof value !== 'object') {
        throw new Error('Endpoint config must be a valid JSON object');
      }
      if (!value.endpoint_url) {
        throw new Error('endpoint_url is required in config');
      }
      // Validate URL format
      try {
        new URL(value.endpoint_url);
      } catch {
        throw new Error('endpoint_url must be a valid URL');
      }
      return true;
    })
];

export const applyTemplateValidation = [
  body('scope')
    .notEmpty().withMessage('Scope is required')
    .isIn(['all', 'client', 'devices']).withMessage('Invalid scope'),

  body('target_ids')
    .if(body('scope').isIn(['client', 'devices']))
    .isArray({ min: 1 }).withMessage('target_ids required for client/devices scope')
    .custom((value) => value.every(id => Number.isInteger(id) && id > 0))
    .withMessage('target_ids must be positive integers'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes max 500 characters')
];
```

---

## Phase 3: Frontend Components

### 3.1 File Structure

```
client/src/
├── pages/Admin/
│   └── DeviceConfigManagement.jsx       (NEW)
├── components/
│   └── deviceConfig/                    (NEW directory)
│       ├── EndpointTemplateList.jsx
│       ├── EndpointTemplateCard.jsx
│       ├── TemplateFilters.jsx
│       └── TemplateStats.jsx
├── components/modals/
│   ├── AddTemplateModal.jsx             (NEW)
│   ├── EditTemplateModal.jsx            (NEW)
│   ├── DeleteTemplateModal.jsx          (NEW)
│   ├── ApplyTemplateModal.jsx           (NEW)
│   ├── TemplateDetailsModal.jsx         (NEW)
│   └── TemplateApplicationsModal.jsx    (NEW)
├── components/common/
│   └── JsonEditor.jsx                   (NEW)
├── context/
│   └── EndpointTemplateContext.jsx      (NEW)
├── hooks/
│   └── useEndpointTemplatePermissions.js (NEW)
├── services/
│   └── endpointTemplateService.js       (NEW)
└── pages/Admin/AdminPanel.jsx           (UPDATE - add tab)
```

### 3.2 Component Specifications

#### `DeviceConfigManagement.jsx`
Main page component for the Device Configuration admin section.

**Features:**
- Tab-based layout: Templates | Application History
- Statistics cards (total templates, global, client-specific, recent applications)
- Template list with search/filter
- Action buttons based on permissions

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Device Configuration                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ [Statistics Cards: Total | Global | Client | Recent Applications]   │
├─────────────────────────────────────────────────────────────────────┤
│ [Search Input] [Scope Filter ▼] [Status Filter ▼]  [+ New Template] │
├─────────────────────────────────────────────────────────────────────┤
│ Template List                                                        │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Template Name       │ Scope    │ Applications │ Status │ Actions│ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Default HTTP Ingest │ Global   │ 15           │ Active │ ⚙ ✎ ✗ │ │
│ │ Client A Endpoint   │ Client A │ 8            │ Active │ ⚙ ✎ ✗ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ [< Prev] Page 1 of 3 [Next >]                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### `AddTemplateModal.jsx` / `EditTemplateModal.jsx`
Modal for creating/editing endpoint templates.

**Form Fields:**
| Field | Type | Validation |
|-------|------|------------|
| Template Name | Text Input | Required, 3-100 chars |
| Description | Textarea | Optional, max 500 chars |
| Scope | Radio + Select | Global or Client-specific |
| Endpoint URL | Text Input | Required, valid URL |
| Key Vault Secret | Dropdown | Optional, from available secrets |
| Additional Config | JSON Editor | Optional, must be valid JSON |

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Create Endpoint Template                                      [X]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Template Name *                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ SICK P2 Sensor Endpoint                                         │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Description                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ HTTP ingest endpoint for SICK P2 protocol sensors               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Scope                                                               │
│ (●) Global  ( ) Client-specific  [Select Client ▼]                 │
│                                                                     │
│ ─────────────────── Endpoint Configuration ───────────────────      │
│                                                                     │
│ Endpoint URL *                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ https://func-iot-ingest.azurewebsites.net/api/ingest            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ API Key (Key Vault Secret)                                          │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ingest-function-code                                        ▼   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ℹ Secret value is stored securely in Azure Key Vault               │
│                                                                     │
│ Additional Configuration (JSON)                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ {                                                               │ │
│ │   "protocol_version": "P2",                                     │ │
│ │   "retry_count": 3                                              │ │
│ │ }                                                               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ [✓ Valid JSON]                                                      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                    [Cancel]  [Create Template]      │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### `ApplyTemplateModal.jsx`
Modal for applying a template to devices.

**Features:**
- Scope selection (All/Client/Device)
- Hierarchical target picker (filtered by user access)
- Preview of affected devices
- Confirmation with notes

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Apply Template: "Default HTTP Ingest"                         [X]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Select Application Scope                                            │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ( ) All Devices (15 devices in your hierarchy)                  │ │
│ │ (●) By Client                                                   │ │
│ │ ( ) Specific Devices                                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Select Clients                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [✓] Client A (5 devices)                                        │ │
│ │ [✓] Client B (3 devices)                                        │ │
│ │ [ ] Client C (7 devices)                                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Devices to be updated: 8                                            │
│                                                                     │
│ Notes (optional)                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Upgrading to new ingest endpoint                                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ⚠ Warning: This will overwrite existing endpoint configurations     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                      [Cancel]  [Apply to 8 Devices] │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### `JsonEditor.jsx`
Reusable JSON editor component with validation.

**Features:**
- Syntax highlighting
- Real-time JSON validation
- Error highlighting
- Format/beautify button
- Line numbers

**Props:**
```typescript
interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate: (isValid: boolean, error?: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  height?: string;
}
```

**Implementation Options:**
1. **CodeMirror** - Full-featured, heavier
2. **Monaco Editor** (VS Code editor) - Feature-rich but larger bundle
3. **react-json-view** - Simple JSON viewer/editor
4. **Custom textarea with validation** - Lightweight option

**Recommended:** Use `@monaco-editor/react` for a good balance of features and UX.

---

### 3.3 Context & State Management

#### `EndpointTemplateContext.jsx`

```javascript
const EndpointTemplateContext = createContext();

export const EndpointTemplateProvider = ({ children }) => {
  const [templates, setTemplates] = useState([]);
  const [pagination, setPagination] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // CRUD operations
  const getTemplates = async (filters) => { ... };
  const getTemplateById = async (id) => { ... };
  const createTemplate = async (data) => { ... };
  const updateTemplate = async (id, data) => { ... };
  const deleteTemplate = async (id) => { ... };

  // Application operations
  const applyTemplate = async (id, scope, targetIds, notes) => { ... };
  const getApplications = async (templateId, filters) => { ... };

  // Stats
  const getTemplateStats = async () => { ... };

  return (
    <EndpointTemplateContext.Provider value={{
      templates, pagination, stats, loading, error,
      getTemplates, getTemplateById, createTemplate,
      updateTemplate, deleteTemplate, applyTemplate,
      getApplications, getTemplateStats
    }}>
      {children}
    </EndpointTemplateContext.Provider>
  );
};
```

---

#### `useEndpointTemplatePermissions.js`

```javascript
export const useEndpointTemplatePermissions = () => {
  const { hasPermission } = usePermissions();

  return {
    canViewTemplates: hasPermission('View Endpoint Template'),
    canCreateTemplate: hasPermission('Create Endpoint Template'),
    canEditTemplate: hasPermission('Edit Endpoint Template'),
    canDeleteTemplate: hasPermission('Delete Endpoint Template'),
    canApplyTemplate: hasPermission('Apply Endpoint Template'),
    canViewApplications: hasPermission('View Template Applications'),

    // Composite permissions
    canManageTemplates: hasPermission('Create Endpoint Template') ||
                        hasPermission('Edit Endpoint Template') ||
                        hasPermission('Delete Endpoint Template'),
    hasFullAccess: hasPermission('Create Endpoint Template') &&
                   hasPermission('Edit Endpoint Template') &&
                   hasPermission('Delete Endpoint Template') &&
                   hasPermission('Apply Endpoint Template')
  };
};
```

---

### 3.4 Service Layer

#### `endpointTemplateService.js`

```javascript
import api from './api';

export const endpointTemplateService = {
  // Templates CRUD
  async getAll(options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.search) params.append('search', options.search);
    if (options.scope) params.append('scope', options.scope);
    if (options.client_id) params.append('client_id', options.client_id);
    if (options.is_active !== undefined) params.append('is_active', options.is_active);

    const response = await api.get(`/endpoint-templates?${params}`);
    return response.data;
  },

  async getById(id) {
    const response = await api.get(`/endpoint-templates/${id}`);
    return response.data;
  },

  async create(data) {
    const response = await api.post('/endpoint-templates', data);
    return response.data;
  },

  async update(id, data) {
    const response = await api.put(`/endpoint-templates/${id}`, data);
    return response.data;
  },

  async delete(id) {
    const response = await api.delete(`/endpoint-templates/${id}`);
    return response.data;
  },

  // Application
  async apply(id, scope, targetIds, notes) {
    const response = await api.post(`/endpoint-templates/${id}/apply`, {
      scope,
      target_ids: targetIds,
      notes
    });
    return response.data;
  },

  async getApplications(id, options = {}) {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);

    const response = await api.get(`/endpoint-templates/${id}/applications?${params}`);
    return response.data;
  },

  // Stats
  async getStats() {
    const response = await api.get('/endpoint-templates/stats');
    return response.data;
  },

  // Key Vault secrets (names only)
  async getAvailableSecrets() {
    const response = await api.get('/keyvault-secrets');
    return response.data;
  }
};
```

---

## Phase 4: Integration

### 4.1 Admin Panel Integration

Update `AdminPanel.jsx` to add the new tab:

```javascript
// Add import
import DeviceConfigManagement from './DeviceConfigManagement';
import { CogIcon } from '@heroicons/react/24/outline';

// Add to tabs array
const tabs = [
  // ... existing tabs
  {
    id: 'device-config',
    name: 'Device Configuration',
    icon: CogIcon,
    component: DeviceConfigManagement,
    permission: 'View Endpoint Template'
  }
];
```

### 4.2 Context Provider Integration

Update `App.jsx` to include the new context:

```javascript
import { EndpointTemplateProvider } from './context/EndpointTemplateContext';

// Add to provider stack
<AuthProvider>
  <PermissionProvider>
    <ClientProvider>
      <RoleProvider>
        <UserProvider>
          <DeviceProvider>
            <EndpointTemplateProvider>  {/* NEW */}
              <DashboardProvider>
                ...
              </DashboardProvider>
            </EndpointTemplateProvider>
          </DeviceProvider>
        </UserProvider>
      </RoleProvider>
    </ClientProvider>
  </PermissionProvider>
</AuthProvider>
```

### 4.3 Server Route Registration

Update `server.js`:

```javascript
import endpointTemplateRoutes from './routes/endpointTemplateRoutes.js';

// Add route
app.use('/api/endpoint-templates', endpointTemplateRoutes);
```

---

## Phase 5: Implementation Checklist

### Phase 0: Prerequisites
- [ ] **Execute DeviceConfig_DB/IMPLEMENTATION_PLAN.md first:**
  - [ ] Backup device table
  - [ ] Add `ingest_endpoint` column to device table
  - [ ] Add `user_func_config` column to device table
  - [ ] Set up Azure Key Vault (if not exists)
  - [ ] Add secrets to Key Vault
  - [ ] Test DeviceConfig Azure Function

### Phase 5.1: Database (Day 1)
- [ ] Create `endpoint_template` table
- [ ] Create `endpoint_template_application` table
- [ ] Add new permissions to `permissions` table (lowercase)
- [ ] Assign permissions to roles via `role_permission` table
- [ ] Create indexes
- [ ] Test queries

### Phase 5.2: Backend API (Days 2-3)
- [ ] Create `EndpointTemplate` model
- [ ] Create `endpointTemplateController.js`
- [ ] Create `endpointTemplateRoutes.js`
- [ ] Create `endpointTemplateValidation.js`
- [ ] Implement CRUD endpoints
- [ ] Implement apply endpoint with batch processing
- [ ] Implement applications history endpoint
- [ ] Add Key Vault secrets endpoint (if needed)
- [ ] Register routes in server.js
- [ ] Write API tests

### Phase 5.3: Frontend - Core (Days 4-5)
- [ ] Create `endpointTemplateService.js`
- [ ] Create `EndpointTemplateContext.jsx`
- [ ] Create `useEndpointTemplatePermissions.js`
- [ ] Create `DeviceConfigManagement.jsx` page
- [ ] Create `EndpointTemplateList.jsx` component
- [ ] Add tab to AdminPanel

### Phase 5.4: Frontend - Modals (Days 6-7)
- [ ] Create `JsonEditor.jsx` component
- [ ] Create `AddTemplateModal.jsx`
- [ ] Create `EditTemplateModal.jsx`
- [ ] Create `DeleteTemplateModal.jsx`
- [ ] Create `ApplyTemplateModal.jsx`
- [ ] Create `TemplateDetailsModal.jsx`
- [ ] Create `TemplateApplicationsModal.jsx`

### Phase 5.5: Testing & Polish (Day 8)
- [ ] Test all CRUD operations
- [ ] Test permission restrictions
- [ ] Test hierarchical access control
- [ ] Test apply functionality at all scopes
- [ ] Test JSON validation
- [ ] UI polish and error handling
- [ ] Documentation updates

---

## Security Considerations

### 1. Key Vault Integration
- **Never expose secret values to the UI** - only secret names
- Secret values are fetched server-side during device config requests
- Validate secret names exist before storing in templates

### 2. Hierarchical Access Control
- All template operations respect client hierarchy
- Users cannot apply templates to devices outside their hierarchy
- Global templates require elevated permissions

### 3. Input Validation
- JSON config validated for structure and required fields
- URL validation for endpoint URLs
- XSS prevention via input sanitization

### 4. Audit Trail
- All template changes logged with user ID and timestamp
- Template applications tracked in `endpoint_template_application`
- Previous configs stored for potential rollback

---

## Phase 6: Device Settings Management (user_func_config)

> **Note:** This section covers the per-device functional configuration management (`user_func_config` column), which is separate from endpoint templates (`ingest_endpoint`). This feature was added to provide comprehensive device configuration capabilities.

### 6.1 Overview

The Device Settings section enables administrators to:
- View and edit per-device functional settings (`user_func_config`)
- Toggle Config Mode (debug mode) for individual devices
- Create and apply settings templates for consistent device configuration
- Use a dynamic form builder to define custom configuration fields

### 6.2 Feature Requirements

#### 6.2.1 Per-Device Settings Management
- View current `user_func_config` for any device
- Edit settings via Form Mode or JSON Mode
- Copy settings from one device to compatible devices
- Different settings schemas per device type (SICK P2, SICK P1, Gas Sensor)

#### 6.2.2 Config Mode (Debug Mode)
- Toggle button per device to enable/disable debug mode
- Confirmation modal showing Device ID and Debug Mode value change
- Visual indicators for devices with Config Mode enabled
- Automatic update of `debugmode` field in `user_func_config`

#### 6.2.3 Settings Templates
- Create reusable configuration templates
- Templates scoped by device type
- Apply templates to multiple devices at once
- Dynamic form builder for custom field definitions

---

### 6.3 Architecture Addition

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                              │
├──────────────────────────────────────────────────────────────────────┤
│  Admin Panel                                                          │
│  └── Device Settings (New Tab)                                        │
│      ├── Devices Sub-tab                                              │
│      │   ├── Device List with Config Mode toggles                     │
│      │   ├── View Settings Modal (per device type)                    │
│      │   ├── Edit Settings Modal (Form/JSON modes)                    │
│      │   └── Copy Settings Modal                                      │
│      └── Settings Templates Sub-tab                                   │
│          ├── Template List                                            │
│          ├── Create Template Modal (Dynamic Form Builder)             │
│          ├── Edit Template Modal                                      │
│          ├── View Template Modal                                      │
│          └── Apply Template Modal                                     │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Backend (Express API)                         │
├──────────────────────────────────────────────────────────────────────┤
│  /api/device-settings                                                 │
│  ├── GET    /:deviceId          - Get device user_func_config         │
│  ├── PUT    /:deviceId          - Update device user_func_config      │
│  ├── PUT    /:deviceId/config-mode - Toggle config/debug mode         │
│  └── POST   /:deviceId/copy     - Copy settings to other devices      │
│                                                                       │
│  /api/settings-templates                                              │
│  ├── GET    /                   - List settings templates             │
│  ├── GET    /:id                - Get template details                │
│  ├── POST   /                   - Create template                     │
│  ├── PUT    /:id                - Update template                     │
│  ├── DELETE /:id                - Delete template                     │
│  └── POST   /:id/apply          - Apply template to devices           │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Database (SQL Server)                         │
├──────────────────────────────────────────────────────────────────────┤
│  device (existing)              - user_func_config column             │
│  settings_template (NEW)        - Settings template definitions       │
│  settings_template_application  - Application history/tracking        │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 6.4 Database Schema

#### `settings_template`
Stores functional settings template definitions.

```sql
CREATE TABLE settings_template (
    id INT IDENTITY(1,1) PRIMARY KEY,

    -- Template identification
    template_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500) NULL,

    -- Device type constraint
    device_type NVARCHAR(50) NOT NULL,
    -- Values: 'SICK_P2', 'SICK_P1', 'GAS_SENSOR'

    -- Template content (JSON)
    settings_config NVARCHAR(MAX) NOT NULL,
    -- Example: {"Motor_On_Time": 20, "Motor_Off_Time": 12, "debugmode": 0}

    -- Metadata
    is_active BIT DEFAULT 1,
    created_by_user_id INT NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by_user_id INT NULL,
    updated_at DATETIME2 NULL,

    -- Constraints
    CONSTRAINT FK_settings_template_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES [user](user_id),
    CONSTRAINT FK_settings_template_updated_by
        FOREIGN KEY (updated_by_user_id) REFERENCES [user](user_id),
    CONSTRAINT UQ_settings_template_name_type
        UNIQUE (template_name, device_type)
);

-- Indexes
CREATE INDEX IX_settings_template_device_type ON settings_template(device_type);
CREATE INDEX IX_settings_template_active ON settings_template(is_active);
```

#### `settings_template_application`
Tracks template applications to devices.

```sql
CREATE TABLE settings_template_application (
    id INT IDENTITY(1,1) PRIMARY KEY,

    template_id INT NOT NULL,
    device_id INT NOT NULL,

    -- Previous config for rollback
    previous_config NVARCHAR(MAX) NULL,

    -- Application metadata
    applied_by_user_id INT NOT NULL,
    applied_at DATETIME2 DEFAULT GETUTCDATE(),

    status NVARCHAR(20) DEFAULT 'applied',
    notes NVARCHAR(500) NULL,

    CONSTRAINT FK_settings_app_template
        FOREIGN KEY (template_id) REFERENCES settings_template(id),
    CONSTRAINT FK_settings_app_device
        FOREIGN KEY (device_id) REFERENCES device(id),
    CONSTRAINT FK_settings_app_applied_by
        FOREIGN KEY (applied_by_user_id) REFERENCES [user](user_id)
);

CREATE INDEX IX_settings_app_template ON settings_template_application(template_id);
CREATE INDEX IX_settings_app_device ON settings_template_application(device_id);
```

#### New Permissions

```sql
INSERT INTO permissions (permission_name) VALUES
('View Device Settings'),
('Edit Device Settings'),
('Toggle Config Mode'),
('View Settings Template'),
('Create Settings Template'),
('Edit Settings Template'),
('Delete Settings Template'),
('Apply Settings Template');
```

---

### 6.5 Device Type Configurations

Different device types have different configuration schemas:

#### SICK P2 Sensor
```json
{
  "Motor_On_Time": 20,
  "Motor_Off_Time": 12,
  "Wheels_Configured": 100,
  "Motor_Mode": 1,
  "Motor_Debug_Time": 10,
  "debugmode": 0
}
```

#### SICK P1 Sensor
```json
{
  "Polling_Interval": 30,
  "Fault_Code_Threshold": 5,
  "debugmode": 0
}
```

#### Gas Sensor
```json
{
  "alarm_threshold_ppm": 100,
  "sampling_interval_sec": 60,
  "sensor_warmup_time": 30,
  "calibration_date": "2026-01-01"
}
```

---

### 6.6 Frontend Components

#### File Structure Addition
```
client/src/
├── pages/Admin/
│   └── DeviceSettingsManagement.jsx        (NEW)
├── components/
│   └── deviceSettings/                     (NEW directory)
│       ├── DeviceSettingsList.jsx
│       ├── DeviceSettingsCard.jsx
│       ├── SettingsTemplateList.jsx
│       ├── ConfigModeToggle.jsx
│       └── DynamicFormBuilder.jsx
├── components/modals/
│   ├── ViewDeviceSettingsModal.jsx         (NEW)
│   ├── EditDeviceSettingsModal.jsx         (NEW)
│   ├── CopySettingsModal.jsx               (NEW)
│   ├── ConfigModeConfirmModal.jsx          (NEW)
│   ├── CreateSettingsTemplateModal.jsx     (NEW)
│   ├── EditSettingsTemplateModal.jsx       (NEW)
│   ├── ViewSettingsTemplateModal.jsx       (NEW)
│   └── ApplySettingsTemplateModal.jsx      (NEW)
├── context/
│   └── DeviceSettingsContext.jsx           (NEW)
└── services/
    └── deviceSettingsService.js            (NEW)
```

---

### 6.7 UI Specifications

#### 6.7.1 Device Settings Main Page

```
┌─────────────────────────────────────────────────────────────────────┐
│ Device Settings                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ [Devices] [Settings Templates]  <- Sub-navigation tabs              │
├─────────────────────────────────────────────────────────────────────┤
│ [Statistics Cards: Total | Configured | Not Configured | Types]     │
├─────────────────────────────────────────────────────────────────────┤
│ [Search] [Client Filter ▼] [Type Filter ▼] [Status Filter ▼]       │
├─────────────────────────────────────────────────────────────────────┤
│ Device List                                                          │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Device    │ Client │ Type    │ Status │ Config Mode │ Actions  │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ SICK_001  │ Acme   │ SICK P2 │ ✓ Conf │ [OFF]       │ 👁 ✎ 📋 │ │
│ │ SICK_002  │ Acme   │ SICK P2 │ ✓ Conf │ [ON] 🔴     │ 👁 ✎ 📋 │ │
│ │ GAS_001   │ Beta   │ Gas     │ ⚠ None │ [OFF]       │ 👁 ✎ 📋 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ [< Prev] Page 1 of 5 [Next >]                                       │
└─────────────────────────────────────────────────────────────────────┘
```

#### 6.7.2 Config Mode Confirmation Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Enable Config Mode?                              │
├─────────────────────────────────────────────────────────────────────┤
│                          [🔧]                                        │
│                                                                     │
│                        Device ID                                     │
│                    ┌─────────────┐                                  │
│                    │  SICK_001   │                                  │
│                    └─────────────┘                                  │
│                                                                     │
│              Debug Mode Value Change                                 │
│         ┌─────────┐         ┌─────────┐                            │
│         │ 0 (Off) │   →     │ 1 (On)  │                            │
│         │ Current │         │   New   │                            │
│         └─────────┘         └─────────┘                            │
│                                                                     │
│  ⚠ Warning: Enabling Config Mode will set Debug Mode to 1 (On).    │
│     Device will enter debug/diagnostic mode.                        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Enable Config Mode]          │
└─────────────────────────────────────────────────────────────────────┘
```

#### 6.7.3 Dynamic Form Builder (Create Settings Template)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Create Settings Template                                        [X] │
├─────────────────────────────────────────────────────────────────────┤
│ Template Name *                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ SICK P2 High Performance                                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Device Type *                                                       │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ SICK P2 Sensor                                              ▼   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Configuration Settings      [Form Builder] [JSON Editor]            │
│                                                                     │
│ Quick Start: [SICK P2 Defaults] [SICK P1 Defaults] [Gas] [Clear]   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Field Name      │ Type     │ Value          │ Actions           │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Motor_On_Time   │ Number ▼ │ [20]           │ [🗑]              │ │
│ │ Motor_Off_Time  │ Number ▼ │ [12]           │ [🗑]              │ │
│ │ debugmode       │ Number ▼ │ [0]            │ [🗑]              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [+ Add Field]                                                       │
│                                                                     │
│ JSON Preview (3 fields)                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ {                                                               │ │
│ │   "Motor_On_Time": 20,                                          │ │
│ │   "Motor_Off_Time": 12,                                         │ │
│ │   "debugmode": 0                                                │ │
│ │ }                                                               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                                    [Cancel]  [Create Template]       │
└─────────────────────────────────────────────────────────────────────┘
```

#### 6.7.4 Field Types Supported

| Type | Input Control | JSON Value |
|------|--------------|------------|
| Number | `<input type="number">` | `20` |
| String | `<input type="text">` | `"value"` |
| Boolean | `<select>` (true/false) | `true` / `false` |
| Date | `<input type="date">` | `"2026-01-01"` |

---

### 6.8 API Endpoints

#### Device Settings

```
GET    /api/device-settings/:deviceId
PUT    /api/device-settings/:deviceId
PUT    /api/device-settings/:deviceId/config-mode
POST   /api/device-settings/:deviceId/copy
```

#### Settings Templates

```
GET    /api/settings-templates
GET    /api/settings-templates/:id
POST   /api/settings-templates
PUT    /api/settings-templates/:id
DELETE /api/settings-templates/:id
POST   /api/settings-templates/:id/apply
GET    /api/settings-templates/:id/applications
```

---

### 6.9 Implementation Checklist

#### Phase 6.1: Database
- [ ] Create `settings_template` table
- [ ] Create `settings_template_application` table
- [ ] Add Device Settings permissions
- [ ] Assign permissions to roles

#### Phase 6.2: Backend API
- [ ] Create `deviceSettingsController.js`
- [ ] Create `settingsTemplateController.js`
- [ ] Create route files
- [ ] Implement validation middleware
- [ ] Register routes in server.js

#### Phase 6.3: Frontend - Devices Tab
- [ ] Create `DeviceSettingsManagement.jsx`
- [ ] Create `DeviceSettingsList.jsx`
- [ ] Create `ViewDeviceSettingsModal.jsx`
- [ ] Create `EditDeviceSettingsModal.jsx`
- [ ] Create `CopySettingsModal.jsx`
- [ ] Create `ConfigModeConfirmModal.jsx`
- [ ] Implement Config Mode toggle functionality

#### Phase 6.4: Frontend - Settings Templates Tab
- [ ] Create `SettingsTemplateList.jsx`
- [ ] Create `CreateSettingsTemplateModal.jsx` with Form Builder
- [ ] Create `EditSettingsTemplateModal.jsx`
- [ ] Create `ViewSettingsTemplateModal.jsx`
- [ ] Create `ApplySettingsTemplateModal.jsx`
- [ ] Implement Dynamic Form Builder component
- [ ] Implement preset template loading
- [ ] Implement Form/JSON mode switching

#### Phase 6.5: Testing
- [ ] Test per-device settings CRUD
- [ ] Test Config Mode toggle
- [ ] Test settings template CRUD
- [ ] Test dynamic form builder
- [ ] Test template application
- [ ] Test Form ↔ JSON synchronization

---

## Future Enhancements

### Endpoint Templates
1. **Template Versioning** - Track template changes over time
2. **Template Rollback** - Restore previous device configs
3. **Template Import/Export** - JSON file import/export
4. **Template Scheduling** - Schedule future applications
5. **Template Validation** - Test template against device before applying
6. **Bulk Operations UI** - Enhanced device selection interface
7. **Template Categories** - Organize templates by type/protocol

### Device Settings
8. **Settings History** - Track all changes to device settings over time
9. **Settings Comparison** - Compare settings between devices
10. **Bulk Config Mode** - Enable/disable config mode for multiple devices
11. **Settings Validation Rules** - Define validation rules per device type
12. **Settings Diff View** - Show differences when applying templates
13. **Settings Export** - Export device settings to CSV/JSON
14. **Scheduled Settings Changes** - Schedule settings updates for maintenance windows

---

## Dependencies

### Backend
- No new npm packages required (uses existing stack)

### Frontend
```json
{
  "@monaco-editor/react": "^4.6.0"
}
```

---

## Appendix: Example Data

### Sample Template JSON
```json
{
  "template_name": "SICK P2 Production Endpoint",
  "description": "HTTP ingest for SICK P2 sensors in production environment",
  "client_id": null,
  "endpoint_config": {
    "endpoint_url": "https://func-iot-ingest-prod.azurewebsites.net/api/ingest",
    "code_secret_name": "prod-ingest-function-code",
    "protocol_version": "P2",
    "retry_config": {
      "max_retries": 3,
      "retry_delay_ms": 1000
    },
    "feature_flags": {
      "enable_gps": true,
      "enable_motor_monitoring": true
    }
  }
}
```

### Database Record Example
```sql
INSERT INTO endpoint_template
(template_name, description, client_id, endpoint_config, is_active, created_by_user_id)
VALUES (
  'SICK P2 Production Endpoint',
  'HTTP ingest for SICK P2 sensors in production environment',
  NULL,
  '{"endpoint_url":"https://func-iot-ingest-prod.azurewebsites.net/api/ingest","code_secret_name":"prod-ingest-function-code","protocol_version":"P2"}',
  1,
  1
);

-- Verify the insert
SELECT * FROM endpoint_template WHERE template_name = 'SICK P2 Production Endpoint';
```

---

## UI Prototype Reference

A static HTML prototype has been created to visualize the UI components described in this plan.

**Location:** `docs/device-config-ui-prototype.html`

### Prototype Features Implemented

#### Device Configuration (Endpoint Templates)
- Sidebar navigation with section switching
- Statistics cards
- Template list with search/filter
- Add/Edit/Delete Template modals
- Apply Template modal with scope selection
- Template Details modal with Configuration/History tabs

#### Device Settings (user_func_config)
- Sub-navigation tabs (Devices / Settings Templates)
- Device list with Config Mode toggle buttons
- View/Edit Settings modals (Form Mode + JSON Mode)
- Copy Settings modal
- Config Mode confirmation with Debug Mode value display
- Settings Templates list
- Create Settings Template with Dynamic Form Builder
- View/Edit/Apply Settings Template modals

### How to Use the Prototype

1. Open `docs/device-config-ui-prototype.html` in a web browser
2. Use the sidebar to switch between "Device Configuration" and "Device Settings"
3. Click on action buttons to open modals
4. In Device Settings, use the sub-tabs to switch between "Devices" and "Settings Templates"
5. Test the Config Mode toggle to see the confirmation flow
6. Test the Dynamic Form Builder in "Create Template"

### Prototype Limitations

- Static data only (no API calls)
- No actual data persistence
- Some interactions are simulated with JavaScript
- Designed for visualization and stakeholder review
