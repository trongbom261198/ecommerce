import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Table, Tag, Select, Switch, Input, Segmented, Typography, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined } from '@ant-design/icons'
import { adminService, type AdminUser } from '@/services/adminService'
import AdminLayout from '@/components/layout/AdminLayout'

const { Text } = Typography

type RoleFilter = 'ALL' | AdminUser['role']

const ROLE_TABS = [
  { label: 'Tất cả',    value: 'ALL'      },
  { label: 'Khách',     value: 'CUSTOMER' },
  { label: 'Nhân viên', value: 'STAFF'    },
  { label: 'Admin',     value: 'ADMIN'    },
  { label: 'Tài xế',   value: 'DRIVER'   },
]

const ROLE_COLOR: Record<AdminUser['role'], string> = {
  CUSTOMER: 'blue',
  STAFF:    'gold',
  ADMIN:    'red',
  DRIVER:   'green',
}

const ROLE_LABELS: Record<AdminUser['role'], string> = {
  CUSTOMER: 'Khách hàng',
  STAFF:    'Nhân viên',
  ADMIN:    'Admin',
  DRIVER:   'Tài xế',
}

const ALL_ROLES: AdminUser['role'][] = ['CUSTOMER', 'STAFF', 'ADMIN', 'DRIVER']

function formatDate(iso: string) {
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: vi }) } catch { return iso }
}

export default function AdminUsersPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => adminService.getAllUsers(page, 20),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminUser['role'] }) =>
      adminService.updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      message.success('Đã cập nhật vai trò')
    },
    onError: () => message.error('Cập nhật thất bại'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminService.updateUserStatus(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      message.success('Đã cập nhật trạng thái')
    },
    onError: () => message.error('Cập nhật thất bại'),
  })

  const allUsers = data?.data?.content ?? []
  const totalElements = data?.data?.totalElements ?? 0

  const filtered = allUsers.filter((u) => {
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter
    const matchSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.fullName.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  const columns: ColumnsType<AdminUser> = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.fullName}</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{r.email}</Text>
        </div>
      ),
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (v: AdminUser['role']) => (
        <Tag color={ROLE_COLOR[v]}>{ROLE_LABELS[v]}</Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>{v ? 'Hoạt động' : 'Bị khóa'}</Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
    {
      title: 'Thay đổi vai trò',
      key: 'changeRole',
      width: 160,
      render: (_, r) => (
        <Select
          value={r.role}
          size="small"
          style={{ width: 140 }}
          onChange={(val) => roleMutation.mutate({ id: r.id, role: val as AdminUser['role'] })}
          disabled={roleMutation.isPending}
          options={ALL_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
        />
      ),
    },
    {
      title: 'Kích hoạt',
      key: 'toggle',
      width: 90,
      render: (_, r) => (
        <Switch
          checked={r.enabled}
          size="small"
          loading={statusMutation.isPending}
          onChange={(checked) => statusMutation.mutate({ id: r.id, enabled: checked })}
        />
      ),
    },
  ]

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Text strong style={{ fontSize: 18, color: '#111827' }}>Người dùng</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
            {totalElements} tài khoản
          </Text>
        </div>

        <Segmented
          options={ROLE_TABS}
          value={roleFilter}
          onChange={(v) => { setRoleFilter(v as RoleFilter); setPage(0) }}
        />

        <Input
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          placeholder="Tìm theo email hoặc tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
          allowClear
        />

        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page + 1,
            pageSize: 20,
            total: totalElements,
            onChange: (p) => setPage(p - 1),
            showSizeChanger: false,
            showTotal: (t) => `${t} người dùng`,
          }}
        />
      </div>
    </AdminLayout>
  )
}
