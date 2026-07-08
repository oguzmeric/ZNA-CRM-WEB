import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { IdleTimeoutProvider } from './context/IdleTimeoutContext'
import { ChatProvider } from './context/ChatContext'
import { BildirimProvider } from './context/BildirimContext'
import { AktiviteProvider } from './context/AktiviteContext'
import { ServisTalebiProvider } from './context/ServisTalebiContext'
import { KargoProvider } from './context/KargoContext'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { HatirlatmaProvider } from './context/HatirlatmaContext'
import { ToplantiHatirlaticiProvider } from './context/ToplantiHatirlaticiContext'
import { ThemeProvider } from './context/ThemeContext'
import './styles/tokens.css'
import './styles/typography.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <IdleTimeoutProvider>
        <ServisTalebiProvider>
          <KargoProvider>
            <ToastProvider>
              <ChatProvider>
                <BildirimProvider>
                  <AktiviteProvider>
                    <ConfirmProvider>
                      <HatirlatmaProvider>
                        <ToplantiHatirlaticiProvider>
                          <App />
                        </ToplantiHatirlaticiProvider>
                      </HatirlatmaProvider>
                    </ConfirmProvider>
                  </AktiviteProvider>
                </BildirimProvider>
              </ChatProvider>
            </ToastProvider>
          </KargoProvider>
        </ServisTalebiProvider>
        </IdleTimeoutProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)