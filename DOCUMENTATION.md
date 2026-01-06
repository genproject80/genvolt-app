# GenVolt IoT Dashboard - Documentation

## 1. Project Overview

**GenVolt IoT Dashboard** is a comprehensive full-stack application designed to visualize real-time data from IoT devices, manage device hierarchies, and provide administrative controls for users, clients, and roles. The system enables users to monitor device health, analyze telemetry data, and generate reports.

---

## 2. Functional Documentation

### 2.1. Authentication & Authorization
*   **Login**: Users authenticate using their credentials. The system uses JWT (JSON Web Tokens) for secure session management.
*   **Role-Based Access Control (RBAC)**: Access to features is controlled by roles (e.g., Admin, User, Viewer).
    *   **Admins** have full access to all modules, including system configuration.
    *   **Standard Users** can view dashboards and devices assigned to them.
*   **Session Management**: Includes features to view active sessions.

### 2.2. Dashboard Module
The core of the application for end-users.
*   **Real-time Monitoring**: Visualizes IoT data streams.
*   **Hierarchy Filtering**: Users can filter devices based on organizational hierarchy (e.g., Region > Site > Zone).
*   **Device Status**: Quick view of online/offline status and critical alerts.
*   **Device Details**: Clicking on a device provides deep-dive analytics, historical data charts, and specific telemetry details.

### 2.3. Admin Panel
A dedicated section for system administrators to manage the platform.
*   **User Management**: Create, update, delete, and list users. Assign roles and client associations.
*   **Role Management**: Define roles and assign granular permissions (e.g., `user.create`, `device.read`).
*   **Client Management**: Manage different clients or tenants within the system.
*   **Device Management**: Add new devices, configure device metadata, and assign devices to the hierarchy.
*   **Sessions**: Monitor active user sessions for security auditing.

### 2.4. Reports
*   **Data Export**: Users can generate and export reports based on IoT data and HKMI (Hierarchy Key Performance Indicator) tables.
*   **Filtering**: Reports can be customized by date range, device, or hierarchy level.

---

## 3. Technical Documentation

### 3.1. Technology Stack

**Frontend:**
*   **Framework**: React (v18)
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS
*   **Components**: Headless UI
*   **State Management**: React Context / Hooks
*   **Routing**: React Router DOM (v6)
*   **HTTP Client**: Axios

**Backend:**
*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **Database Driver**: `mssql` (Microsoft SQL Server)
*   **Authentication**: `jsonwebtoken` (JWT), `bcryptjs`
*   **Security**: `helmet`, `cors`, `express-rate-limit`
*   **Logging**: `winston`
*   **Validation**: `joi`, `express-validator`

**Database:**
*   **System**: Microsoft SQL Server
*   **ORM/Query Builder**: Raw SQL queries via `mssql` driver with parameterized inputs.

### 3.2. Project Structure

```
.
├── client/                 # Frontend Application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React Context (Auth, Theme)
│   │   ├── hooks/          # Custom React Hooks
│   │   ├── pages/          # Application Pages (Admin, Dashboard, etc.)
│   │   ├── services/       # API service calls (Axios wrappers)
│   │   └── utils/          # Utility functions
│   ├── public/             # Static assets
│   └── vite.config.js      # Vite configuration
│
└── server/                 # Backend Application
    ├── config/             # DB and App configuration
    ├── controllers/        # Request handlers
    ├── middleware/         # Auth, Error handling, Logging middleware
    ├── models/             # Database models (Class definitions)
    ├── routes/             # API route definitions
    ├── utils/              # Helper functions (Logger, etc.)
    └── server.js           # Entry point
```

### 3.3. API Endpoints

**Authentication** (`/api/auth`)
*   `POST /login`: Authenticate user and receive JWT.
*   `GET /me`: Get current user profile.

**Users** (`/api/users`)
*   `GET /`: List all users.
*   `POST /`: Create a new user.
*   `PUT /:id`: Update a user.
*   `DELETE /:id`: Delete a user.

**Roles & Permissions**
*   `/api/roles`: Manage user roles.
*   `/api/permissions`: Manage available system permissions.

**Devices & Data**
*   `/api/devices`: CRUD operations for devices.
*   `/api/iot-data`: Retrieve telemetry data.
*   `/api/dashboards`: Dashboard configuration and summary data.
*   `/api/hierarchy-filters`: Get hierarchy tree for filtering.
*   `/api/hkmi-table`: Specific endpoint for HKMI reporting data.

### 3.4. Database Schema
Key models in the system:

*   **User**: Stores user credentials, email, and role association.
*   **Client**: Represents a tenant or customer entity.
*   **Role**: Defines a set of permissions.
*   **Permission**: Granular access control flags.
*   **Device**: Stores device metadata (ID, serial number, type).

### 3.5. Security Measures
*   **JWT Authentication**: Stateless authentication mechanism.
*   **Password Hashing**: Passwords are hashed using `bcryptjs` before storage.
*   **Helmet**: Sets secure HTTP headers to protect against common vulnerabilities.
*   **CORS**: Configured to allow requests only from trusted origins.
*   **Rate Limiting**: Protects APIs from brute-force and DDoS attacks.
*   **Input Validation**: Ensures data integrity and prevents injection attacks.

### 3.6. Setup & Installation

**Prerequisites:**
*   Node.js (>=18.0.0)
*   Microsoft SQL Server

**Steps:**
1.  **Clone the repository**.
2.  **Install Dependencies**:
    ```bash
    # Backend
    cd server
    npm install

    # Frontend
    cd ../client
    npm install
    ```
3.  **Environment Configuration**:
    *   Create `.env` in `server/` with database credentials, JWT secret, and port.
    *   Create `.env` in `client/` if needed for API URL override.
4.  **Run the Application**:
    ```bash
    # Run Backend (from server/ folder)
    npm run dev

    # Run Frontend (from client/ folder)
    npm run dev
    ```
