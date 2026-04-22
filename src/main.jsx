import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ChatProvider } from './context/ChatContext'
import { BildirimProvider } from './context/BildirimContext'
import { AktiviteProvider } from './context/AktiviteContext'
import { ServisTalebiProvider } from './context/ServisTalebiContext'
import { KargoProvider } from './context/KargoContext'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { HatirlatmaProvider } from './context/HatirlatmaContext'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <ServisTalebiProvider>
          <KargoProvider>
            <ChatProvider>
              <BildirimProvider>
                <AktiviteProvider>
                  <ToastProvider>
                    <ConfirmProvider>
                      <HatirlatmaProvider>
                        <App />
                      </HatirlatmaProvider>
                    </ConfirmProvider>
                  </ToastProvider>
                </AktiviteProvider>
              </BildirimProvider>
            </ChatProvider>
          </KargoProvider>
        </ServisTalebiProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)