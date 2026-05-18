import { useState } from 'react'
import { Button, Empty, Table, Tag, Typography } from 'antd'
import { BarChartOutlined, DownloadOutlined, TableOutlined } from '@ant-design/icons'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ExecuteResponse } from '@/services/analyticsService'

const { Text } = Typography

function exportCsv(result: ExecuteResponse) {
  const lines = [result.columns.join(',')]
  result.rows.forEach((row) =>
    lines.push(row.map((c) => JSON.stringify(c ?? '')).join(',')),
  )
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'result.csv'
  a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  result: ExecuteResponse | null
  loading: boolean
}

export default function QueryResults({ result, loading }: Props) {
  const [view, setView] = useState<'table' | 'chart'>('table')

  if (!result && !loading) return <Empty description="Chưa có kết quả — hãy chạy một truy vấn" />

  if (result?.error) {
    return (
      <div style={{ padding: 16, background: '#fff1f0', borderRadius: 8 }}>
        <Text strong style={{ color: '#cf1322' }}>Lỗi: </Text>
        <Text style={{ color: '#cf1322', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {result.error}
        </Text>
      </div>
    )
  }

  const columns = (result?.columns ?? []).map((col) => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
    render: (v: unknown) =>
      v == null ? <Text type="secondary">null</Text> : String(v),
  }))

  const dataSource = (result?.rows ?? []).map((row, i) => ({
    _key: i,
    ...Object.fromEntries((result?.columns ?? []).map((c, j) => [c, row[j]])),
  }))

  const numericColIdx = result?.columns.findIndex((_, i) =>
    result.rows.some((r) => typeof r[i] === 'number'),
  ) ?? -1
  const numericCol = numericColIdx >= 0 ? result!.columns[numericColIdx] : undefined
  const xCol = result?.columns[0] ?? ''

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {result?.rowCount.toLocaleString('vi-VN')} dòng
          {result?.truncated && (
            <Tag color="orange" style={{ marginLeft: 8 }}>Giới hạn 10.000</Tag>
          )}
          {result && (
            <Text type="secondary"> · {result.executionMs}ms</Text>
          )}
        </Text>
        <Button.Group size="small">
          <Button
            icon={<TableOutlined />}
            type={view === 'table' ? 'primary' : 'default'}
            onClick={() => setView('table')}
          />
          <Button
            icon={<BarChartOutlined />}
            type={view === 'chart' ? 'primary' : 'default'}
            onClick={() => setView('chart')}
          />
        </Button.Group>
        {result && (
          <Button size="small" icon={<DownloadOutlined />} onClick={() => exportCsv(result)}>
            CSV
          </Button>
        )}
      </div>

      {view === 'table' ? (
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey="_key"
          loading={loading}
          size="small"
          scroll={{ x: true }}
          pagination={{ pageSize: 100, showSizeChanger: false, showTotal: (t) => `${t} dòng` }}
        />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dataSource} margin={{ top: 4, right: 4, left: -20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={xCol} tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey={numericCol ?? ''} fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
