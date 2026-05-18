import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal, Form, Input, InputNumber, Select, Typography } from 'antd'
import type { Product, Category } from '@/types/product'
import { ImageUploader } from './image-uploader'

const { Text } = Typography

const schema = z.object({
  name:        z.string().min(1, 'Tên sản phẩm là bắt buộc'),
  categoryId:  z.string().min(1, 'Vui lòng chọn danh mục'),
  description: z.string().optional(),
  brand:       z.string().optional(),
  basePrice:   z.coerce.number().min(0, 'Giá không hợp lệ'),
  status:      z.enum(['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK']),
})

export type ProductFormValues = z.infer<typeof schema> & { images: string[] }

interface ProductFormModalProps {
  open:        boolean
  onClose:     () => void
  onSubmit:    (values: ProductFormValues) => void
  isPending:   boolean
  categories:  Category[]
  editProduct?: Product | null
}

function flattenCategories(cats: Category[], depth = 0): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = []
  for (const c of cats) {
    result.push({ value: c.id, label: `${'—'.repeat(depth)} ${c.name}`.trim() })
    if (c.children?.length) result.push(...flattenCategories(c.children, depth + 1))
  }
  return result
}

export function ProductFormModal({
  open, onClose, onSubmit, isPending, categories, editProduct,
}: ProductFormModalProps) {
  const [images, setImages] = useState<string[]>([])

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'ACTIVE', basePrice: 0 },
  })

  useEffect(() => {
    if (!open) return
    if (editProduct) {
      reset({
        name:        editProduct.name,
        categoryId:  editProduct.categoryId ?? '',
        description: editProduct.description ?? '',
        brand:       editProduct.brand ?? '',
        basePrice:   editProduct.basePrice,
        status:      editProduct.status === 'DELETED' ? 'INACTIVE' : editProduct.status,
      })
      setImages(editProduct.images ?? [])
    } else {
      reset({ status: 'ACTIVE', basePrice: 0 })
      setImages([])
    }
  }, [editProduct, reset, open])

  const catOptions = flattenCategories(categories)

  function handleFormSubmit(values: z.infer<typeof schema>) {
    onSubmit({ ...values, images })
  }

  return (
    <Modal
      open={open}
      title={editProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm'}
      onCancel={onClose}
      onOk={handleSubmit(handleFormSubmit)}
      okText={editProduct ? 'Cập nhật' : 'Thêm mới'}
      cancelText="Hủy"
      confirmLoading={isPending}
      width={640}
      destroyOnHidden
    >
      <Form layout="vertical" style={{ marginTop: 8 }}>
        {/* Name */}
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Form.Item
              label="Tên sản phẩm"
              required
              validateStatus={errors.name ? 'error' : ''}
              help={errors.name?.message}
            >
              <Input {...field} placeholder="Nhập tên sản phẩm" />
            </Form.Item>
          )}
        />

        {/* Category + Brand */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field: { onChange, value } }) => (
              <Form.Item
                label="Danh mục"
                required
                validateStatus={errors.categoryId ? 'error' : ''}
                help={errors.categoryId?.message}
              >
                <Select
                  value={value || undefined}
                  onChange={onChange}
                  placeholder="Chọn danh mục"
                  options={catOptions}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="brand"
            render={({ field }) => (
              <Form.Item label="Thương hiệu">
                <Input {...field} placeholder="Thương hiệu" />
              </Form.Item>
            )}
          />
        </div>

        {/* Price + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Controller
            control={control}
            name="basePrice"
            render={({ field: { onChange, value } }) => (
              <Form.Item
                label="Giá gốc (VND)"
                required
                validateStatus={errors.basePrice ? 'error' : ''}
                help={errors.basePrice?.message}
              >
                <InputNumber
                  value={value}
                  onChange={(v) => onChange(v ?? 0)}
                  style={{ width: '100%' }}
                  min={0}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
                  placeholder="0"
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field: { onChange, value } }) => (
              <Form.Item label="Trạng thái">
                <Select
                  value={value}
                  onChange={onChange}
                  options={[
                    { value: 'ACTIVE',       label: 'Đang bán'  },
                    { value: 'INACTIVE',     label: 'Ẩn'        },
                    { value: 'OUT_OF_STOCK', label: 'Hết hàng'  },
                  ]}
                />
              </Form.Item>
            )}
          />
        </div>

        {/* Description */}
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Form.Item label="Mô tả">
              <Input.TextArea {...field} rows={3} placeholder="Mô tả sản phẩm" />
            </Form.Item>
          )}
        />

        {/* Images */}
        <Form.Item label={<>Hình ảnh <Text type="secondary" style={{ fontWeight: 400 }}>({images.length}/8)</Text></>}>
          <ImageUploader images={images} onChange={setImages} maxImages={8} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
