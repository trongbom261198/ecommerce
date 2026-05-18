import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMemo } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import BankQRCode from '@/components/checkout/BankQRCode'
import { orderService } from '@/services/orderService'
import { flashSaleService } from '@/services/flashSaleService'
import { paymentService } from '@/services/payment-service'
import { useProvinces, useWards } from '@/hooks/useProvinces'
import { getImageUrl } from '@/utils/image'

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
const FREE_SHIPPING_THRESHOLD = 500_000

const schema = z.object({
  recipientName: z.string().min(2, 'Vui lòng nhập tên người nhận'),
  phone: z
    .string()
    .min(9, 'Số điện thoại không hợp lệ')
    .max(11, 'Số điện thoại không hợp lệ')
    .regex(/^[0-9]+$/, 'Chỉ nhập số'),
  streetAddress: z.string().min(5, 'Vui lòng nhập địa chỉ cụ thể'),
  provinceCode: z.string().min(1, 'Vui lòng chọn tỉnh/thành phố'),
  provinceName: z.string().min(1),
  wardCode: z.string().optional(),
  wardName: z.string().optional(),
  paymentMethod: z.enum(['COD', 'BANK_TRANSFER', 'VNPAY'], {
    required_error: 'Vui lòng chọn phương thức thanh toán',
  }),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function CheckoutPage() {
  const navigate = useNavigate()

  const { data: cartRes, isLoading: loadingCart } = useQuery({
    queryKey: ['cart'],
    queryFn: orderService.getCart,
  })

  const { data: flashSalesData } = useQuery({
    queryKey: ['active-flash-sales'],
    queryFn: flashSaleService.getActiveSales,
    staleTime: 30_000,
  })

  const { data: provinces = [], isLoading: loadingProvinces } = useProvinces()

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'COD' },
  })

  const provinceCode = useWatch({ control, name: 'provinceCode' })
  const paymentMethod = useWatch({ control, name: 'paymentMethod' })

  const { data: wards = [], isLoading: loadingWards } = useWards(
    provinceCode ? Number(provinceCode) : null,
  )

  const checkoutMutation = useMutation({
    mutationFn: orderService.checkout,
    onSuccess: async (res) => {
      const order = res.data
      if (!order?.id) return
      navigate(`/orders/${order.id}`)
    },
  })

  const cart = cartRes?.data
  const items = cart?.items ?? []

  // Map skuId → { saleId, salePrice } for the first matching active flash sale
  const flashEntryMap = useMemo(() => {
    const map = new Map<string, { saleId: string; salePrice: number }>()
    for (const sale of flashSalesData?.data ?? []) {
      for (const item of sale.items) {
        if (!map.has(item.skuId)) {
          map.set(item.skuId, { saleId: sale.id, salePrice: Number(item.salePrice) })
        }
      }
    }
    return map
  }, [flashSalesData])

  // Recalculate subtotal applying flash sale prices where available
  const subtotal = useMemo(() => {
    if (items.length === 0) return cart?.subtotal ?? 0
    return items.reduce((sum, item) => {
      const entry = flashEntryMap.get(item.skuId)
      const price = entry ? entry.salePrice : item.unitPrice
      return sum + price * item.quantity
    }, 0)
  }, [items, flashEntryMap, cart?.subtotal])

  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 30_000
  const total = subtotal + shippingFee

  function onSubmit(data: FormData) {
    // Find first cart item that belongs to an active flash sale
    const flashItem = items.find((i) => flashEntryMap.has(i.skuId))
    const flashEntry = flashItem ? flashEntryMap.get(flashItem.skuId) : undefined

    checkoutMutation.mutate({
      addressSnapshot: {
        recipientName: data.recipientName,
        phone: data.phone,
        streetAddress: data.streetAddress,
        ward: data.wardName ?? '',
        province: data.provinceName,
      },
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      ...(flashEntry && flashItem
        ? { flashSaleId: flashEntry.saleId, flashSaleSkuId: flashItem.skuId }
        : {}),
    })
  }

  const input =
    'w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm disabled:bg-gray-50 disabled:text-gray-400'
  const label = 'block text-sm font-medium text-gray-700 mb-1'
  const err = 'text-red-500 text-xs mt-1'

  // Transfer description used for QR (before order is created)
  const transferDesc = `Thanh toan don hang ${Date.now().toString().slice(-8)}`

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Thanh toán</h1>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ─── Left column ─── */}
            <div className="lg:col-span-2 space-y-6">

              {/* Shipping address */}
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-5">Địa chỉ giao hàng</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div className="sm:col-span-2">
                    <label className={label}>Tên người nhận *</label>
                    <input {...register('recipientName')} placeholder="Nguyễn Văn A" className={input} />
                    {errors.recipientName && <p className={err}>{errors.recipientName.message}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className={label}>Số điện thoại *</label>
                    <input {...register('phone')} placeholder="0901234567" className={input} />
                    {errors.phone && <p className={err}>{errors.phone.message}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className={label}>Địa chỉ cụ thể (số nhà, tên đường) *</label>
                    <input
                      {...register('streetAddress')}
                      placeholder="Ví dụ: 123 Nguyễn Trãi"
                      className={input}
                    />
                    {errors.streetAddress && <p className={err}>{errors.streetAddress.message}</p>}
                  </div>

                  {/* Province select */}
                  <div>
                    <label className={label}>Tỉnh / Thành phố *</label>
                    <select
                      className={input}
                      disabled={loadingProvinces}
                      {...register('provinceCode')}
                      onChange={(e) => {
                        const opt = e.target.options[e.target.selectedIndex]
                        setValue('provinceCode', e.target.value)
                        setValue('provinceName', opt.text)
                        setValue('wardCode', '')
                        setValue('wardName', '')
                      }}
                    >
                      <option value="">
                        {loadingProvinces ? 'Đang tải...' : '-- Chọn tỉnh/thành --'}
                      </option>
                      {provinces.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {errors.provinceCode && <p className={err}>{errors.provinceCode.message}</p>}
                  </div>

                  {/* Ward select */}
                  <div>
                    <label className={label}>Phường / Xã / Thị trấn</label>
                    <select
                      className={input}
                      disabled={!provinceCode || loadingWards}
                      {...register('wardCode')}
                      onChange={(e) => {
                        const opt = e.target.options[e.target.selectedIndex]
                        setValue('wardCode', e.target.value)
                        setValue('wardName', opt.text)
                      }}
                    >
                      <option value="">
                        {loadingWards
                          ? 'Đang tải...'
                          : !provinceCode
                            ? '-- Chọn tỉnh trước --'
                            : '-- Chọn phường/xã --'}
                      </option>
                      {wards.map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Hidden inputs for display names */}
                  <input type="hidden" {...register('provinceName')} />
                  <input type="hidden" {...register('wardName')} />
                </div>
              </section>

              {/* Payment method */}
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-5">
                  Phương thức thanh toán
                </h2>

                <div className="space-y-3">
                  {/* COD */}
                  <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-gray-200 cursor-pointer hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-colors">
                    <input
                      type="radio"
                      value="COD"
                      {...register('paymentMethod')}
                      className="mt-0.5 w-4 h-4 text-blue-600 flex-shrink-0"
                    />
                    <div>
                      <p className="font-medium text-gray-800 text-sm">
                        Thanh toán tiền mặt khi nhận hàng (COD)
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Trả tiền mặt trực tiếp cho nhân viên giao hàng
                      </p>
                    </div>
                  </label>

                  {/* Bank transfer */}
                  <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-gray-200 cursor-pointer hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-colors">
                    <input
                      type="radio"
                      value="BANK_TRANSFER"
                      {...register('paymentMethod')}
                      className="mt-0.5 w-4 h-4 text-blue-600 flex-shrink-0"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 text-sm">
                        Chuyển khoản ngân hàng
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Quét mã QR hoặc chuyển khoản thủ công — đơn hàng xác nhận sau khi nhận tiền
                      </p>
                    </div>
                  </label>

                  {/* VNPay */}
                  <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-gray-200 cursor-pointer hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-colors">
                    <input
                      type="radio"
                      value="VNPAY"
                      {...register('paymentMethod')}
                      className="mt-0.5 w-4 h-4 text-blue-600 flex-shrink-0"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 text-sm">
                        Thanh toán qua VNPay 🏦
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Quét mã QR VNPay để chuyển khoản trực tiếp — nhanh, an toàn
                      </p>
                    </div>
                  </label>
                </div>

                {errors.paymentMethod && <p className={err}>{errors.paymentMethod.message}</p>}

                {/* Show QR for both BANK_TRANSFER and VNPAY (direct QR transfer) */}
                {(paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'VNPAY') && total > 0 && (
                  <BankQRCode amount={total} description={transferDesc} />
                )}
              </section>

              {/* Notes */}
              <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Ghi chú đơn hàng</h2>
                <textarea
                  {...register('notes')}
                  rows={3}
                  placeholder="Ghi chú cho người giao hàng (không bắt buộc)..."
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                />
              </section>
            </div>

            {/* ─── Right column: Order summary ─── */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sticky top-20">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Đơn hàng của bạn</h2>

                {loadingCart ? (
                  <div className="space-y-3 animate-pulse">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 bg-gray-200 rounded" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-5 max-h-64 overflow-y-auto pr-1">
                      {items.map((item) => (
                        <div key={item.skuId} className="flex gap-3">
                          <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                            {item.images?.[0] ? (
                              <img
                                src={getImageUrl(item.images[0])}
                                alt={item.productName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
                              {item.productName}
                            </p>
                            {item.variantName && (
                              <p className="text-xs text-gray-400">{item.variantName}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-500">x{item.quantity}</p>
                            {flashEntryMap.has(item.skuId) ? (
                              <div>
                                <p className="text-xs font-bold text-red-500">
                                  {vndFormatter.format(
                                    flashEntryMap.get(item.skuId)!.salePrice * item.quantity,
                                  )}
                                </p>
                                <p className="text-xs text-gray-400 line-through">
                                  {vndFormatter.format(item.unitPrice * item.quantity)}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs font-bold text-blue-600">
                                {vndFormatter.format(item.unitPrice * item.quantity)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-200 pt-4 space-y-2 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Tạm tính</span>
                        <span>{vndFormatter.format(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Phí vận chuyển</span>
                        {shippingFee === 0 ? (
                          <span className="text-green-600 font-medium">Miễn phí</span>
                        ) : (
                          <span>{vndFormatter.format(shippingFee)}</span>
                        )}
                      </div>
                      {subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD && (
                        <p className="text-xs text-orange-500">
                          Mua thêm {vndFormatter.format(FREE_SHIPPING_THRESHOLD - subtotal)} để
                          được miễn phí vận chuyển
                        </p>
                      )}
                      <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100 text-base">
                        <span>Tổng cộng</span>
                        <span className="text-blue-600">{vndFormatter.format(total)}</span>
                      </div>
                    </div>
                  </>
                )}

                {checkoutMutation.isError && (
                  <p className="mt-4 text-red-500 text-sm text-center">
                    Đặt hàng thất bại. Vui lòng thử lại.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={checkoutMutation.isPending || items.length === 0}
                  className="mt-5 w-full py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md text-sm"
                >
                  {checkoutMutation.isPending
                    ? 'Đang xử lý...'
                    : (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'VNPAY')
                      ? 'Xác nhận đã chuyển khoản & Đặt hàng'
                      : 'Đặt hàng'}
                </button>

                <p className="mt-3 text-xs text-gray-400 text-center">
                  Bằng cách đặt hàng, bạn đồng ý với điều khoản sử dụng của chúng tôi.
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </MainLayout>
  )
}
