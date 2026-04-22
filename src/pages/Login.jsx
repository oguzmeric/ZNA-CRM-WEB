import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Login() {
  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [sifre, setSifre] = useState('')
  const [hata, setHata] = useState('')
  const navigate = useNavigate()
  const { girisYap } = useAuth()

  const handleGiris = async () => {
    const basarili = await girisYap(kullaniciAdi, sifre)
    if (basarili) {
      navigate('/dashboard')
    } else {
      setHata('Kullanıcı adı veya şifre hatalı!')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleGiris()
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center relative overflow-hidden">

      <img
        src="/logo.jpeg"
        alt=""
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '75%',
          height: '75%',
          objectFit: 'contain',
          opacity: 0.04,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      <div className="relative z-10 bg-white p-8 rounded-xl shadow-md w-full max-w-sm">

        <div className="flex justify-center mb-5">
          <img src="/logo.jpeg" alt="ZNA Logo" className="h-14 object-contain" />
        </div>

        <h1 className="text-xl font-semibold text-gray-800 mb-1 text-center">ZNA CRM</h1>
        <p className="text-gray-400 text-sm mb-6 text-center">Devam etmek için giriş yapın</p>

        <div className="mb-4">
          <label className="text-sm text-gray-600 mb-1 block">Kullanıcı Adı</label>
          <input
            type="text"
            value={kullaniciAdi}
            onChange={(e) => setKullaniciAdi(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="kullanici_adi"
          />
        </div>

        <div className="mb-4">
          <label className="text-sm text-gray-600 mb-1 block">Şifre</label>
          <input
            type="password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        {hata && (
          <p className="text-red-500 text-sm mb-4">{hata}</p>
        )}

        <button
          onClick={handleGiris}
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition"
        >
          Giriş Yap
        </button>

      </div>
    </div>
  )
}

export default Login