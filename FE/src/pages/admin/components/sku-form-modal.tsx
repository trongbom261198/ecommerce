import { useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Switch, Button, Row, Col, Space } from 'antd'
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons'
import type { Sku, SkuRequest } from '@/types/product'

interface Props {
  open: boolean
  editing: Sku | null
  onClose: () => void
  onSubmit: (data: SkuRequest) => void
  loading: boolean
}

export default function SkuFormModal({ open, editing, onClose, onSubmit, loading }: Props) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) {
      if (editing) {
        form.setFieldsValue({
          skuCode: editing.skuCode,
          variantName: editing.variantName,
          price: editing.price,
          costPrice: editing.costPrice,
          weightGrams: editing.weightGrams,
          active: editing.active,
          attributes: Object.entries(editing.attributes ?? {}).map(([k, v]) => ({ key: k, value: v })),
        })
      } else {
        form.resetFields()
        form.setFieldValue('active', true)
      }
    }
  }, [open, editing, form])

  async function handleOk() {
    const values = await form.validateFields()
    const attrs: Record<string, string> = {}
    ;(values.attributes ?? []).forEach(({ key, value }: { key: string; value: string }) => {
      if (key?.trim()) attrs[key.trim()] = value ?? ''
    })
    onSubmit({
      skuCode: values.skuCode,
      variantName: values.variantName || undefined,
      price: values.price,
      costPrice: values.costPrice || undefined,
      weightGrams: values.weightGrams || undefined,
      active: values.active ?? true,
      attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
    })
  }

  return (
    <Modal
      title={editing ? 'Cập nhật SKU' : 'Thêm SKU mới'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="skuCode" label="Mã SKU" rules={[{ required: true, message: 'Nhập mã SKU' }]}>
              <Input placeholder="VD: IP15-128GB-BLK" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="variantName" label="Tên biến thể">
              <Input placeholder="VD: 128GB - Đen" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="price" label="Giá bán" rules={[{ required: true, message: 'Nhập giá' }]}>
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="costPrice" label="Giá vốn">
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="weightGrams" label="Khối lượng (g)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="active" label="Trạng thái" valuePropName="checked">
          <Switch checkedChildren="Đang bán" unCheckedChildren="Ngừng bán" />
        </Form.Item>

        <Form.Item label="Thuộc tính">
          <Form.List name="attributes">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 4 }} align="baseline">
                    <Form.Item name={[name, 'key']} noStyle>
                      <Input placeholder="Tên thuộc tính (VD: Color)" style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item name={[name, 'value']} noStyle>
                      <Input placeholder="Giá trị (VD: Black)" style={{ width: 160 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} size="small">
                  Thêm thuộc tính
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  )
}
