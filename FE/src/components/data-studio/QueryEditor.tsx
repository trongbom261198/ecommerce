import { useRef } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { Button, Select, Space, Tooltip } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import type { QueryLanguage } from '@/services/analyticsService'

const MONACO_LANG: Record<QueryLanguage, string> = { sql: 'sql', python: 'python', r: 'r' }

const PLACEHOLDERS: Record<QueryLanguage, string> = {
  sql: `-- Truy vấn DuckDB trên MinIO Parquet\nSELECT status, COUNT(*) AS total, SUM(total_amount) AS revenue\nFROM read_parquet('s3://analytics-data/exports/orders.parquet')\nGROUP BY status\nORDER BY total DESC;`,
  python: `# Phân tích với pandas — gán kết quả vào _result\nimport pandas as pd\ndf = pd.read_parquet("s3://analytics-data/exports/orders.parquet")\n_result = df.groupby('status')['total_amount'].agg(['count','sum']).reset_index()`,
  r: `# Phân tích với R — gán kết quả vào .result (dùng dấu chấm)\nlibrary(dplyr)\n.result <- data.frame(x = 1:5, y = c(2, 4, 6, 8, 10))`,
}

interface Props {
  language: QueryLanguage
  onLanguageChange: (lang: QueryLanguage) => void
  onRun: (code: string) => void
  loading: boolean
  onEditorMount?: (editor: unknown) => void
}

export default function QueryEditor({ language, onLanguageChange, onRun, loading, onEditorMount }: Props) {
  const editorRef = useRef<unknown>(null)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    onEditorMount?.(editor)
    // Ctrl+Enter / Cmd+Enter to run
    editor.addCommand(2048 | 3, () => onRun((editor as { getValue: () => string }).getValue()))
    const draft = localStorage.getItem(`ds_draft_${language}`)
    editor.setValue(draft ?? PLACEHOLDERS[language])
  }

  const handleLangChange = (lang: QueryLanguage) => {
    const editor = editorRef.current as { getValue: () => string; setValue: (v: string) => void } | null
    if (editor) localStorage.setItem(`ds_draft_${language}`, editor.getValue())
    onLanguageChange(lang)
    setTimeout(() => {
      const next = localStorage.getItem(`ds_draft_${lang}`) ?? PLACEHOLDERS[lang]
      ;(editorRef.current as { setValue: (v: string) => void } | null)?.setValue(next)
    }, 50)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space>
        <Select
          value={language}
          onChange={handleLangChange}
          style={{ width: 168 }}
          options={[
            { value: 'sql', label: 'SQL (DuckDB)' },
            { value: 'python', label: 'Python (pandas)' },
            { value: 'r', label: 'R (dplyr)' },
          ]}
        />
        <Tooltip title="Chạy truy vấn (Ctrl+Enter)">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={loading}
            onClick={() => {
              const val = (editorRef.current as { getValue: () => string } | null)?.getValue() ?? ''
              onRun(val)
            }}
          >
            Chạy
          </Button>
        </Tooltip>
      </Space>

      <Editor
        height="260px"
        language={MONACO_LANG[language]}
        theme="vs-dark"
        onMount={handleMount}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          tabSize: 2,
          automaticLayout: true,
        }}
      />
    </div>
  )
}
