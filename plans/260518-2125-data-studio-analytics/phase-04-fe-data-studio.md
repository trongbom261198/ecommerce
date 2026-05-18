---
phase: 4
title: "FE Data Studio — Monaco Editor + Results UI"
status: complete
effort: 10h
---

# Phase 4 — Frontend Data Studio Page

## Context Links
- Plan: [plan.md](plan.md)
- Phase 3 (Spring API): [phase-03-analytics-service.md](phase-03-analytics-service.md)
- Existing admin page pattern: `FE/src/pages/admin/AdminDashboardPage.tsx`
- AdminLayout: `FE/src/components/layout/AdminLayout.tsx`
- API service pattern: `FE/src/services/adminService.ts`

## Overview
- **Priority**: P1 — user-facing feature
- **Status**: pending

Trang `/admin/data-studio` với:
- Monaco Editor cho SQL / Python / R
- Dataset browser (sidebar)
- Thực thi query + hiển thị kết quả (bảng + chart)
- Query history panel
- Export kết quả CSV

## Requirements

**Functional:**
- Monaco Editor với syntax highlight SQL/Python/R
- Language switcher (tab selector)
- Nút Run (Ctrl+Enter shortcut)
- Loading spinner trong khi chờ kết quả
- Hiển thị kết quả: Ant Design Table (pagination 100 rows/page)
- Toggle Chart view: BarChart từ Recharts (cột X = cột đầu, Y = cột số đầu tiên)
- Dataset browser: list file Parquet từ `/analytics/datasets`
- Click dataset → insert snippet `SELECT * FROM read_parquet('s3://...') LIMIT 100` vào editor
- Query history: 10 queries gần nhất, click → load lại vào editor
- Export: Download kết quả dưới dạng CSV
- Error display: show error message từ backend

**Non-functional:**
- Monaco lazy-load (bundle lớn ~2MB) — chỉ load khi vào trang
- Debounce auto-save code vào localStorage (draft per language)
- Mobile responsive tối thiểu: editor stack trên results

## Architecture

```
FE/src/
├── pages/admin/
│   └── AdminDataStudioPage.tsx        # main page (< 200 lines)
├── components/data-studio/
│   ├── QueryEditor.tsx                 # Monaco Editor wrapper
│   ├── QueryResults.tsx                # Table + Chart toggle
│   ├── DatasetBrowser.tsx              # Sidebar dataset list
│   ├── QueryHistory.tsx                # History panel
│   └── use-query-executor.ts           # custom hook for execution logic
└── services/
    └── analytics-service.ts            # API calls to analytics-service
```

## New package cần cài

```bash
npm install @monaco-editor/react
```

`@monaco-editor/react` = wrapper nhẹ, lazy-load Monaco từ CDN hoặc bundle. Không cần cấu hình webpack phức tạp.

## Key Implementation Details

### services/analytics-service.ts

```typescript
import api from './api'

export type QueryLanguage = 'sql' | 'python' | 'r'

export interface ExecuteRequest {
  language: QueryLanguage
  code: string
  timeout?: number
}

export interface ExecuteResponse {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executionMs: number
  truncated: boolean
  error: string | null
}

export interface Dataset {
  key: string
  size: number
  lastModified: string
}

export const analyticsService = {
  execute: (req: ExecuteRequest) =>
    api.post<ExecuteResponse>('/analytics/execute', req).then(r => r.data),

  listDatasets: () =>
    api.get<{ datasets: Dataset[] }>('/analytics/datasets').then(r => r.data.datasets),

  getHistory: () =>
    api.get<{ content: HistoryItem[] }>('/analytics/history').then(r => r.data.content),
}

export interface HistoryItem {
  id: string
  language: QueryLanguage
  code: string
  rowCount: number
  execMs: number
  status: 'success' | 'error'
  createdAt: string
}
```

### components/data-studio/use-query-executor.ts

```typescript
import { useState, useCallback } from 'react'
import { analyticsService, ExecuteResponse, QueryLanguage } from '@/services/analytics-service'
import { message } from 'antd'

export function useQueryExecutor() {
  const [result, setResult] = useState<ExecuteResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const execute = useCallback(async (language: QueryLanguage, code: string) => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const res = await analyticsService.execute({ language, code })
      setResult(res)
      if (res.error) message.error(res.error)
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? 'Lỗi thực thi')
    } finally {
      setLoading(false)
    }
  }, [])

  return { result, loading, execute }
}
```

### components/data-studio/QueryEditor.tsx

```typescript
import { useRef, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { Button, Select, Space, Tooltip } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import type { QueryLanguage } from '@/services/analytics-service'

const LANG_MAP: Record<QueryLanguage, string> = {
  sql: 'sql',
  python: 'python',
  r: 'r',
}

const PLACEHOLDERS: Record<QueryLanguage, string> = {
  sql: `-- Ví dụ: truy vấn Parquet từ MinIO
SELECT status, COUNT(*) as total, SUM(total_amount) as revenue
FROM read_parquet('s3://analytics-data/exports/orders.parquet')
GROUP BY status
ORDER BY total DESC;`,
  python: `# Ví dụ: phân tích với pandas
# Kết quả phải gán vào biến _result (DataFrame)
import pandas as pd
df = pd.read_parquet("s3://analytics-data/exports/orders.parquet")
_result = df.groupby('status')['total_amount'].agg(['count','sum']).reset_index()`,
  r: `# Ví dụ: phân tích với R dplyr
# Kết quả phải gán vào biến _result (data.frame)
library(dplyr)
df <- arrow::read_parquet("s3://analytics-data/exports/orders.parquet")
_result <- df |> group_by(status) |> summarise(total = n(), revenue = sum(total_amount))`,
}

interface Props {
  language: QueryLanguage
  onLanguageChange: (lang: QueryLanguage) => void
  onRun: (code: string) => void
  loading: boolean
}

export default function QueryEditor({ language, onLanguageChange, onRun, loading }: Props) {
  const editorRef = useRef<any>(null)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.Enter
      2048 | 3,
      () => onRun(editor.getValue()),
    )
    // restore draft from localStorage
    const draft = localStorage.getItem(`ds_draft_${language}`)
    if (draft) editor.setValue(draft)
    else editor.setValue(PLACEHOLDERS[language])
  }

  // save draft on language switch
  const handleLanguageChange = (lang: QueryLanguage) => {
    if (editorRef.current) {
      localStorage.setItem(`ds_draft_${language}`, editorRef.current.getValue())
    }
    onLanguageChange(lang)
    // restore next language draft
    const next = localStorage.getItem(`ds_draft_${lang}`) ?? PLACEHOLDERS[lang]
    setTimeout(() => editorRef.current?.setValue(next), 50)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space>
        <Select
          value={language}
          onChange={handleLanguageChange}
          options={[
            { value: 'sql', label: 'SQL (DuckDB)' },
            { value: 'python', label: 'Python (pandas)' },
            { value: 'r', label: 'R (dplyr)' },
          ]}
          style={{ width: 160 }}
        />
        <Tooltip title="Chạy (Ctrl+Enter)">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={loading}
            onClick={() => onRun(editorRef.current?.getValue() ?? '')}
          >
            Chạy
          </Button>
        </Tooltip>
      </Space>

      <Editor
        height="280px"
        language={LANG_MAP[language]}
        theme="vs-dark"
        onMount={handleMount}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          tabSize: 2,
        }}
      />
    </div>
  )
}
```

### components/data-studio/QueryResults.tsx

```typescript
import { useState } from 'react'
import { Table, Button, Space, Tag, Typography, Empty } from 'antd'
import { BarChartOutlined, TableOutlined, DownloadOutlined } from '@ant-design/icons'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { ExecuteResponse } from '@/services/analytics-service'

const { Text } = Typography

function exportCsv(result: ExecuteResponse) {
  const lines = [result.columns.join(',')]
  result.rows.forEach(row => lines.push(row.map(c => JSON.stringify(c ?? '')).join(',')))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'result.csv'; a.click()
  URL.revokeObjectURL(url)
}

interface Props { result: ExecuteResponse | null; loading: boolean }

export default function QueryResults({ result, loading }: Props) {
  const [view, setView] = useState<'table' | 'chart'>('table')

  if (!result && !loading) return <Empty description="Chưa có kết quả" />
  if (result?.error) return (
    <div style={{ padding: 16, background: '#fff1f0', borderRadius: 8, color: '#cf1322' }}>
      <Text strong>Lỗi: </Text><Text>{result.error}</Text>
    </div>
  )

  const columns = (result?.columns ?? []).map(col => ({
    title: col, dataIndex: col, key: col, ellipsis: true,
    render: (v: any) => v == null ? <Text type="secondary">null</Text> : String(v),
  }))

  const dataSource = (result?.rows ?? []).map((row, i) => ({
    _key: i,
    ...Object.fromEntries((result?.columns ?? []).map((c, j) => [c, row[j]])),
  }))

  // Chart: x = first column, y = first numeric column
  const numericCol = result?.columns.find((_, i) =>
    result.rows.some(r => typeof r[i] === 'number')
  ) ?? result?.columns[1]
  const xCol = result?.columns[0] ?? ''

  return (
    <div>
      <Space style={{ marginBottom: 8 }} align="center">
        <Text type="secondary" style={{ fontSize: 12 }}>
          {result?.rowCount.toLocaleString('vi-VN')} dòng
          {result?.truncated && <Tag color="orange" style={{ marginLeft: 8 }}>Đã giới hạn 10.000</Tag>}
          {result && <Text type="secondary"> · {result.executionMs}ms</Text>}
        </Text>
        <Button.Group size="small">
          <Button icon={<TableOutlined />} type={view === 'table' ? 'primary' : 'default'} onClick={() => setView('table')} />
          <Button icon={<BarChartOutlined />} type={view === 'chart' ? 'primary' : 'default'} onClick={() => setView('chart')} />
        </Button.Group>
        {result && <Button size="small" icon={<DownloadOutlined />} onClick={() => exportCsv(result)}>CSV</Button>}
      </Space>

      {view === 'table' ? (
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey="_key"
          loading={loading}
          size="small"
          scroll={{ x: true }}
          pagination={{ pageSize: 100, showSizeChanger: false, showTotal: t => `${t} dòng` }}
        />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
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
```

### components/data-studio/DatasetBrowser.tsx

```typescript
import { useQuery } from '@tanstack/react-query'
import { List, Typography, Skeleton, Tooltip } from 'antd'
import { FileOutlined } from '@ant-design/icons'
import { analyticsService } from '@/services/analytics-service'

const { Text } = Typography

interface Props { onInsert: (snippet: string) => void }

export default function DatasetBrowser({ onInsert }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-datasets'],
    queryFn: analyticsService.listDatasets,
  })

  const handleClick = (key: string) => {
    const snippet = `SELECT * FROM read_parquet('s3://analytics-data/${key}') LIMIT 100;`
    onInsert(snippet)
  }

  return (
    <div>
      <Text strong style={{ fontSize: 12, color: '#6b7280' }}>DATASETS</Text>
      {isLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : (
        <List
          size="small"
          dataSource={data ?? []}
          renderItem={item => (
            <List.Item
              style={{ cursor: 'pointer', padding: '4px 0' }}
              onClick={() => handleClick(item.key)}
            >
              <Tooltip title="Click để insert query">
                <Space>
                  <FileOutlined style={{ color: '#2563eb' }} />
                  <Text style={{ fontSize: 12 }} ellipsis>{item.key.split('/').pop()}</Text>
                </Space>
              </Tooltip>
            </List.Item>
          )}
        />
      )}
    </div>
  )
}
```

### pages/admin/AdminDataStudioPage.tsx

```typescript
import { useState } from 'react'
import { Card, Row, Col } from 'antd'
import AdminLayout from '@/components/layout/AdminLayout'
import QueryEditor from '@/components/data-studio/QueryEditor'
import QueryResults from '@/components/data-studio/QueryResults'
import DatasetBrowser from '@/components/data-studio/DatasetBrowser'
import { useQueryExecutor } from '@/components/data-studio/use-query-executor'
import type { QueryLanguage } from '@/services/analytics-service'

export default function AdminDataStudioPage() {
  const [language, setLanguage] = useState<QueryLanguage>('sql')
  const { result, loading, execute } = useQueryExecutor()
  const [editorRef, setEditorRef] = useState<any>(null)

  const handleInsertSnippet = (snippet: string) => {
    if (editorRef) editorRef.setValue(snippet)
  }

  return (
    <AdminLayout>
      <Row gutter={[16, 16]}>
        {/* Sidebar: datasets */}
        <Col xs={24} lg={5}>
          <Card size="small" style={{ minHeight: 400 }}>
            <DatasetBrowser onInsert={handleInsertSnippet} />
          </Card>
        </Col>

        {/* Main: editor + results */}
        <Col xs={24} lg={19}>
          <Card size="small" style={{ marginBottom: 16 }}>
            <QueryEditor
              language={language}
              onLanguageChange={setLanguage}
              onRun={(code) => execute(language, code)}
              loading={loading}
              onEditorMount={setEditorRef}
            />
          </Card>
          <Card size="small" title="Kết quả">
            <QueryResults result={result} loading={loading} />
          </Card>
        </Col>
      </Row>
    </AdminLayout>
  )
}
```

### App.tsx — thêm route

```typescript
// Thêm import:
const AdminDataStudioPage = lazy(() => import('./pages/admin/AdminDataStudioPage'))

// Thêm route trong <Routes>:
<Route
  path="/admin/data-studio"
  element={
    <AdminRoute>
      <AdminDataStudioPage />
    </AdminRoute>
  }
/>
```

### AdminLayout.tsx — thêm nav item

```typescript
// Trong NAV_ITEMS array, thêm sau analytics:
{ key: '/admin/data-studio', label: 'Thống kê dữ liệu', icon: <CodeOutlined />, exact: false, group: 'Tổng quan' },

// Thêm import:
import { CodeOutlined } from '@ant-design/icons'
```

## Todo List
- [ ] `npm install @monaco-editor/react`
- [ ] Tạo `FE/src/services/analytics-service.ts`
- [ ] Tạo `FE/src/components/data-studio/use-query-executor.ts`
- [ ] Tạo `FE/src/components/data-studio/QueryEditor.tsx`
- [ ] Tạo `FE/src/components/data-studio/QueryResults.tsx`
- [ ] Tạo `FE/src/components/data-studio/DatasetBrowser.tsx`
- [ ] Tạo `FE/src/pages/admin/AdminDataStudioPage.tsx`
- [ ] Cập nhật `FE/src/App.tsx` — thêm route `/admin/data-studio`
- [ ] Cập nhật `FE/src/components/layout/AdminLayout.tsx` — thêm nav item
- [ ] Test: trang mở được, Monaco Editor render
- [ ] Test: Ctrl+Enter trigger execute
- [ ] Test: click dataset → insert snippet vào editor
- [ ] Test: kết quả bảng + toggle chart
- [ ] Test: export CSV download

## Success Criteria
- `/admin/data-studio` render không lỗi
- Monaco Editor với syntax highlight SQL hiển thị đúng
- Ctrl+Enter và nút Chạy → POST `/analytics/execute` → kết quả hiển thị
- Toggle table ↔ chart hoạt động
- Click Parquet file trong sidebar → insert snippet SQL
- CSV export download file đúng

## Risk Assessment
- **Monaco bundle size ~2MB**: dùng `@monaco-editor/react` lazy import — chỉ load khi vào trang, không ảnh hưởng initial load
- **R syntax highlight**: Monaco không có built-in R lang — dùng `'r'` language ID từ Monaco community hoặc fallback `'plaintext'`
- **CORS**: analytics-service phải có CORS config cho FE origin

## Security
- Trang chỉ accessible với AdminRoute guard (user.role === 'ADMIN')
- Code không được eval trên FE — gửi raw string tới backend
