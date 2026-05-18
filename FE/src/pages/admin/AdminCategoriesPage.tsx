import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Button, Space, Popconfirm, Typography, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { productService } from '@/services/productService'
import { adminService } from '@/services/adminService'
import type { Category } from '@/types/product'
import AdminLayout from '@/components/layout/AdminLayout'
import { CategoryFormModal, type CategoryFormValues } from './components/category-form-modal'

const { Text } = Typography

function flattenCategories(cats: Category[], depth = 0): Array<Category & { depth: number }> {
  const result: Array<Category & { depth: number }> = []
  for (const c of cats) {
    result.push({ ...c, depth })
    if (c.children?.length) result.push(...flattenCategories(c.children, depth + 1))
  }
  return result
}

export default function AdminCategoriesPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productService.getCategories(),
  })

  const createMutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      adminService.createCategory({
        name: values.name,
        slug: values.slug,
        description: values.description,
        parentId: values.parentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setModalOpen(false)
      message.success('Thêm danh mục thành công')
    },
    onError: () => message.error('Thêm danh mục thất bại'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CategoryFormValues }) =>
      adminService.updateCategory(id, {
        name: values.name,
        slug: values.slug,
        description: values.description,
        parentId: values.parentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setModalOpen(false)
      setEditCategory(null)
      message.success('Cập nhật thành công')
    },
    onError: () => message.error('Cập nhật thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      message.success('Đã xóa danh mục')
    },
    onError: () => message.error('Xóa thất bại'),
  })

  const rawCategories = data?.data ?? []
  const flatRows = flattenCategories(rawCategories)

  function handleSubmit(values: CategoryFormValues) {
    if (editCategory) {
      updateMutation.mutate({ id: editCategory.id, values })
    } else {
      createMutation.mutate(values)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const columns: ColumnsType<Category & { depth: number }> = [
    {
      title: 'Tên danh mục',
      key: 'name',
      render: (_, r) => (
        <span style={{ paddingLeft: r.depth * 20 }}>
          {r.depth > 0 && <Text type="secondary" style={{ marginRight: 6 }}>└</Text>}
          <Text strong={r.depth === 0}>{r.name}</Text>
        </span>
      ),
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Danh mục cha',
      key: 'parent',
      render: (_, r) => {
        const parent = flatRows.find((x) => x.id === r.parentId)
        return <Text type="secondary">{parent?.name ?? '—'}</Text>
      },
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => <Text type="secondary">{v ?? '—'}</Text>,
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
            onClick={() => { setEditCategory(r); setModalOpen(true) }}
          />
          <Popconfirm
            title="Xóa danh mục này?"
            description="Sẽ ảnh hưởng đến các sản phẩm liên quan."
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
            <Text strong style={{ fontSize: 18, color: '#111827' }}>Danh mục</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
              {flatRows.length} danh mục
            </Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditCategory(null); setModalOpen(true) }}
          >
            Thêm danh mục
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={flatRows}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: isError ? 'Không thể tải danh mục' : 'Chưa có danh mục nào' }}
        />
      </div>

      <CategoryFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditCategory(null) }}
        onSubmit={handleSubmit}
        isPending={isPending}
        categories={rawCategories}
        editCategory={editCategory}
      />
    </AdminLayout>
  )
}
