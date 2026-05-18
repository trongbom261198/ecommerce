import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal, Form, Input, Select } from 'antd'
import type { Category } from '@/types/product'

const schema = z.object({
  name:        z.string().min(1, 'Tên danh mục là bắt buộc'),
  slug:        z.string().min(1, 'Slug là bắt buộc').regex(/^[a-z0-9-]+$/, 'Slug chỉ gồm chữ thường, số và dấu -'),
  description: z.string().optional(),
  parentId:    z.string().optional(),
})

export type CategoryFormValues = z.infer<typeof schema>

function toSlug(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function flattenCategories(
  cats: Category[],
  excludeId: string | undefined,
  depth = 0,
): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = []
  for (const c of cats) {
    if (c.id === excludeId) continue
    result.push({ value: c.id, label: `${'—'.repeat(depth)} ${c.name}`.trim() })
    if (c.children?.length) result.push(...flattenCategories(c.children, excludeId, depth + 1))
  }
  return result
}

interface CategoryFormModalProps {
  open:           boolean
  onClose:        () => void
  onSubmit:       (values: CategoryFormValues) => void
  isPending:      boolean
  categories:     Category[]
  editCategory?:  Category | null
}

export function CategoryFormModal({
  open, onClose, onSubmit, isPending, categories, editCategory,
}: CategoryFormModalProps) {
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CategoryFormValues>({ resolver: zodResolver(schema) })

  const nameValue = watch('name')

  useEffect(() => {
    if (editCategory) {
      reset({
        name:        editCategory.name,
        slug:        editCategory.slug,
        description: editCategory.description ?? '',
        parentId:    editCategory.parentId ?? '',
      })
    } else {
      reset({ name: '', slug: '', description: '', parentId: '' })
    }
  }, [editCategory, reset, open])

  // Auto-generate slug from name only when creating
  useEffect(() => {
    if (!editCategory && nameValue) {
      setValue('slug', toSlug(nameValue), { shouldValidate: false })
    }
  }, [nameValue, editCategory, setValue])

  const parentOptions = flattenCategories(categories, editCategory?.id)

  return (
    <Modal
      open={open}
      title={editCategory ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}
      onCancel={onClose}
      onOk={handleSubmit(onSubmit)}
      okText={editCategory ? 'Cập nhật' : 'Thêm mới'}
      cancelText="Hủy"
      confirmLoading={isPending}
      destroyOnHidden
    >
      <Form layout="vertical" style={{ marginTop: 8 }}>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Form.Item
              label="Tên danh mục"
              required
              validateStatus={errors.name ? 'error' : ''}
              help={errors.name?.message}
            >
              <Input {...field} placeholder="Nhập tên danh mục" />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name="slug"
          render={({ field }) => (
            <Form.Item
              label="Slug"
              required
              validateStatus={errors.slug ? 'error' : ''}
              help={errors.slug?.message}
            >
              <Input {...field} placeholder="vd: dien-tu" />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name="parentId"
          render={({ field: { onChange, value } }) => (
            <Form.Item label="Danh mục cha">
              <Select
                value={value || undefined}
                onChange={onChange}
                placeholder="Không có (danh mục gốc)"
                allowClear
                options={parentOptions}
              />
            </Form.Item>
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Form.Item label="Mô tả">
              <Input.TextArea {...field} rows={3} placeholder="Mô tả danh mục" />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  )
}
