import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, Tag, Space, Popconfirm, App, Card, Row, Col, Typography, Avatar,
} from 'antd'
import { PlusOutlined, ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import AdminLayout from '@/components/layout/AdminLayout'
import { adminService } from '@/services/adminService'
import { getImageUrl } from '@/utils/image'
import SkuFormModal from './components/sku-form-modal'
import type { Sku, SkuRequest } from '@/types/product'

const { Title, Text } = Typography

export default function AdminSkusPage() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Sku | null>(null)

  // Fetch the specific product for header info
  const { data: skusData, isLoading } = useQuery({
    queryKey: ['admin-skus', productId],
    queryFn: () => adminService.getProductSkus(productId!),
    enabled: !!productId,
  })

  // Fetch product info for header
  const { data: productRes } = useQuery({
    queryKey: ['product-detail', productId],
    queryFn: () =>
      adminService.searchProducts('', 100).then((r) => ({
        ...r,
        data: r.data
          ? { ...r.data, content: r.data.content.filter((p) => p.id === productId) }
          : r.data,
      })),
    enabled: !!productId,
    staleTime: 60_000,
  })

  const product = productRes?.data?.content?.[0] ?? null
  const skus = skusData?.data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-skus', productId] })

  const createMut = useMutation({
    mutationFn: (data: SkuRequest) => adminService.createSku(productId!, data),
    onSuccess: () => { message.success('Tạo SKU thành công'); setModalOpen(false); invalidate() },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      message.error(msg ?? 'Tạo SKU thất bại')
    },
  })

  const updateMut = useMutation({
    mutationFn: (data: SkuRequest) => adminService.updateSku(productId!, editing!.id, data),
    onSuccess: () => { message.success('Cập nhật thành công'); setModalOpen(false); invalidate() },
    onError: () => message.error('Cập nhật thất bại'),
  })

  const deleteMut = useMutation({
    mutationFn: (skuId: string) => adminService.deleteSku(productId!, skuId),
    onSuccess: () => { message.success('Đã xóa SKU'); invalidate() },
    onError: () => message.error('Xóa thất bại'),
  })

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(sku: Sku) { setEditing(sku); setModalOpen(true) }

  function handleSubmit(data: SkuRequest) {
    if (editing) updateMut.mutate(data)
    else createMut.mutate(data)
  }

  const columns: ColumnsType<Sku> = [
    {
      title: 'Mã SKU',
      dataIndex: 'skuCode',
      render: (v: string) => <Text code>{v}</Text>,
    },
    { title: 'Biến thể', dataIndex: 'variantName', render: (v?: string) => v ?? '—' },
    {
      title: 'Giá bán',
      dataIndex: 'price',
      render: (v: number) => Number(v).toLocaleString('vi-VN') + '₫',
    },
    {
      title: 'Giá vốn',
      dataIndex: 'costPrice',
      render: (v?: number) => v ? Number(v).toLocaleString('vi-VN') + '₫' : '—',
    },
    {
      title: 'Khối lượng',
      dataIndex: 'weightGrams',
      render: (v?: number) => v ? `${v}g` : '—',
    },
    {
      title: 'Thuộc tính',
      dataIndex: 'attributes',
      render: (attrs: Record<string, string>) => {
        const entries = Object.entries(attrs ?? {})
        if (!entries.length) return '—'
        return (
          <Space size={4} wrap>
            {entries.map(([k, v]) => <Tag key={k}>{k}: {v}</Tag>)}
          </Space>
        )
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'active',
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Đang bán' : 'Ngừng bán'}</Tag>,
    },
    {
      title: 'Hành động',
      width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xóa SKU này?" onConfirm={() => deleteMut.mutate(r.id)}>
            <Button size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <AdminLayout>
      <Card>
        {/* Header */}
        <Row align="middle" gutter={12} style={{ marginBottom: 20 }}>
          <Col>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/products')} />
          </Col>
          {product && (
            <Col>
              <Avatar
                shape="square"
                size={40}
                src={getImageUrl(product.images?.[0])}
                style={{ background: '#f0f0f0' }}
              >
                {product.name.charAt(0)}
              </Avatar>
            </Col>
          )}
          <Col flex="auto">
            <Title level={4} style={{ margin: 0 }}>
              {product ? `SKU — ${product.name}` : 'Quản lý SKU'}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {skus.length} SKU
            </Text>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm SKU
            </Button>
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={skus}
          loading={isLoading}
          pagination={false}
        />
      </Card>

      <SkuFormModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        loading={createMut.isPending || updateMut.isPending}
      />
    </AdminLayout>
  )
}
