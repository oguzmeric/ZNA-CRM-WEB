import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export const AKSENT_RENKLER = {
  mavi:    { primary: '#0176D3', dark: '#014486', label: 'Mavi' },
  yesil:   { primary: '#10b981', dark: '#059669', label: 'Yeşil' },
  mor:     { primary: '#8b5cf6', dark: '#6d28d9', label: 'Mor' },
  kirmizi: { primary: '#ef4444', dark: '#dc2626', label: 'Kırmızı' },
  turuncu: { primary: '#f59e0b', dark: '#d97706', label: 'Turuncu' },
  slate:   { primary: '#64748b', dark: '#475569', label: 'Slate' },
}

export function ThemeProvider({ children }) {
  const [mod, setModState] = useState(() => localStorage.getItem('tema_mod') || 'light')
  const [aksent, setAksentState] = useState(() => localStorage.getItem('tema_aksent') || 'mavi')

  const uygula = (yeniMod, yeniAksent) => {
    const html = document.documentElement
    html.setAttribute('data-theme', yeniMod)
    html.setAttribute('data-accent', yeniAksent)
    const renkler = AKSENT_RENKLER[yeniAksent]
    html.style.setProperty('--primary', renkler.primary)
    html.style.setProperty('--primary-dark', renkler.dark)
  }

  useEffect(() => {
    uygula(mod, aksent)
  }, [])

  const setMod = (yeniMod) => {
    setModState(yeniMod)
    localStorage.setItem('tema_mod', yeniMod)
    uygula(yeniMod, aksent)
  }

  const setAksent = (yeniAksent) => {
    setAksentState(yeniAksent)
    localStorage.setItem('tema_aksent', yeniAksent)
    uygula(mod, yeniAksent)
  }

  const hazirTemaUygula = (yeniMod, yeniAksent) => {
    setModState(yeniMod)
    setAksentState(yeniAksent)
    localStorage.setItem('tema_mod', yeniMod)
    localStorage.setItem('tema_aksent', yeniAksent)
    uygula(yeniMod, yeniAksent)
  }

  return (
    <ThemeContext.Provider value={{ mod, aksent, setMod, setAksent, hazirTemaUygula }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
