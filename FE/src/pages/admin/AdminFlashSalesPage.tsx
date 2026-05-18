import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, Tag, Space, Modal, Form, Input, InputNumber,
  Select, DatePicker, Popconfirm, App, Row, Col, Card, Typography, Divider,
} from 'antd'
import {
  PlusOutlined, ThunderboltOutlined, StopOutlined,
  DeleteOutlined, EditOutlined, PlayCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import AdminLayout from '@/components/layout/AdminLayout'
import { adminService } from '@/services/adminService'
import type { FlashSale, FlashSaleRequest, FlashSaleItemRequest, FlashSaleStatus } from '@/types/flash-sale'
import FlashSaleItemRow from './components/flash-sale-item-row'

const { Title } = Typography

const STATUS_COLOR: Record<FlashSaleStatus, string> = {
  DRAFT: 'default', SCHEDULED: 'blue', ACTIVE: 'green', ENDED: 'gray', CANCELLED: 'red',
}
const STATUS_LABEL: Record<FlashSaleStatus, string> = {
  DRAFT: 'Nháp', SCHEDULED: 'Đã lên lịch', ACTIVE: 'Đang diễn ra',
  ENDED: 'Đã kết thúc', CANCELLED: 'Đã hủy',
}

function buildRequest(values: Record<string, unknown>): FlashSaleRequest {
  const items = (values.items as Record<string, unknown>[] | undefined) ?? []
  return {
    name: values.name as string,
    description: (values.description as string) || undefined,
    discountType: values.discountType as FlashSaleRequest['discountType'],
    discountValue: values.discountValue as number,
    maxQuantity: (values.maxQuantity as number) || undefined,
    startTime: (values.startTime as Dayjs).format('YYYY-MM-DDTHH:mm:ss'),
    endTime: (values.endTime as Dayjs).format('YYYY-MM-DDTHH:mm:ss'),
    items: items.map((i) => ({
      skuId: i.skuId as string,
      productId: i.productId as string,
      productName: i.productName as string,
      originalPrice: i.originalPrice as number,
      salePrice: i.salePrice as number,
      quota: i.quota as number,
    })) as FlashSaleItemRequest[],
  }
}

const ITEM_COLUMNS = [
  { title: 'Sản phẩm', dataIndex: 'productName', ellipsis: true },
  { title: 'Giá gốc', dataIndex: 'originalPrice', render: (v: number) => v?.toLocaleString('vi-VN') + '₫' },
  { title: 'Giá sale', dataIndex: 'salePrice', render: (v: number) => v?.toLocaleString('vi-VN') + '₫' },
  { title: 'Quota', dataIndex: 'quota' },
  { title: 'Đã bán', dataIndex: 'sold' },
  { title: 'Còn lại', dataIndex: 'remaining' },
]

export default function AdminFlashSalesPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FlashSale | null>(null)
  const [form] = Form.useForm()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-flash-sales', page],
    queryFn: () => adminService.getFlashSales(page, 10),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-flash-sales'] })

  const createMut = useMutation({
    mutationFn: (req: FlashSaleRequest) => adminService.createFlashSale(req),
    onSuccess: () => { message.success('Tạo flash sale thành công'); setModalOpen(false); invalidate() },
    onError: () => message.error('Tạo flash sale thất bại'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, req }: { id: string; req: FlashSaleRequest }) => adminService.updateFlashSale(id, req),
    onSuccess: () => { message.success('Cập nhật thành công'); setModalOpen(false); invalidate() },
    onError: () => message.error('Cập nhật thất bại'),
  })
  const activateMut = useMutation({
    mutationFn: (id: string) => adminService.activateFlashSale(id),
    onSuccess: () => { message.success('Flash sale đã được kích hoạt'); invalidate() },
    onError: () => message.error('Kích hoạt thất bại'),
  })
  const endMut = useMutation({
    mutationFn: (id: string) => adminService.endFlashSale(id),
    onSuccess: () => { message.success('Flash sale đã kết thúc'); invalidate() },
    onError: () => message.error('Kết thúc thất bại'),
  })
  const cancelMut = useMutation({
    mutationFn: (id: string) => adminService.cancelFlashSale(id),
    onSuccess: () => { message.success('Đã hủy flash sale'); invalidate() },
    onError: () => message.error('Hủy thất bại'),
  })

  function openCreate() {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  function openEdit(sale: FlashSale) {
    setEditing(sale)
    form.setFieldsValue({
      name: sale.name,
      description: sale.description,
      discountType: sale.discountType,
      discountValue: sale.discountValue,
      maxQuantity: sale.maxQuantity,
      startTime: dayjs(sale.startTime),
      endTime: dayjs(sale.endTime),
      items: sale.items.map((i) => ({
        skuId: i.skuId,
        productId: i.productId,
        productName: i.productName,
        originalPrice: i.originalPrice,
        salePrice: i.salePrice,
        quota: i.quota,
      })),
    })
    setModalOpen(true)
  }

  async function handleSubmit() {
    const values = await form.validateFields()
    const req = buildRequest(values)
    if (editing) updateMut.mutate({ id: editing.id, req })
    else createMut.mutate(req)
  }

  const sales = data?.data?.content ?? []
  const totalElements = data?.data?.totalElements ?? 0

  const columns: ColumnsType<FlashSale> = [
    { title: 'Tên', dataIndex: 'name', ellipsis: true },
    {
      title: 'Trạng thái', dataIndex: 'status',
      render: (s: FlashSaleStatus) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
    },
    {
      title: 'Giảm giá',
      render: (_, r) => r.discountType === 'PERCENTAGE'
        ? `${r.discountValue}%`
        : `${r.discountValue.toLocaleString('vi-VN')}₫`,
    },
    { title: 'Bắt đầu', dataIndex: 'startTime', render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm') },
    { title: 'Kết thúc', dataIndex: 'endTime', render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm') },
    { title: 'Đã bán', dataIndex: 'soldQuantity' },
    {
      title: 'Hành động', width: 220,
      render: (_, r) => (
        <Space size={4}>
          {(r.status === 'DRAFT' || r.status === 'SCHEDULED') && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          )}
          {r.status === 'SCHEDULED' && (
            <Popconfirm title="Kích hoạt ngay?" onConfirm={() => activateMut.mutate(r.id)}>
              <Button size="small" type="primary" icon={<PlayCircleOutlined />}>Kích hoạt</Button>
            </Popconfirm>
          )}
          {r.status === 'ACTIVE' && (
            <Popconfirm title="Kết thúc sớm?" onConfirm={() => endMut.mutate(r.id)}>
              <Button size="small" icon={<StopOutlined />} danger>Kết thúc</Button>
            </Popconfirm>
          )}
          {(r.status === 'DRAFT' || r.status === 'SCHEDULED' || r.status === 'ACTIVE') && (
            <Popconfirm title="Hủy flash sale?" onConfirm={() => cancelMut.mutate(r.id)}>
              <Button size="small" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <AdminLayout>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />
              Flash Sale
            </Title>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo mới</Button>
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={sales}
          loading={isLoading}
          pagination={{
            current: page + 1, pageSize: 10, total: totalElements,
            onChange: (p) => setPage(p - 1), showSizeChanger: false,
          }}
          expandable={{
            expandedRowRender: (r) => (
              <Table rowKey="id" size="small" dataSource={r.items} pagination={false} columns={ITEM_COLUMNS} />
            ),
          }}
        />
      </Card>

      <Modal
        title={editing ? 'Cập nhật Flash Sale' : 'Tạo Flash Sale'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="name" label="Tên chương trình" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discountType" label="Loại giảm" rules={[{ required: true }]}>
                <Select options={[
                  { label: 'Phần trăm (%)', value: 'PERCENTAGE' },
                  { label: 'Số tiền cố định (₫)', value: 'FIXED' },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="discountValue" label="Giá trị giảm" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="startTime" label="Bắt đầu" rules={[{ required: true }]}>
                <DatePicker showTime style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="endTime" label="Kết thúc" rules={[{ required: true }]}>
                <DatePicker showTime style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Divider orientation={"left" as never}>Sản phẩm flash sale</Divider>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Card key={key} size="small" style={{ marginBottom: 8 }}>
                    <FlashSaleItemRow name={name} onRemove={() => remove(name)} />
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Thêm sản phẩm
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </AdminLayout>
  )
}
