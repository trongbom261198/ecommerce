import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Table, Tag, Select, Button, Segmented, Typography, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EyeOutlined } from '@ant-design/icons'
import { adminService } from '@/services/adminService'
import type { Order, OrderStatus } from '@/types/order'
import AdminLayout from '@/components/layout/AdminLayout'

const { Text } = Typography

const ALL_STATUSES: OrderStatus[] = [
  'PENDING', 'CONFIRMED', 'PROCESSING', 'PICKING',
  'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
]

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING:    'Chờ xác nhận',
  CONFIRMED:  'Đã xác nhận',
  PROCESSING: 'Đang xử lý',
  PICKING:    'Đang lấy hàng',
  PACKED:     'Đã đóng gói',
  SHIPPED:    'Đang giao',
  DELIVERED:  'Đã giao',
  CANCELLED:  'Đã hủy',
  REFUNDED:   'Đã hoàn tiền',
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING:    'gold',
  CONFIRMED:  'blue',
  PROCESSING: 'geekblue',
  PICKING:    'purple',
  PACKED:     'cyan',
  SHIPPED:    'orange',
  DELIVERED:  'green',
  CANCELLED:  'red',
  REFUNDED:   'default',
}

const FILTER_TABS = [
  { label: 'Tất cả',        value: 'ALL' },
  { label: 'Chờ xác nhận',  value: 'PENDING' },
  { label: 'Đang xử lý',    value: 'PROCESSING' },
  { label: 'Đang giao',     value: 'SHIPPED' },
  { label: 'Đã giao',       value: 'DELIVERED' },
  { label: 'Đã hủy',        value: 'CANCELLED' },
]

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

const formatDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: vi }) } catch { return iso }
}

export default function AdminOrdersPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const apiStatus = statusFilter === 'ALL' ? undefined : (statusFilter as OrderStatus)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', page, apiStatus],
    queryFn: () => adminService.getAllOrders(page, 10, apiStatus),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      adminService.updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      message.success('Đã cập nhật trạng thái')
    },
    onError: () => message.error('Cập nhật thất bại'),
  })

  const orders = data?.data?.content ?? []
  const totalElements = data?.data?.totalElements ?? 0

  const columns: ColumnsType<Order> = [
    {
      title: 'Mã đơn',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      render: (v) => <Text strong>#{v}</Text>,
    },
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_, r) => (
        <div>
          <Text>{r.shippingAddress?.recipientName ?? '—'}</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {r.shippingAddress?.phone ?? ''}
          </Text>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: OrderStatus) => (
        <Tag color={STATUS_COLOR[s]}>{STATUS_LABELS[s]}</Tag>
      ),
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (v) => <Text strong>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
    {
      title: 'Cập nhật TT',
      key: 'updateStatus',
      width: 180,
      render: (_, r) => (
        <Select
          defaultValue={r.status}
          size="small"
          style={{ width: 160 }}
          onChange={(val) => updateMutation.mutate({ id: r.id, status: val as OrderStatus })}
          disabled={updateMutation.isPending}
          options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
      ),
    },
    {
      title: '',
      key: 'view',
      width: 80,
      render: (_, r) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/orders/${r.id}`)}
        >
          Xem
        </Button>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Text strong style={{ fontSize: 18, color: '#111827' }}>Quản lý đơn hàng</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
            Tổng cộng {totalElements} đơn hàng
          </Text>
        </div>

        <Segmented
          options={FILTER_TABS}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v as string); setPage(0) }}
        />

        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page + 1,
            pageSize: 10,
            total: totalElements,
            onChange: (p) => setPage(p - 1),
            showSizeChanger: false,
            showTotal: (t) => `${t} đơn hàng`,
          }}
        />
      </div>
    </AdminLayout>
  )
}
