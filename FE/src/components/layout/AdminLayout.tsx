import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Layout, Menu, Avatar, Typography, Button, Tag, Space } from 'antd'
import {
  DashboardOutlined,
  AppstoreOutlined,
  TagOutlined,
  ShoppingOutlined,
  HddOutlined,
  TeamOutlined,
  LogoutOutlined,
  ExportOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
  MessageOutlined,
  SettingOutlined,
  CodeOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/authStore'

const { Sider, Header, Content } = Layout
const { Text, Title } = Typography

interface AdminLayoutProps {
  children: ReactNode
}

const NAV_ITEMS = [
  { key: '/admin', label: 'Dashboard', icon: <DashboardOutlined />, exact: true, group: 'Tổng quan' },
  { key: '/admin/analytics', label: 'Thống kê', icon: <BarChartOutlined />, exact: false, group: 'Tổng quan' },
  { key: '/admin/data-studio', label: 'Thống kê dữ liệu', icon: <CodeOutlined />, exact: false, group: 'Tổng quan' },
  { key: '/admin/products', label: 'Sản phẩm', icon: <AppstoreOutlined />, exact: false, group: 'Sản phẩm' },
  { key: '/admin/categories', label: 'Danh mục', icon: <TagOutlined />, exact: false, group: 'Sản phẩm' },
  { key: '/admin/orders', label: 'Đơn hàng', icon: <ShoppingOutlined />, exact: false, group: 'Vận hành' },
  { key: '/admin/inventory', label: 'Kho hàng', icon: <HddOutlined />, exact: false, group: 'Vận hành' },
  { key: '/admin/flash-sales', label: 'Flash Sale', icon: <ThunderboltOutlined />, exact: false, group: 'Vận hành' },
  { key: '/admin/users', label: 'Người dùng', icon: <TeamOutlined />, exact: false, group: 'Người dùng' },
  { key: '/admin/chat', label: 'Chat khách hàng', icon: <MessageOutlined />, exact: true, group: 'Hỗ trợ' },
  { key: '/admin/chat/config', label: 'Cấu hình chat', icon: <SettingOutlined />, exact: false, group: 'Hỗ trợ' },
]

const GROUPS = ['Tổng quan', 'Sản phẩm', 'Vận hành', 'Người dùng', 'Hỗ trợ']

export default function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const selectedKey =
    NAV_ITEMS.find((n) =>
      n.exact ? location.pathname === n.key : location.pathname.startsWith(n.key),
    )?.key ?? '/admin'

  const currentLabel = NAV_ITEMS.find((n) => n.key === selectedKey)?.label ?? 'Admin'

  const menuItems = GROUPS.map((group) => ({
    type: 'group' as const,
    label: group,
    children: NAV_ITEMS.filter((n) => n.group === group).map((n) => ({
      key: n.key,
      icon: n.icon,
      label: <Link to={n.key}>{n.label}</Link>,
    })),
  }))

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        theme="dark"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          overflow: 'auto',
          background: '#0f172a',
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '20px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Text style={{ color: '#60a5fa', fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', display: 'block' }}>
            Admin Panel
          </Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 700, display: 'block', marginTop: 4 }}>
            EcoShop
          </Text>
          <Link
            to="/"
            style={{ color: '#94a3b8', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}
          >
            <ExportOutlined /> Về cửa hàng
          </Link>
        </div>

        {/* User info */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Space>
            <Avatar style={{ backgroundColor: '#2563eb', flexShrink: 0 }} size={36}>
              {user?.fullName?.charAt(0)?.toUpperCase() ?? 'A'}
            </Avatar>
            <div style={{ minWidth: 0 }}>
              <Text
                style={{ color: '#fff', fontSize: 13, fontWeight: 500, display: 'block' }}
                ellipsis
              >
                {user?.fullName}
              </Text>
              <Text
                style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}
                ellipsis
              >
                {user?.email}
              </Text>
            </div>
          </Space>
          <div style={{ marginTop: 8 }}>
            <Tag color="blue" style={{ fontSize: 10 }}>{user?.role}</Tag>
          </div>
        </div>

        {/* Navigation */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ background: '#0f172a', borderRight: 0, padding: '8px 0' }}
        />

        {/* Logout */}
        <div
          style={{
            padding: '12px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#0f172a',
          }}
        >
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{ color: '#94a3b8', width: '100%', textAlign: 'left' }}
            danger
          >
            Đăng xuất
          </Button>
        </div>
      </Sider>

      <Layout style={{ marginLeft: 240 }}>
        <Header
          style={{
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            height: 56,
          }}
        >
          <Title level={5} style={{ margin: 0, color: '#111827' }}>
            {currentLabel}
          </Title>
        </Header>
        <Content style={{ padding: 24, background: '#f8fafc', minHeight: 'calc(100vh - 56px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
