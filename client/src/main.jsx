import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import App from './App'
import '@mantine/charts/styles.css'
import '@mantine/dates/styles.css'
import './styles/index.css'

const theme = createTheme({
  primaryColor: 'violet',
  primaryShade: { light: 6, dark: 7 },
  fontFamily: 'Inter, system-ui, sans-serif',
  colors: {
    brand: [
      '#f3f4f6',
      '#e5e7eb',
      '#d1d5db',
      '#9ca3af',
      '#6B7280',
      '#6B46C1',
      '#553C9A',
      '#4C1D95',
      '#3B0764',
      '#2D1B69',
    ],
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <DatesProvider settings={{ locale: 'en' }}>
        <Notifications position="top-right" />
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
)
