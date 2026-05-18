import { useState } from 'react'

interface Props {
  amount: number
  description: string
}

const BANK_ID = '970436'            // Vietcombank (VCB)
const ACCOUNT_NO = '0011004455514'
const ACCOUNT_NAME = 'NGUYEN VAN TRONG'

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

export default function BankQRCode({ amount, description }: Props) {
  const [imgError, setImgError] = useState(false)

  // qr_only = pure QR image (square, scannable). Amount must be integer (VND has no decimals).
  const qrUrl =
    `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-qr_only.png` +
    `?amount=${Math.round(amount)}` +
    `&addInfo=${encodeURIComponent(description)}` +
    `&accountName=${encodeURIComponent(ACCOUNT_NAME)}`

  return (
    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
      <p className="text-sm font-semibold text-blue-800 mb-3">Thông tin chuyển khoản</p>

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        {/* QR Code */}
        <div className="flex-shrink-0 flex flex-col items-center">
          {imgError ? (
            <div className="w-52 h-52 rounded-lg border border-blue-200 bg-white flex items-center justify-center text-xs text-gray-400 text-center px-2">
              Không tải được QR.<br />Vui lòng chuyển khoản thủ công.
            </div>
          ) : (
            <img
              src={qrUrl}
              alt="VietQR"
              className="w-52 h-52 rounded-lg border border-blue-200 bg-white object-contain"
              onError={() => setImgError(true)}
            />
          )}
          <p className="text-xs text-center text-blue-600 mt-1.5">Quét QR bằng app ngân hàng</p>
        </div>

        {/* Bank details */}
        <div className="flex-1 space-y-2.5 text-sm w-full">
          <Row label="Ngân hàng" value="Vietcombank (VCB)" />
          <Row label="Số tài khoản" value={ACCOUNT_NO} copyable />
          <Row label="Chủ tài khoản" value={ACCOUNT_NAME} />
          <Row label="Số tiền" value={vndFormatter.format(Math.round(amount))} highlight copyable={String(Math.round(amount))} />
          <Row label="Nội dung CK" value={description} copyable />
        </div>
      </div>

      <p className="mt-3 text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2">
        Vui lòng chuyển khoản <strong>đúng số tiền và nội dung</strong>. Đơn hàng sẽ được xử lý sau khi xác nhận thanh toán.
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  copyable,
  highlight,
}: {
  label: string
  value: string
  copyable?: boolean | string
  highlight?: boolean
}) {
  const copyText = typeof copyable === 'string' ? copyable : value

  function copy() {
    navigator.clipboard.writeText(copyText).catch(() => {})
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <div className="flex items-center gap-1">
        <span className={`font-semibold ${highlight ? 'text-red-600 text-base' : 'text-gray-800'}`}>
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            className="text-blue-500 hover:text-blue-700 text-xs border border-blue-300 rounded px-1.5 py-0.5 ml-1"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  )
}
