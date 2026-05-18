import { useCallback, useRef, useState } from 'react'
import { Button, Card, Col, Row, Tooltip } from 'antd'
import { DatabaseOutlined } from '@ant-design/icons'
import AdminLayout from '@/components/layout/AdminLayout'
import QueryEditor from '@/components/data-studio/QueryEditor'
import QueryResults from '@/components/data-studio/QueryResults'
import DatasetBrowser from '@/components/data-studio/DatasetBrowser'
import QueryHistory from '@/components/data-studio/QueryHistory'
import { useQueryExecutor } from '@/components/data-studio/use-query-executor'
import { analyticsService } from '@/services/analyticsService'
import { message } from 'antd'
import type { QueryLanguage } from '@/services/analyticsService'

export default function AdminDataStudioPage() {
  const [language, setLanguage] = useState<QueryLanguage>('sql')
  const { result, loading, execute } = useQueryExecutor()
  const editorRef = useRef<{ getValue: () => string; setValue: (v: string) => void } | null>(null)

  const handleInsert = useCallback((snippet: string) => {
    editorRef.current?.setValue(snippet)
  }, [])

  const handleHistoryLoad = useCallback((lang: QueryLanguage, code: string) => {
    setLanguage(lang)
    setTimeout(() => editorRef.current?.setValue(code), 80)
  }, [])

  const handlePipeline = async () => {
    try {
      const res = await analyticsService.triggerPipeline()
      message.success(res.message)
    } catch {
      message.error('Không thể khởi động pipeline')
    }
  }

  return (
    <AdminLayout>
      <Row gutter={[12, 12]}>
        {/* Left sidebar */}
        <Col xs={24} lg={5}>
          <Row gutter={[0, 12]}>
            <Col span={24}>
              <Card
                size="small"
                style={{ minHeight: 200 }}
                extra={
                  <Tooltip title="Chạy pipeline xuất Parquet ngay">
                    <Button size="small" icon={<DatabaseOutlined />} onClick={handlePipeline}>
                      Xuất dữ liệu
                    </Button>
                  </Tooltip>
                }
              >
                <DatasetBrowser onInsert={handleInsert} />
              </Card>
            </Col>
            <Col span={24}>
              <Card size="small" style={{ minHeight: 160 }}>
                <QueryHistory onLoad={handleHistoryLoad} />
              </Card>
            </Col>
          </Row>
        </Col>

        {/* Main area */}
        <Col xs={24} lg={19}>
          <Card size="small" style={{ marginBottom: 12 }}>
            <QueryEditor
              language={language}
              onLanguageChange={setLanguage}
              onRun={(code) => execute(language, code)}
              loading={loading}
              onEditorMount={(editor) => {
                editorRef.current = editor as typeof editorRef.current
              }}
            />
          </Card>

          <Card size="small" title="Kết quả truy vấn">
            <QueryResults result={result} loading={loading} />
          </Card>
        </Col>
      </Row>
    </AdminLayout>
  )
}
