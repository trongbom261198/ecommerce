import { useQuery } from '@tanstack/react-query'
import { Row, Col, Card, Statistic, Typography } from 'antd'
import {
  ShoppingOutlined,
  RiseOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { adminService } from '@/services/adminService'
import AdminLayout from '@/components/layout/AdminLayout'

const { Text } = Typography

const MOCK_DAILY_REVENUE = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (29 - i))
  return {
    date: `${d.getDate()}/${d.getMonth() + 1}`,
    revenue: Math.floor(Math.random() * 50_000_000 + 5_000_000),
    orders: Math.floor(Math.random() * 80 + 10),
  }
})

const MOCK_ORDERS_BY_STATUS = [
  { status: 'PENDING',    label: 'Chờ xác nhận', count: 24,  color: '#eab308' },
  { status: 'CONFIRMED',  label: 'Đã xác nhận',  count: 18,  color: '#3b82f6' },
  { status: 'PROCESSING', label: 'Đang xử lý',   count: 32,  color: '#6366f1' },
  { status: 'SHIPPED',    label: 'Đang giao',     count: 41,  color: '#06b6d4' },
  { status: 'DELIVERED',  label: 'Đã giao',       count: 156, color: '#22c55e' },
  { status: 'CANCELLED',  label: 'Đã hủy',        count: 12,  color: '#ef4444' },
]

const formatCurrency = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

const formatFullCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

export default function AdminAnalyticsPage() {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: () => adminService.getDashboardStats(),
  })

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['admin-revenue', 30],
    queryFn: () => adminService.getRevenueData(30),
  })

  const stats = statsData?.data
  const revenue = revenueData?.data ?? MOCK_DAILY_REVENUE
  const barData = MOCK_ORDERS_BY_STATUS.map((s) => ({ name: s.label, 'Đơn hàng': s.count }))

  const kpiItems = [
    {
      title: 'Đơn hàng hôm nay',
      value: stats?.totalOrders ?? 0,
      suffix: 'đơn',
      icon: <ShoppingOutlined style={{ color: '#2563eb', fontSize: 20 }} />,
      bg: '#eff6ff',
      sub: 'Tổng tất cả đơn',
    },
    {
      title: 'Doanh thu (tổng)',
      value: formatCurrency(stats?.totalRevenue ?? 0),
      prefix: '',
      icon: <RiseOutlined style={{ color: '#16a34a', fontSize: 20 }} />,
      bg: '#f0fdf4',
      sub: formatFullCurrency(stats?.totalRevenue ?? 0),
    },
    {
      title: 'Đơn chờ xử lý',
      value: stats?.ordersByStatus?.PENDING ?? 0,
      suffix: 'đơn',
      icon: <ClockCircleOutlined style={{ color: '#ca8a04', fontSize: 20 }} />,
      bg: '#fefce8',
      sub: 'Cần xử lý ngay',
    },
    {
      title: 'SKU hết hàng',
      value: 0,
      suffix: 'SKU',
      icon: <WarningOutlined style={{ color: '#dc2626', fontSize: 20 }} />,
      bg: '#fef2f2',
      sub: 'Cần bổ sung tồn kho',
    },
  ]

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <Text strong style={{ fontSize: 18, color: '#111827' }}>Thống kê & Phân tích</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
            Tổng quan hoạt động kinh doanh
          </Text>
        </div>

        {/* KPI row */}
        <Row gutter={[16, 16]}>
          {kpiItems.map((item) => (
            <Col key={item.title} xs={24} sm={12} lg={6}>
              <Card loading={statsLoading}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 8,
                      background: item.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <Statistic
                      title={item.title}
                      value={item.value}
                      suffix={item.suffix}
                      valueStyle={{ fontSize: 22, fontWeight: 700 }}
                    />
                    {item.sub && (
                      <Text type="secondary" style={{ fontSize: 11 }}>{item.sub}</Text>
                    )}
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Bar chart */}
        <Card title="Đơn hàng theo trạng thái">
          <Text type="secondary" style={{ fontSize: 12 }}>Dữ liệu tổng hợp</Text>
          <ResponsiveContainer width="100%" height={280} style={{ marginTop: 16 }}>
            <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Đơn hàng" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Line chart */}
        <Card title="Doanh thu 30 ngày gần đây" loading={revenueLoading}>
          <Text type="secondary" style={{ fontSize: 12 }}>Đơn vị: VND</Text>
          <ResponsiveContainer width="100%" height={280} style={{ marginTop: 16 }}>
            <LineChart data={revenue} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
              <Tooltip formatter={(v: number) => [formatFullCurrency(v), 'Doanh thu']} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} name="Doanh thu" />
              <Line type="monotone" dataKey="orders"  stroke="#2563eb" strokeWidth={2} dot={false} name="Số đơn" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Pie chart */}
        <Card title="Phân bổ trạng thái đơn hàng">
          <Text type="secondary" style={{ fontSize: 12 }}>Tỷ lệ phân bổ hiện tại</Text>
          <Row gutter={24} align="middle" style={{ marginTop: 16 }}>
            <Col xs={24} lg={16}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={MOCK_ORDERS_BY_STATUS}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {MOCK_ORDERS_BY_STATUS.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, 'Đơn hàng']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Col>
            <Col xs={24} lg={8}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MOCK_ORDERS_BY_STATUS.map((s) => (
                  <div key={s.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <Text style={{ fontSize: 13 }}>{s.label}</Text>
                    </div>
                    <Text strong>{s.count}</Text>
                  </div>
                ))}
              </div>
            </Col>
          </Row>
        </Card>
      </div>
    </AdminLayout>
  )
}
