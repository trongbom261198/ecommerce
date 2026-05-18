import { useRef, useState } from 'react'
import { Col, Form, Input, InputNumber, Row, Select, Avatar, Space, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/adminService'
import { getImageUrl } from '@/utils/image'
import type { Product } from '@/types/product'

const { Text } = Typography

interface Props {
  name: number
  onRemove: () => void
}

export default function FlashSaleItemRow({ name, onRemove }: Props) {
  const form = Form.useFormInstance()
  const [search, setSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  // Ref cache — keeps product objects alive across search refetches
  const cache = useRef<Map<string, Product>>(new Map())

  const { data, isFetching } = useQuery({
    queryKey: ['products-search', search],
    queryFn: () => adminService.searchProducts(search, 15),
    staleTime: 10_000,
  })

  // Fetch SKUs for selected product via dedicated endpoint (more reliable than embedded skus)
  const { data: skusData } = useQuery({
    queryKey: ['product-skus-flash', selectedProductId],
    queryFn: () => adminService.getProductSkus(selectedProductId!),
    enabled: !!selectedProductId,
    staleTime: 30_000,
  })

  const products = data?.data?.content ?? []
  const skus = skusData?.data ?? []
  // Populate cache on every render so selected product survives search changes
  products.forEach((p) => cache.current.set(p.id, p))

  function handleProductChange(productId: string) {
    const product = cache.current.get(productId) ?? null
    setSelectedProductId(productId)
    // Reset dependent fields
    form.setFields([
      { name: ['items', name, 'productName'], value: product?.name ?? '' },
      { name: ['items', name, 'skuId'], value: undefined },
      { name: ['items', name, 'originalPrice'], value: undefined },
    ])
  }

  function handleSkuChange(skuId: string) {
    const sku = skus.find((s) => s.id === skuId)
    if (sku) {
      form.setFields([{ name: ['items', name, 'originalPrice'], value: Number(sku.price) }])
    }
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: (
      <Space size={8}>
        <Avatar
          shape="square"
          size={28}
          src={getImageUrl(p.images?.[0])}
          style={{ background: '#f0f0f0', flexShrink: 0 }}
        >
          {p.name.charAt(0)}
        </Avatar>
        <div style={{ lineHeight: 1.3 }}>
          <Text style={{ fontSize: 13 }}>{p.name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {Number(p.basePrice).toLocaleString('vi-VN')}₫ · {p.skus.length} SKU
          </Text>
        </div>
      </Space>
    ),
  }))

  const skuOptions = skus.map((s) => ({
    value: s.id,
    label: (
      <div style={{ lineHeight: 1.3 }}>
        <Text style={{ fontSize: 13 }}>{s.variantName || s.skuCode}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 11 }}>
          {Number(s.price).toLocaleString('vi-VN')}₫ · {s.skuCode}
        </Text>
      </div>
    ),
  }))

  return (
    <Row gutter={[8, 0]}>
      {/* Product */}
      <Col span={10}>
        <Form.Item
          name={[name, 'productId']}
          label="Sản phẩm"
          rules={[{ required: true, message: 'Chọn sản phẩm' }]}
        >
          <Select
            showSearch
            filterOption={false}
            placeholder="Tìm theo tên sản phẩm..."
            loading={isFetching}
            onSearch={setSearch}
            onChange={handleProductChange}
            options={productOptions}
            notFoundContent={isFetching ? 'Đang tải...' : 'Không tìm thấy'}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Col>

      {/* SKU — enabled only after product is chosen */}
      <Col span={8}>
        <Form.Item
          name={[name, 'skuId']}
          label="SKU / Biến thể"
          rules={[{ required: true, message: 'Chọn SKU' }]}
        >
          <Select
            placeholder={selectedProductId ? 'Chọn biến thể...' : 'Chọn sản phẩm trước'}
            disabled={!selectedProductId}
            onChange={handleSkuChange}
            options={skuOptions}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Col>

      {/* Remove */}
      <Col span={6}>
        <Form.Item label=" ">
          <span onClick={onRemove} style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 12 }}>
            Xóa
          </span>
        </Form.Item>
      </Col>

      {/* Hidden field — productName auto-filled from selected product */}
      <Form.Item name={[name, 'productName']} hidden>
        <Input />
      </Form.Item>

      {/* Prices and quota */}
      <Col span={8}>
        <Form.Item name={[name, 'originalPrice']} label="Giá gốc">
          <InputNumber
            disabled
            style={{ width: '100%' }}
            formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
          />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item
          name={[name, 'salePrice']}
          label="Giá sale"
          rules={[{ required: true, message: 'Nhập giá sale' }]}
        >
          <InputNumber
            min={0}
            style={{ width: '100%' }}
            formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
          />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item
          name={[name, 'quota']}
          label="Số lượng"
          rules={[{ required: true, message: 'Nhập số lượng' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
    </Row>
  )
}
