import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Modal, Form, Input, InputNumber, Select, Tag, Button, Space, Typography, App,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, FilterOutlined, EditOutlined } from '@ant-design/icons'
import { adminService } from '@/services/adminService'
import type { InventoryItem } from '@/services/adminService'
import AdminLayout from '@/components/layout/AdminLayout'

const { Text } = Typography

function stockTag(item: InventoryItem) {
  const safety = item.safetyStock ?? 10
  if (item.availableQuantity < safety) return <Tag color="red">{item.availableQuantity}</Tag>
  if (item.availableQuantity < safety * 2) return <Tag color="gold">{item.availableQuantity}</Tag>
  return <Tag color="green">{item.availableQuantity}</Tag>
}

export default function AdminInventoryPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [skuSearch, setSkuSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState<string | undefined>(undefined)
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null)
  const [form] = Form.useForm()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-inventory', page],
    queryFn: () => adminService.getInventory(page, 20),
  })

  const adjustMutation = useMutation({
    mutationFn: (vals: { delta: number; reason: string }) =>
      adminService.adjustStock(
        adjustTarget!.skuId,
        adjustTarget!.warehouseId,
        vals.delta,
        vals.reason,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] })
      setAdjustTarget(null)
      form.resetFields()
      message.success('Điều chỉnh thành công')
    },
    onError: () => message.error('Điều chỉnh thất bại'),
  })

  const rawItems = data?.data?.content ?? []
  const totalElements = data?.data?.totalElements ?? 0

  const warehouses = Array.from(
    new Map(rawItems.map((i) => [i.warehouseId, i.warehouseName])).entries(),
  )

  const items = rawItems.filter((item) => {
    const matchSku =
      !skuSearch ||
      item.skuCode.toLowerCase().includes(skuSearch.toLowerCase()) ||
      item.productName.toLowerCase().includes(skuSearch.toLowerCase())
    const matchWarehouse = !warehouseFilter || item.warehouseId === warehouseFilter
    return matchSku && matchWarehouse
  })

  function openAdjust(item: InventoryItem) {
    setAdjustTarget(item)
    form.resetFields()
  }

  function handleAdjust() {
    form.validateFields().then((vals) => adjustMutation.mutate(vals))
  }

  const columns: ColumnsType<InventoryItem> = [
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Tên sản phẩm',
      dataIndex: 'productName',
      key: 'productName',
      render: (v) => <Text>{v}</Text>,
    },
    {
      title: 'Kho',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      render: (v) => <Text type="secondary">{v}</Text>,
    },
    {
      title: 'Tồn kho',
      dataIndex: 'quantityOnHand',
      key: 'quantityOnHand',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: 'Đã đặt',
      dataIndex: 'quantityReserved',
      key: 'quantityReserved',
      render: (v) => <Text style={{ color: '#f97316' }}>{v}</Text>,
    },
    {
      title: 'Khả dụng',
      key: 'available',
      render: (_, r) => stockTag(r),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_, r) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => openAdjust(r)}
        >
          Điều chỉnh
        </Button>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Text strong style={{ fontSize: 18, color: '#111827' }}>Quản lý tồn kho</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
            {totalElements} mặt hàng
          </Text>
        </div>

        {/* Legend */}
        <Space size="large">
          <Space size={6}>
            <Tag color="red" style={{ marginRight: 0 }}>0</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>Dưới mức an toàn</Text>
          </Space>
          <Space size={6}>
            <Tag color="gold" style={{ marginRight: 0 }}>0</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>Tồn kho thấp</Text>
          </Space>
          <Space size={6}>
            <Tag color="green" style={{ marginRight: 0 }}>0</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>Bình thường</Text>
          </Space>
        </Space>

        {/* Filters */}
        <Space wrap>
          <Input
            prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
            placeholder="Tìm theo SKU hoặc tên sản phẩm..."
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Select
            prefix={<FilterOutlined />}
            placeholder="Tất cả kho"
            allowClear
            value={warehouseFilter}
            onChange={(v) => setWarehouseFilter(v)}
            style={{ width: 200 }}
            options={warehouses.map(([id, name]) => ({ value: id, label: name }))}
          />
        </Space>

        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={isLoading}
          rowClassName={(r) => {
            const safety = r.safetyStock ?? 10
            if (r.availableQuantity < safety) return 'ant-table-row-danger'
            if (r.availableQuantity < safety * 2) return 'ant-table-row-warning'
            return ''
          }}
          pagination={{
            current: page + 1,
            pageSize: 20,
            total: totalElements,
            onChange: (p) => setPage(p - 1),
            showSizeChanger: false,
            showTotal: (t) => `${t} mặt hàng`,
          }}
        />
      </div>

      <Modal
        open={!!adjustTarget}
        title="Điều chỉnh tồn kho"
        onCancel={() => { setAdjustTarget(null); form.resetFields() }}
        onOk={handleAdjust}
        okText="Xác nhận"
        cancelText="Hủy"
        confirmLoading={adjustMutation.isPending}
        destroyOnClose
      >
        {adjustTarget && (
          <>
            <div
              style={{
                background: '#f8fafc',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16,
              }}
            >
              <Text strong>{adjustTarget.productName}</Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                SKU: {adjustTarget.skuCode} · Kho: {adjustTarget.warehouseName}
              </Text>
              <Text style={{ marginTop: 6, display: 'block', fontSize: 13 }}>
                Khả dụng hiện tại:{' '}
                <Text strong>{adjustTarget.availableQuantity}</Text>
              </Text>
            </div>

            <Form form={form} layout="vertical">
              <Form.Item
                name="delta"
                label="Số lượng thay đổi (dương = nhập, âm = xuất)"
                rules={[
                  { required: true, message: 'Vui lòng nhập số lượng' },
                  { type: 'integer', message: 'Phải là số nguyên' },
                  {
                    validator: (_, v) =>
                      v !== 0 ? Promise.resolve() : Promise.reject('Không được bằng 0'),
                  },
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Ví dụ: 50 hoặc -10"
                />
              </Form.Item>

              <Form.Item
                name="reason"
                label="Lý do điều chỉnh"
                rules={[{ required: true, min: 3, message: 'Vui lòng nhập lý do (ít nhất 3 ký tự)' }]}
              >
                <Input placeholder="Ví dụ: Nhập hàng từ nhà cung cấp" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </AdminLayout>
  )
}
