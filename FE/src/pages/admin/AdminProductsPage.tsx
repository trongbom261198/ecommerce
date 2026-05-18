import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, Input, Tag, Space, Popconfirm, Avatar, Typography, App,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { adminService } from '@/services/adminService'
import { productService } from '@/services/productService'
import { getImageUrl } from '@/utils/image'
import type { Product } from '@/types/product'
import AdminLayout from '@/components/layout/AdminLayout'
import { ProductFormModal, type ProductFormValues } from './components/product-form-modal'

const { Text } = Typography

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

const STATUS_CONFIG: Record<Product['status'], { label: string; color: string }> = {
  ACTIVE:       { label: 'Đang bán',  color: 'green'   },
  INACTIVE:     { label: 'Ẩn',        color: 'default' },
  OUT_OF_STOCK: { label: 'Hết hàng',  color: 'red'     },
  DELETED:      { label: 'Đã xóa',    color: 'default' },
}

export default function AdminProductsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-products', page],
    queryFn: () => adminService.getProducts(page, 15),
  })

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productService.getCategories(),
  })

  const createMutation = useMutation({
    mutationFn: (values: ProductFormValues) => adminService.createProduct(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      setModalOpen(false)
      message.success('Thêm sản phẩm thành công')
    },
    onError: () => message.error('Thêm sản phẩm thất bại'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ProductFormValues }) =>
      adminService.updateProduct(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      setModalOpen(false)
      setEditProduct(null)
      message.success('Cập nhật thành công')
    },
    onError: () => message.error('Cập nhật thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      message.success('Đã xóa sản phẩm')
    },
    onError: () => message.error('Xóa thất bại'),
  })

  const products = data?.data?.content ?? []
  const totalElements = data?.data?.totalElements ?? 0
  const categories = catData?.data ?? []

  const filtered = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products

  function handleSubmit(values: ProductFormValues) {
    if (editProduct) {
      updateMutation.mutate({ id: editProduct.id, values })
    } else {
      createMutation.mutate(values)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const columns: ColumnsType<Product> = [
    {
      title: 'Sản phẩm',
      key: 'name',
      render: (_, r) => (
        <Space>
          <Avatar
            src={r.images?.[0] ? getImageUrl(r.images[0]) : undefined}
            shape="square"
            size={36}
            style={{ background: '#f3f4f6', flexShrink: 0 }}
          >
            {r.name.charAt(0)}
          </Avatar>
          <Text style={{ fontWeight: 500 }}>{r.name}</Text>
        </Space>
      ),
    },
    {
      title: 'Danh mục',
      dataIndex: 'categoryName',
      key: 'categoryName',
      render: (v) => <Text type="secondary">{v ?? '—'}</Text>,
    },
    {
      title: 'Giá gốc',
      dataIndex: 'basePrice',
      key: 'basePrice',
      render: (v) => <Text strong>{formatVND(v)}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: Product['status']) => {
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.INACTIVE
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'SKU',
      key: 'skus',
      width: 80,
      render: (_, r) => (
        <Button
          size="small"
          icon={<UnorderedListOutlined />}
          onClick={() => navigate(`/admin/products/${r.id}/skus`)}
        >
          SKU
        </Button>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      render: (_, r) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => { setEditProduct(r); setModalOpen(true) }}
          />
          <Popconfirm
            title="Xóa sản phẩm này?"
            description="Hành động không thể hoàn tác."
            onConfirm={() => deleteMutation.mutate(r.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text strong style={{ fontSize: 18, color: '#111827' }}>Sản phẩm</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
              {totalElements} sản phẩm
            </Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditProduct(null); setModalOpen(true) }}
          >
            Thêm sản phẩm
          </Button>
        </div>

        <Input
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          placeholder="Tìm kiếm sản phẩm..."
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
            pageSize: 15,
            total: totalElements,
            onChange: (p) => setPage(p - 1),
            showSizeChanger: false,
            showTotal: (t) => `${t} sản phẩm`,
          }}
        />
      </div>

      <ProductFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditProduct(null) }}
        onSubmit={handleSubmit}
        isPending={isPending}
        categories={categories}
        editProduct={editProduct}
      />
    </AdminLayout>
  )
}
