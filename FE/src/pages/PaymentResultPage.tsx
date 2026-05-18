import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'

export default function PaymentResultPage() {
  const [params] = useSearchParams()
  const success = params.get('vnp_ResponseCode') === '00'
  const txnRef = params.get('vnp_TxnRef') ?? ''
  // txnRef format: "ORDERNUM-timestamp" — extract order number before the last dash+timestamp
  const orderNum = txnRef.includes('-') ? txnRef.substring(0, txnRef.lastIndexOf('-')) : txnRef

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        {success ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Thanh toán thành công!</h1>
            <p className="text-gray-500 mb-6">
              Đơn hàng <span className="font-semibold text-gray-700">#{orderNum}</span> đã được thanh toán.
            </p>
            <Link
              to="/orders"
              className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors text-sm"
            >
              Xem đơn hàng
            </Link>
          </>
        ) : (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Thanh toán thất bại</h1>
            <p className="text-gray-500 mb-6">
              Đơn hàng chưa được thanh toán. Vui lòng thử lại.
            </p>
            <Link
              to="/cart"
              className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors text-sm"
            >
              Quay lại giỏ hàng
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
