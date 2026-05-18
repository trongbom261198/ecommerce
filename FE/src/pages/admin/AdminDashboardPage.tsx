import { useQuery } from '@tanstack/react-query'
import { Row, Col, Card, Table, Tag, Typography, Skeleton } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  TrendingUp,
  Package,
  Users,
  CalendarDays,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { adminService } from '@/services/adminService'
import { productService } from '@/services/productService'
import AdminLayout from '@/components/layout/AdminLayout'
import type { Order, OrderStatus } from '@/types/order'

const { Text } = Typography

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

const formatDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('vi-VN') } catch { return iso }
}

const STATUS_VI: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  PROCESSING: 'Đang xử lý',
  PICKING: 'Đang lấy',
  PACKED: 'Đã đóng gói',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  REFUNDED: 'Hoàn tiền',
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: 'gold',
  CONFIRMED: 'blue',
  PROCESSING: 'geekblue',
  PICKING: 'purple',
  PACKED: 'cyan',
  SHIPPED: 'orange',
  DELIVERED: 'green',
  CANCELLED: 'red',
  REFUNDED: 'default',
}

const recentOrderColumns: ColumnsType<Order> = [
  {
    title: 'Mã đơn',
    dataIndex: 'orderNumber',
    key: 'orderNumber',
    render: (v) => <Text strong>#{v}</Text>,
  },
  {
    title: 'Khách hàng',
    key: 'customer',
    render: (_, r) => r.shippingAddress?.recipientName ?? '—',
  },
  {
    title: 'Trạng thái',
    dataIndex: 'status',
    key: 'status',
    render: (s: OrderStatus) => (
      <Tag color={STATUS_COLOR[s]}>{STATUS_VI[s] ?? s}</Tag>
    ),
  },
  {
    title: 'Tổng tiền',
    dataIndex: 'totalAmount',
    key: 'totalAmount',
    render: (v) => <Text strong>{formatVND(v)}</Text>,
  },
  {
    title: 'Ngày tạo',
    dataIndex: 'createdAt',
    key: 'createdAt',
    render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
  },
]

function KpiIcon({ icon: Icon, bg }: { icon: React.ElementType; bg: string }) {
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon style={{ width: 24, height: 24, color: '#fff' }} />
    </div>
  )
}

export default function AdminDashboardPage() {
  const { data: orderStats, isLoading: loadingOrders } = useQuery({
    queryKey: ['admin-order-stats'],
    queryFn: () => adminService.getOrderStats(),
    retry: 1,
  })

  const { data: userStats, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: () => adminService.getUserStats(),
    retry: 1,
  })

  const { data: recentOrdersData, isLoading: loadingRecent } = useQuery({
    queryKey: ['admin-recent-orders'],
    queryFn: () => adminService.getAllOrders(0, 5),
    retry: 1,
  })

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products-count'],
    queryFn: () => productService.getProducts({ size: 1 }),
    retry: 1,
  })

  const stats = orderStats?.data
  const users = userStats?.data
  const recentOrders = recentOrdersData?.data?.content ?? []
  const totalProducts = productsData?.data?.totalElements ?? 0
  const isLoading = loadingOrders || loadingUsers || loadingProducts

  const chartData = stats?.ordersByStatus
    ? Object.entries(stats.ordersByStatus).map(([key, count]) => ({
        name: STATUS_VI[key] ?? key,
        count,
      }))
    : []

  const userBreakdown = [
    { label: 'Khách hàng', value: users?.customerCount ?? 0, color: '#3b82f6' },
    { label: 'Nhân viên', value: users?.staffCount ?? 0, color: '#eab308' },
    { label: 'Tài xế', value: users?.driverCount ?? 0, color: '#22c55e' },
    { label: 'Admin', value: users?.adminCount ?? 0, color: '#ef4444' },
  ]

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* KPI cards */}
        <Row gutter={[16, 16]}>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Col key={i} xs={24} sm={12} xl={6}>
                  <Card>
                    <Skeleton active paragraph={{ rows: 1 }} />
                  </Card>
                </Col>
              ))
            : [
                { label: 'Doanh thu', value: formatVND(stats?.totalRevenue ?? 0), icon: TrendingUp, bg: '#22c55e' },
                { label: 'Đơn hàng hôm nay', value: (stats?.todayOrders ?? 0).toLocaleString('vi-VN'), icon: CalendarDays, bg: '#3b82f6' },
                { label: 'Sản phẩm', value: totalProducts.toLocaleString('vi-VN'), icon: Package, bg: '#a855f7' },
                { label: 'Người dùng', value: (users?.totalUsers ?? 0).toLocaleString('vi-VN'), icon: Users, bg: '#f97316' },
              ].map(({ label, value, icon, bg }) => (
                <Col key={label} xs={24} sm={12} xl={6}>
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <KpiIcon icon={icon} bg={bg} />
                      <div>
                        <Text type="secondary" style={{ fontSize: 13 }}>{label}</Text>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginTop: 2 }}>
                          {value}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
        </Row>

        {/* Charts row */}
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <Card title="Đơn hàng theo trạng thái" loading={loadingOrders}>
              {chartData.length === 0 ? (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                  Không có dữ liệu
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(val: number) => [val, 'Đơn hàng']} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>

          <Col xs={24} xl={8}>
            <Card title="Phân bố người dùng" loading={loadingUsers} style={{ height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {userBreakdown.map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: '#374151' }}>{label}</Text>
                    <span
                      style={{
                        background: `${color}20`,
                        color,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '2px 10px',
                        borderRadius: 20,
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        </Row>

        {/* Recent orders */}
        <Card title="Đơn hàng gần đây">
          <Table
            columns={recentOrderColumns}
            dataSource={recentOrders}
            rowKey="id"
            loading={loadingRecent}
            pagination={false}
            size="small"
          />
        </Card>
      </div>
    </AdminLayout>
  )
}
