import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Login          from './pages/Login'
import Register       from './pages/Register'
import ResetPassword  from './pages/ResetPassword'
import UpdatePassword from './pages/UpdatePassword'
import Dashboard      from './pages/Dashboard'
import Stocks         from './pages/Stocks'
import Sector         from './pages/Sector'
import Dividend       from './pages/Dividend'
import Layout         from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

// ダークモード初期設定（フラッシュ防止）
const saved = localStorage.getItem('theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
if (saved === 'dark' || (!saved && prefersDark)) {
  document.documentElement.classList.add('dark')
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/update-password" element={<UpdatePassword />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/stocks" element={
          <ProtectedRoute>
            <Layout><Stocks /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/sector" element={
          <ProtectedRoute>
            <Layout><Sector /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/dividend" element={
          <ProtectedRoute>
            <Layout><Dividend /></Layout>
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
