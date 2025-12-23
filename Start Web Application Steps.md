# Start Web Application Steps

## Prerequisites
- Node.js (v18.0.0 or higher)
- Database credentials configured in `server/.env`

## Quick Start

### Option 1: Using Two Terminal Windows (Recommended)

#### Terminal 1 - Start Backend Server
```bash
cd /Users/aj/Library/CloudStorage/OneDrive-Personal/Genvolt/Development/genvolt-app-main/server
npm run dev
```

The backend server will start on **http://localhost:5001**

#### Terminal 2 - Start Frontend Client
```bash
cd /Users/aj/Library/CloudStorage/OneDrive-Personal/Genvolt/Development/genvolt-app-main/client
npm run dev
```

The frontend will start on **http://localhost:5173** (or the next available port)

---

## Detailed Steps

### 1. Install Dependencies (First Time Only)

If you haven't installed dependencies yet:

**Backend:**
```bash
cd /Users/aj/Library/CloudStorage/OneDrive-Personal/Genvolt/Development/genvolt-app-main/server
npm install
```

**Frontend:**
```bash
cd /Users/aj/Library/CloudStorage/OneDrive-Personal/Genvolt/Development/genvolt-app-main/client
npm install
```

### 2. Configure Environment Variables (First Time Only)

Ensure the `.env` file exists in the server directory with the following configuration:

**File Location:** `/Users/aj/Library/CloudStorage/OneDrive-Personal/Genvolt/Development/genvolt-app-main/server/.env`

**Required Variables:**
- `DB_SERVER` - Azure SQL Server address
- `DB_DATABASE` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `JWT_SECRET` - Secret key for access tokens
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens

### 3. Start the Servers

**Step 1: Start Backend Server**
- Open a new terminal window
- Navigate to server directory and run dev mode:
  ```bash
  cd /Users/aj/Library/CloudStorage/OneDrive-Personal/Genvolt/Development/genvolt-app-main/server
  npm run dev
  ```
- Wait for the message: `🚀 Server running in development mode on port 5001`
- Keep this terminal window open

**Step 2: Start Frontend Client**
- Open another terminal window
- Navigate to client directory and run dev mode:
  ```bash
  cd /Users/aj/Library/CloudStorage/OneDrive-Personal/Genvolt/Development/genvolt-app-main/client
  npm run dev
  ```
- Wait for the message showing the local URL (usually `http://localhost:5173`)
- Keep this terminal window open

### 4. Access the Application

Once both servers are running:
- **Frontend Application:** http://localhost:5173
- **Backend API:** http://localhost:5001/api
- **API Health Check:** http://localhost:5001/health
- **API Documentation:** http://localhost:5001/api

---

## Database Configuration

The application connects to Azure SQL Server with these credentials:
- **Server:** genvolt-sql-server.database.windows.net
- **Database:** gendb_dev
- **Username:** genadmin
- **Authentication:** SQL Authentication with encrypted connection

---

## Stopping the Servers

To stop either server:
- Press `Ctrl + C` in the respective terminal window
- Or close the terminal window

---

## Troubleshooting

### Backend Issues

**Error: "JWT configuration missing"**
- Ensure both `JWT_SECRET` and `JWT_REFRESH_SECRET` are set in `.env`
- Restart the server after updating `.env`

**Error: Database connection failed**
- Verify database credentials in `.env`
- Check network connectivity to Azure SQL Server
- Ensure firewall rules allow your IP address

**Error: Port 5001 already in use**
- Change the `PORT` value in `.env` file
- Or stop the process using port 5001

### Frontend Issues

**Error: Port 5173 already in use**
- Vite will automatically try the next available port
- Or manually specify a port in `client/vite.config.js`

**Error: Network error / Cannot connect to backend**
- Ensure backend server is running on port 5001
- Check CORS configuration in `server/.env`
- Verify `VITE_API_URL` if set in client environment

### Browser Console Errors

**Error: "Token pair generation failed"**
- This means `JWT_REFRESH_SECRET` is missing from `.env`
- Add the secret and restart the backend server

**Error: 400 Bad Request on login**
- Check server logs for detailed error message
- Verify database connection is successful
- Ensure user exists in the database

---

## Development Scripts

### Backend (server/)
- `npm run dev` - Start server with auto-reload (nodemon)
- `npm start` - Start server in production mode
- `npm test` - Run tests
- `npm run lint` - Run ESLint

### Frontend (client/)
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build

---

## Notes

- The backend uses **nodemon** which auto-restarts on file changes
- The frontend uses **Vite** which has hot module replacement (HMR)
- Both servers must be running for the application to work properly
- Refresh tokens are stored as httpOnly cookies
- Access tokens are stored in localStorage
